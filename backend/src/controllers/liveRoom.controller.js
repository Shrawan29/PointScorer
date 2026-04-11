import mongoose from 'mongoose';

import Friend from '../models/Friend.model.js';
import LiveRoom from '../models/LiveRoom.model.js';
import MatchHistory from '../models/MatchHistory.model.js';
import MatchSession from '../models/MatchSession.model.js';
import PlayerSelection from '../models/PlayerSelection.model.js';
import RuleSet from '../models/RuleSet.model.js';
import User from '../models/User.model.js';
import { getUserPresence, markUserOnline } from '../services/presence.service.js';
import { scrapeTodayAndLiveMatches, scrapeUpcomingMatches } from '../services/scraper.service.js';
import { emitLiveRoomMutation } from '../services/liveRoomRealtime.service.js';

const MAX_PLAYERS_PER_TEAM = 9;
const MIN_PLAYERS_PER_TEAM = 6;
const FIXED_LIVE_ROOM_TTL_SECONDS = 5 * 60;
const LIVE_ACTIVE_STATES = ['LOBBY', 'DRAFTING', 'CAPTAIN'];
const LIVE_ROOM_OPTIONS_MATCH_CACHE_TTL_MS = 30_000;

let liveRoomOptionsMatchCache = {
  expiresAt: 0,
  matches: [],
};
let liveRoomOptionsMatchCachePromise = null;

const getLiveRoomTtlSeconds = () => FIXED_LIVE_ROOM_TTL_SECONDS;

const maybeExtendRoomExpiry = (room) => {
  if (!room || LIVE_TERMINAL_STATES.has(String(room.status || '').toUpperCase())) return false;

  const ttlMs = getLiveRoomTtlSeconds() * 1000;
  const expiresAtMs = new Date(room.expiresAt || 0).getTime();
  if (expiresAtMs > 0) {
    return false;
  }

  const createdAtMs = new Date(room.createdAt || 0).getTime();
  const baseMs = Number.isFinite(createdAtMs) && createdAtMs > 0 ? createdAtMs : Date.now();
  room.expiresAt = new Date(baseMs + ttlMs);
  return true;
};

const isCaptainMultiplierEnabled = (ruleSet) => {
  const rules = Array.isArray(ruleSet?.rules) ? ruleSet.rules : [];
  const capRule = rules.find((r) => String(r?.event || '') === 'captainMultiplier');
  return Boolean(capRule && capRule.enabled !== false);
};

const LIVE_TERMINAL_STATES = new Set(['FROZEN', 'CANCELLED', 'EXPIRED']);

const toAppError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const buildDuplicateMatchMessage = (realMatchName) => {
  const safeName = String(realMatchName || '').trim();
  return safeName
    ? `You have already played this match (${safeName}) with this friend. You can only play each match with the same friend once.`
    : 'You have already played this match with this friend. You can only play each match with the same friend once.';
};

const hasExistingMatchForFriend = async ({ userId, friendId, realMatchId }) => {
  const [existingSession, existingHistory] = await Promise.all([
    MatchSession.findOne({ userId, friendId, realMatchId }).select('_id').lean(),
    MatchHistory.findOne({ userId, friendId, matchId: realMatchId }).select('_id').lean(),
  ]);

  return Boolean(existingSession || existingHistory);
};

const normalizeName = (value) =>
  String(value || '')
    .replace(/[\u2020†*]/g, '')
    .replace(/\[(?:[^\]]*)\]/g, '')
    .replace(/\((?:[^)]*)\)/g, '')
    .replace(/[,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeKey = (value) => normalizeName(value).toLowerCase();

const sanitizePlayerName = (value) => {
  const safe = normalizeName(value)
    .replace(/^[\d\s.)\-•*]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!safe || safe.length < 2 || safe.length > 45) return '';
  if (!/[A-Za-z]/.test(safe)) return '';
  return safe;
};

const normalizeFirstTurnBy = (value) => {
  const safe = String(value || '').trim().toUpperCase();
  if (safe === 'OPPONENT' || safe === 'HOST' || safe === 'GUEST') return safe;
  return 'ME';
};

const resolveInitialTurnUserId = ({ relation, requesterUserId, firstTurnBy }) => {
  const requester = String(requesterUserId || '').trim();
  const hostUserId = String(relation?.hostUserId || '').trim();
  const guestUserId = String(relation?.guestUserId || '').trim();

  if (firstTurnBy === 'HOST') return hostUserId;
  if (firstTurnBy === 'GUEST') return guestUserId;
  if (firstTurnBy === 'OPPONENT') {
    return requester === hostUserId ? guestUserId : hostUserId;
  }

  return requester;
};

const resolveRoomFirstTurnUserId = (room) => {
  const hostUserId = String(room?.hostUserId || '').trim();
  const guestUserId = String(room?.guestUserId || '').trim();
  const firstTurnUserIdRaw = String(room?.firstTurnUserId || '').trim();

  if (firstTurnUserIdRaw === hostUserId || firstTurnUserIdRaw === guestUserId) {
    return firstTurnUserIdRaw;
  }

  return hostUserId || null;
};

const getTeamCounts = (room) => ({
  hostCount: Array.isArray(room?.hostPlayers) ? room.hostPlayers.length : 0,
  guestCount: Array.isArray(room?.guestPlayers) ? room.guestPlayers.length : 0,
});

const isDraftLockEligible = (room) => {
  const counts = getTeamCounts(room);
  return (
    counts.hostCount >= MIN_PLAYERS_PER_TEAM &&
    counts.hostCount <= MAX_PLAYERS_PER_TEAM &&
    counts.guestCount >= MIN_PLAYERS_PER_TEAM &&
    counts.guestCount <= MAX_PLAYERS_PER_TEAM
  );
};

const isCaptainComplete = (room) => {
  if (!room?.captainRequired) return true;
  return Boolean(String(room?.hostCaptain || '').trim() && String(room?.guestCaptain || '').trim());
};

const toObject = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

const extractMatchId = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const match =
    raw.match(/\/live-cricket-scores\/(\d+)\//i) ||
    raw.match(/\/cricket-scores\/(\d+)\//i) ||
    raw.match(/\/live-cricket-score\/(\d+)\//i);

  return match?.[1] || null;
};

const presenceForContext = (context) => {
  markUserOnline(context.meUserId);
  const mePresence = getUserPresence(context.meUserId);
  const counterpartPresence = getUserPresence(context.counterpartUserId);

  const meOnline = Boolean(mePresence.isOnline);
  const counterpartOnline = Boolean(counterpartPresence.isOnline);

  return {
    meOnline,
    counterpartOnline,
    bothOnline: meOnline && counterpartOnline,
  };
};

const emitRoomUpdate = (room, reason) => {
  if (!room?._id) return;

  emitLiveRoomMutation({
    roomId: room._id,
    hostUserId: room.hostUserId,
    guestUserId: room.guestUserId,
    status: room.status,
    reason,
  });
};

const ensureNotExpiredRoom = async (room) => {
  if (!room || LIVE_TERMINAL_STATES.has(String(room.status || '').toUpperCase())) return room;

  const expiresAtMs = new Date(room.expiresAt || 0).getTime();
  if (expiresAtMs && expiresAtMs <= Date.now()) {
    room.status = 'EXPIRED';
    room.turnUserId = null;
    room.cancelReason = room.cancelReason || 'ROOM_TIMEOUT';
    await room.save();
    emitRoomUpdate(room, 'expired');
  }

  return room;
};

const resolveParticipantContext = ({ room, userId }) => {
  const uid = String(userId || '');
  const hostUserId = String(room?.hostUserId || '');
  const guestUserId = String(room?.guestUserId || '');

  if (uid === hostUserId) {
    return {
      meRole: 'HOST',
      meUserId: hostUserId,
      counterpartUserId: guestUserId,
      readyField: 'hostReady',
      lockField: 'hostLocked',
      playersField: 'hostPlayers',
      captainField: 'hostCaptain',
    };
  }
  if (uid === guestUserId) {
    return {
      meRole: 'GUEST',
      meUserId: guestUserId,
      counterpartUserId: hostUserId,
      readyField: 'guestReady',
      lockField: 'guestLocked',
      playersField: 'guestPlayers',
      captainField: 'guestCaptain',
    };
  }

  return null;
};

const ensureRoomParticipant = ({ room, userId }) => {
  const context = resolveParticipantContext({ room, userId });
  if (!context) throw toAppError('You are not a participant in this room', 403);
  return context;
};

const ensureBothOnlineOrCancel = async ({ room, context, actionLabel, throwOnOffline = true }) => {
  const status = presenceForContext(context);

  if (!status.bothOnline) {
    room.status = 'CANCELLED';
    room.turnUserId = null;
    room.cancelReason = `PLAYER_OFFLINE_${String(actionLabel || 'ACTION').toUpperCase()}`;
    await room.save();
    emitRoomUpdate(room, 'cancelled-offline');
    if (throwOnOffline) {
      throw toAppError('Both players must be online to continue this live room', 409);
    }
    return false;
  }

  return true;
};

const mapMatch = (m) => {
  const fallbackName = [m?.team1, m?.team2].filter(Boolean).join(' vs ');
  const candidateName = m?.matchName ?? m?.name ?? fallbackName;

  return {
    matchId: m?.matchId ?? m?.id ?? extractMatchId(m?.matchUrl || m?.url) ?? null,
    matchName: candidateName || null,
    matchStatus: m?.matchStatus ?? null,
    startTime: m?.startTime ?? null,
  };
};

const loadLiveRoomOptionMatches = async () => {
  const now = Date.now();
  if (
    Array.isArray(liveRoomOptionsMatchCache.matches) &&
    liveRoomOptionsMatchCache.matches.length > 0 &&
    liveRoomOptionsMatchCache.expiresAt > now
  ) {
    return liveRoomOptionsMatchCache.matches;
  }

  if (liveRoomOptionsMatchCachePromise) {
    return liveRoomOptionsMatchCachePromise;
  }

  liveRoomOptionsMatchCachePromise = (async () => {
    try {
      const [todayAndLive, upcoming] = await Promise.all([
        scrapeTodayAndLiveMatches().catch(() => []),
        scrapeUpcomingMatches().catch(() => []),
      ]);

      const allMatches = [
        ...(Array.isArray(todayAndLive) ? todayAndLive : []),
        ...(Array.isArray(upcoming) ? upcoming : []),
      ]
        .map(mapMatch)
        .filter((m) => m.matchId && m.matchName);

      const dedup = new Map();
      for (const m of allMatches) {
        const key = String(m.matchId);
        if (!dedup.has(key)) dedup.set(key, m);
      }

      const matches = Array.from(dedup.values());
      liveRoomOptionsMatchCache = {
        expiresAt: Date.now() + LIVE_ROOM_OPTIONS_MATCH_CACHE_TTL_MS,
        matches,
      };

      return matches;
    } catch (error) {
      if (Array.isArray(liveRoomOptionsMatchCache.matches) && liveRoomOptionsMatchCache.matches.length > 0) {
        return liveRoomOptionsMatchCache.matches;
      }
      return [];
    } finally {
      liveRoomOptionsMatchCachePromise = null;
    }
  })();

  return liveRoomOptionsMatchCachePromise;
};

const getRoomResponse = ({ room, requesterUserId }) => {
  const data = toObject(room);
  const context = resolveParticipantContext({ room: data, userId: requesterUserId });
  if (!context) return data;

  const meReady = Boolean(data?.[context.readyField]);
  const counterpartReadyField = context.readyField === 'hostReady' ? 'guestReady' : 'hostReady';
  const counterpartReady = Boolean(data?.[counterpartReadyField]);
  const meLocked = Boolean(data?.[context.lockField]);
  const counterpartLockedField = context.lockField === 'hostLocked' ? 'guestLocked' : 'hostLocked';
  const counterpartLocked = Boolean(data?.[counterpartLockedField]);
  const hostUserId = String(data?.hostUserId || '').trim();
  const resolvedFirstTurnUserId = resolveRoomFirstTurnUserId(data);
  const firstTurnMe = Boolean(resolvedFirstTurnUserId) && resolvedFirstTurnUserId === String(requesterUserId || '');
  const firstTurnRole = resolvedFirstTurnUserId
    ? resolvedFirstTurnUserId === hostUserId
      ? 'HOST'
      : 'GUEST'
    : null;
  const presence = presenceForContext(context);
  const expiresAtMs = new Date(data?.expiresAt || 0).getTime();
  const secondsToExpire = expiresAtMs
    ? Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000))
    : null;

  return {
    ...data,
    meRole: context.meRole,
    myTurn: String(data?.turnUserId || '') === String(requesterUserId || ''),
    meReady,
    counterpartReady,
    meLocked,
    counterpartLocked,
    bothLocked: meLocked && counterpartLocked,
    firstTurnUserId: resolvedFirstTurnUserId,
    firstTurnMe,
    firstTurnRole,
    meOnline: presence.meOnline,
    counterpartOnline: presence.counterpartOnline,
    bothOnline: presence.bothOnline,
    secondsToExpire,
  };
};

const getCounterpartDisplayName = ({
  room,
  requesterUserId,
  friendById = new Map(),
  hostById = new Map(),
}) => {
  const hostUserId = String(room?.hostUserId || '');
  const hostFriendId = String(room?.hostFriendId || '');
  const isHostView = hostUserId === String(requesterUserId || '');

  const friend = friendById.get(hostFriendId) || null;
  const host = hostById.get(hostUserId) || null;

  if (isHostView) return friend?.friendName || 'Friend';
  return host?.name || host?.email || friend?.friendName || 'User';
};

const withCounterpartMeta = ({
  payload,
  room,
  requesterUserId,
  friendById = new Map(),
  hostById = new Map(),
}) => ({
  ...payload,
  friendId: String(room?.hostFriendId || ''),
  counterpartDisplayName: getCounterpartDisplayName({
    room,
    requesterUserId,
    friendById,
    hostById,
  }),
});

const findFriendRelationship = async ({ friendId, userId }) => {
  if (!mongoose.Types.ObjectId.isValid(friendId)) {
    throw toAppError('Invalid friendId', 400);
  }

  const hostView = await Friend.findOne({ _id: friendId, userId });
  if (hostView) {
    if (!hostView.linkedUserId) throw toAppError('Friend is not linked to a live account yet', 409);

    return {
      relationType: 'HOST_VIEW',
      friend: hostView,
      hostUserId: String(hostView.userId),
      guestUserId: String(hostView.linkedUserId),
    };
  }

  const guestView = await Friend.findOne({ _id: friendId, linkedUserId: userId });
  if (guestView) {
    return {
      relationType: 'GUEST_VIEW',
      friend: guestView,
      hostUserId: String(guestView.userId),
      guestUserId: String(guestView.linkedUserId),
    };
  }

  throw toAppError('Linked friend relationship not found', 404);
};

const resolveRulesetForRelationship = async ({ relation, rulesetId }) => {
  if (!mongoose.Types.ObjectId.isValid(rulesetId)) {
    throw toAppError('Invalid rulesetId', 400);
  }

  const ruleSet = await RuleSet.findOne({
    _id: rulesetId,
    userId: relation.hostUserId,
    friendId: relation.friend._id,
  }).lean();

  if (!ruleSet) throw toAppError('RuleSet not found for this linked friend', 404);
  return ruleSet;
};

const finalizeRoomAndCreateSelection = async ({ room }) => {
  if (room.sessionId || String(room.status) === 'FROZEN') return room;

  const isDuplicate = await hasExistingMatchForFriend({
    userId: room.hostUserId,
    friendId: room.hostFriendId,
    realMatchId: String(room.realMatchId || '').trim(),
  });
  if (isDuplicate) {
    room.status = 'CANCELLED';
    room.turnUserId = null;
    room.cancelReason = room.cancelReason || 'DUPLICATE_MATCH';
    await room.save();
    emitRoomUpdate(room, 'cancelled-duplicate-match');
    throw toAppError(buildDuplicateMatchMessage(room.realMatchName), 409);
  }

  let session = null;
  try {
    session = await MatchSession.create({
      userId: room.hostUserId,
      friendId: room.hostFriendId,
      rulesetId: room.rulesetId,
      realMatchId: room.realMatchId,
      realMatchName: room.realMatchName,
      status: 'UPCOMING',
    });
  } catch (createError) {
    if (Number(createError?.code) === 11000) {
      room.status = 'CANCELLED';
      room.turnUserId = null;
      room.cancelReason = room.cancelReason || 'DUPLICATE_MATCH';
      await room.save();
      emitRoomUpdate(room, 'cancelled-duplicate-match');
      throw toAppError(buildDuplicateMatchMessage(room.realMatchName), 409);
    }
    throw createError;
  }

  await PlayerSelection.create({
    sessionId: session._id,
    userPlayers: room.hostPlayers,
    userCaptain: room.hostCaptain || null,
    friendPlayers: room.guestPlayers,
    friendCaptain: room.guestCaptain || null,
    selectedPlayers: room.hostPlayers,
    captain: room.hostCaptain || null,
    isFrozen: true,
  });

  room.sessionId = session._id;
  room.status = 'FROZEN';
  room.turnUserId = null;
  room.frozenAt = new Date();
  await room.save();
  emitRoomUpdate(room, 'frozen');

  return room;
};

export const getLiveRoomOptions = async (req, res, next) => {
  try {
    const { friendId } = req.params;
    const relation = await findFriendRelationship({ friendId, userId: req.userId });

    markUserOnline(req.userId);

    const [ruleSets, cachedMatches] = await Promise.all([
      RuleSet.find({
        userId: relation.hostUserId,
        friendId: relation.friend._id,
      })
        .sort({ createdAt: -1 })
        .select('_id rulesetName')
        .lean(),
      loadLiveRoomOptionMatches(),
    ]);

    const counterpartPresence = getUserPresence(
      relation.relationType === 'HOST_VIEW' ? relation.guestUserId : relation.hostUserId
    );

    let activeRoom = await LiveRoom.findOne({
      hostUserId: relation.hostUserId,
      guestUserId: relation.guestUserId,
      hostFriendId: relation.friend._id,
      status: { $in: LIVE_ACTIVE_STATES },
    }).sort({ updatedAt: -1 });
    if (activeRoom) {
      await ensureNotExpiredRoom(activeRoom);
      if (LIVE_TERMINAL_STATES.has(String(activeRoom.status || '').toUpperCase())) {
        activeRoom = null;
      } else if (maybeExtendRoomExpiry(activeRoom)) {
        await activeRoom.save();
      }
    }

    return res.status(200).json({
      relationType: relation.relationType,
      friendId: String(relation.friend._id),
      friendName: relation.friend.friendName,
      counterpartOnline: counterpartPresence.isOnline,
      activeRoomId: activeRoom?._id ? String(activeRoom._id) : null,
      activeRoomStatus: activeRoom?.status || null,
      rulesets: ruleSets,
      matches: Array.isArray(cachedMatches) ? cachedMatches : [],
    });
  } catch (error) {
    next(error);
  }
};

export const createLiveRoom = async (req, res, next) => {
  try {
    const { friendId, rulesetId, realMatchId, realMatchName } = req.body || {};
    const firstTurnBy = normalizeFirstTurnBy(req.body?.firstTurnBy);
    const safeRealMatchId = String(realMatchId || '').trim();
    const safeRealMatchName = String(realMatchName || '').trim();
    if (!friendId || !rulesetId || !safeRealMatchId || !safeRealMatchName) {
      return res.status(400).json({ message: 'friendId, rulesetId, realMatchId and realMatchName are required' });
    }

    const relation = await findFriendRelationship({ friendId, userId: req.userId });
    const ruleSet = await resolveRulesetForRelationship({ relation, rulesetId });
    const friendById = new Map([[String(relation.friend._id), relation.friend]]);

    markUserOnline(req.userId);

    const hostOnline = getUserPresence(relation.hostUserId).isOnline;
    const guestOnline = getUserPresence(relation.guestUserId).isOnline;
    if (!hostOnline || !guestOnline) {
      return res.status(409).json({ message: 'Both players must be online to create a live room' });
    }

    const requestedFirstTurnUserId = resolveInitialTurnUserId({
      relation,
      requesterUserId: req.userId,
      firstTurnBy,
    });
    const safeFirstTurnUserId =
      String(requestedFirstTurnUserId || '') === String(relation.hostUserId || '') ||
      String(requestedFirstTurnUserId || '') === String(relation.guestUserId || '')
        ? String(requestedFirstTurnUserId)
        : String(req.userId || relation.hostUserId);

    const existingRoom = await LiveRoom.findOne({
      hostUserId: relation.hostUserId,
      guestUserId: relation.guestUserId,
      hostFriendId: relation.friend._id,
      status: { $in: LIVE_ACTIVE_STATES },
    }).sort({ updatedAt: -1 });
    if (existingRoom) {
      await ensureNotExpiredRoom(existingRoom);
      if (!LIVE_TERMINAL_STATES.has(String(existingRoom.status || '').toUpperCase())) {
        const hostById = new Map();
        if (String(relation.hostUserId) !== String(req.userId)) {
          const host = await User.findById(relation.hostUserId).select('name email').lean();
          if (host) hostById.set(String(relation.hostUserId), host);
        }

        if (maybeExtendRoomExpiry(existingRoom)) {
          await existingRoom.save();
        }

        const payload = getRoomResponse({ room: existingRoom, requesterUserId: req.userId });
        return res.status(200).json({
          ...withCounterpartMeta({
            payload,
            room: existingRoom,
            requesterUserId: req.userId,
            friendById,
            hostById,
          }),
          reusedExisting: true,
        });
      }
    }

    const duplicateMatch = await hasExistingMatchForFriend({
      userId: relation.hostUserId,
      friendId: relation.friend._id,
      realMatchId: safeRealMatchId,
    });
    if (duplicateMatch) {
      return res.status(409).json({
        message: buildDuplicateMatchMessage(safeRealMatchName),
      });
    }

    const safeTtlSeconds = getLiveRoomTtlSeconds();
    const createPayload = {
      hostUserId: relation.hostUserId,
      guestUserId: relation.guestUserId,
      hostFriendId: relation.friend._id,
      rulesetId,
      realMatchId: safeRealMatchId,
      realMatchName: safeRealMatchName,
      status: 'LOBBY',
      hostReady: false,
      guestReady: false,
      hostLocked: false,
      guestLocked: false,
      firstTurnUserId: safeFirstTurnUserId,
      turnUserId: null,
      hostPlayers: [],
      guestPlayers: [],
      hostCaptain: null,
      guestCaptain: null,
      captainRequired: isCaptainMultiplierEnabled(ruleSet),
      expiresAt: new Date(Date.now() + safeTtlSeconds * 1000),
    };

    const resolveHostById = async () => {
      const hostById = new Map();
      if (String(relation.hostUserId) !== String(req.userId)) {
        const host = await User.findById(relation.hostUserId).select('name email').lean();
        if (host) hostById.set(String(relation.hostUserId), host);
      }
      return hostById;
    };

    let room = null;
    try {
      room = await LiveRoom.create(createPayload);
    } catch (createError) {
      if (Number(createError?.code) !== 11000) {
        throw createError;
      }

      const concurrentRoom = await LiveRoom.findOne({
        hostUserId: relation.hostUserId,
        guestUserId: relation.guestUserId,
        hostFriendId: relation.friend._id,
        status: { $in: LIVE_ACTIVE_STATES },
      }).sort({ updatedAt: -1 });

      if (concurrentRoom) {
        await ensureNotExpiredRoom(concurrentRoom);
        if (!LIVE_TERMINAL_STATES.has(String(concurrentRoom.status || '').toUpperCase())) {
          if (maybeExtendRoomExpiry(concurrentRoom)) {
            await concurrentRoom.save();
          }

          const hostById = await resolveHostById();
          const payload = getRoomResponse({ room: concurrentRoom, requesterUserId: req.userId });
          return res.status(200).json({
            ...withCounterpartMeta({
              payload,
              room: concurrentRoom,
              requesterUserId: req.userId,
              friendById,
              hostById,
            }),
            reusedExisting: true,
          });
        }
      }

      room = await LiveRoom.create(createPayload);
    }

    emitRoomUpdate(room, 'created');

    const hostById = await resolveHostById();

    const payload = getRoomResponse({ room, requesterUserId: req.userId });
    return res.status(201).json({
      ...withCounterpartMeta({
        payload,
        room,
        requesterUserId: req.userId,
        friendById,
        hostById,
      }),
      reusedExisting: false,
    });
  } catch (error) {
    next(error);
  }
};

export const listMyLiveRooms = async (req, res, next) => {
  try {
    markUserOnline(req.userId);

    const rooms = await LiveRoom.find({
      $or: [{ hostUserId: req.userId }, { guestUserId: req.userId }],
      status: { $in: LIVE_ACTIVE_STATES },
    }).sort({ updatedAt: -1 });

    const friendIds = Array.from(
      new Set(rooms.map((r) => String(r?.hostFriendId || '')).filter(Boolean))
    );
    const hostUserIds = Array.from(
      new Set(rooms.map((r) => String(r?.hostUserId || '')).filter(Boolean))
    );

    const [friends, hosts] = await Promise.all([
      friendIds.length > 0
        ? Friend.find({ _id: { $in: friendIds } }).select('_id friendName').lean()
        : Promise.resolve([]),
      hostUserIds.length > 0
        ? User.find({ _id: { $in: hostUserIds } }).select('_id name email').lean()
        : Promise.resolve([]),
    ]);
    const friendById = new Map(friends.map((f) => [String(f._id), f]));
    const hostById = new Map(hosts.map((u) => [String(u._id), u]));

    const out = [];
    for (const model of rooms) {
      const context = resolveParticipantContext({ room: model, userId: req.userId });
      if (!context) continue;

      await ensureNotExpiredRoom(model);
      if (LIVE_TERMINAL_STATES.has(String(model.status || '').toUpperCase())) continue;

      if (maybeExtendRoomExpiry(model)) {
        await model.save();
      }

      const payload = getRoomResponse({ room: model, requesterUserId: req.userId });
      out.push(
        withCounterpartMeta({
          payload,
          room: model,
          requesterUserId: req.userId,
          friendById,
          hostById,
        })
      );
    }

    return res.status(200).json(out);
  } catch (error) {
    next(error);
  }
};

export const getLiveRoomById = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'Invalid roomId' });
    }

    const room = await LiveRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Live room not found' });
    }

    const [friend, host] = await Promise.all([
      Friend.findById(room.hostFriendId).select('_id friendName').lean(),
      String(room.hostUserId || '') === String(req.userId || '')
        ? Promise.resolve(null)
        : User.findById(room.hostUserId).select('_id name email').lean(),
    ]);
    const friendById = new Map(friend ? [[String(friend._id), friend]] : []);
    const hostById = new Map(host ? [[String(host._id), host]] : []);

    const context = ensureRoomParticipant({ room, userId: req.userId });
    await ensureNotExpiredRoom(room);

    if (LIVE_TERMINAL_STATES.has(String(room.status || '').toUpperCase())) {
      const payload = getRoomResponse({ room, requesterUserId: req.userId });
      return res.status(200).json(
        withCounterpartMeta({
          payload,
          room,
          requesterUserId: req.userId,
          friendById,
          hostById,
        })
      );
    }

    const status = presenceForContext(context);
    if (!status.bothOnline) {
      const payload = getRoomResponse({ room, requesterUserId: req.userId });
      return res.status(200).json(
        withCounterpartMeta({
          payload,
          room,
          requesterUserId: req.userId,
          friendById,
          hostById,
        })
      );
    }

    if (maybeExtendRoomExpiry(room)) {
      await room.save();
    }

    const payload = getRoomResponse({ room, requesterUserId: req.userId });
    return res.status(200).json(
      withCounterpartMeta({
        payload,
        room,
        requesterUserId: req.userId,
        friendById,
        hostById,
      })
    );
  } catch (error) {
    next(error);
  }
};

export const setLiveRoomReady = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const ready = req.body?.ready !== false;

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'Invalid roomId' });
    }

    const room = await LiveRoom.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Live room not found' });

    const context = ensureRoomParticipant({ room, userId: req.userId });
    await ensureNotExpiredRoom(room);

    if (LIVE_TERMINAL_STATES.has(String(room.status || '').toUpperCase())) {
      return res.status(409).json({ message: `Room is ${String(room.status || '').toLowerCase()}` });
    }

    await ensureBothOnlineOrCancel({ room, context, actionLabel: 'ready' });

    maybeExtendRoomExpiry(room);

    room[context.readyField] = Boolean(ready);
    room.hostLocked = false;
    room.guestLocked = false;

    if (room.hostReady && room.guestReady) {
      const preferredFirstTurnUserId = resolveRoomFirstTurnUserId(room);

      room.status = 'DRAFTING';
      room.turnUserId =
        preferredFirstTurnUserId || room.hostUserId;
    } else if (String(room.status) !== 'LOBBY') {
      room.status = 'LOBBY';
      room.turnUserId = null;
    }

    await room.save();
    emitRoomUpdate(room, 'ready');
    return res.status(200).json(getRoomResponse({ room, requesterUserId: req.userId }));
  } catch (error) {
    next(error);
  }
};

export const pickLiveRoomPlayer = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const player = sanitizePlayerName(req.body?.player);

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'Invalid roomId' });
    }
    if (!player) {
      return res.status(400).json({ message: 'Valid player is required' });
    }

    const room = await LiveRoom.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Live room not found' });

    const context = ensureRoomParticipant({ room, userId: req.userId });
    await ensureNotExpiredRoom(room);

    if (String(room.status) !== 'DRAFTING') {
      return res.status(409).json({ message: 'Room is not in drafting state' });
    }
    if (!room.turnUserId) {
      return res.status(409).json({ message: 'Draft is complete. Lock selection to continue.' });
    }
    if (String(room.turnUserId || '') !== String(req.userId)) {
      return res.status(409).json({ message: 'Not your turn' });
    }

    await ensureBothOnlineOrCancel({ room, context, actionLabel: 'pick' });

    maybeExtendRoomExpiry(room);

    const hostPlayers = Array.isArray(room.hostPlayers) ? room.hostPlayers : [];
    const guestPlayers = Array.isArray(room.guestPlayers) ? room.guestPlayers : [];
    const allPicked = new Set([...hostPlayers, ...guestPlayers].map((p) => normalizeKey(p)));

    if (allPicked.has(normalizeKey(player))) {
      return res.status(409).json({ message: 'Player already picked in this room' });
    }

    if (context.playersField === 'hostPlayers' && hostPlayers.length >= MAX_PLAYERS_PER_TEAM) {
      return res.status(409).json({ message: 'Host team is already full' });
    }
    if (context.playersField === 'guestPlayers' && guestPlayers.length >= MAX_PLAYERS_PER_TEAM) {
      return res.status(409).json({ message: 'Guest team is already full' });
    }

    room[context.playersField] = [...(Array.isArray(room[context.playersField]) ? room[context.playersField] : []), player];
    room.hostLocked = false;
    room.guestLocked = false;

    const nextHostCount = Array.isArray(room.hostPlayers) ? room.hostPlayers.length : 0;
    const nextGuestCount = Array.isArray(room.guestPlayers) ? room.guestPlayers.length : 0;

    if (nextHostCount >= MAX_PLAYERS_PER_TEAM && nextGuestCount >= MAX_PLAYERS_PER_TEAM) {
      if (room.captainRequired) {
        room.status = 'CAPTAIN';
        room.turnUserId = resolveRoomFirstTurnUserId(room) || room.hostUserId;
      } else {
        room.turnUserId = null;
      }
      await room.save();
      emitRoomUpdate(room, 'draft-complete-lock-pending');
    } else {
      room.turnUserId = String(req.userId) === String(room.hostUserId)
        ? room.guestUserId
        : room.hostUserId;
      await room.save();
      emitRoomUpdate(room, 'pick');
    }

    return res.status(200).json(getRoomResponse({ room, requesterUserId: req.userId }));
  } catch (error) {
    next(error);
  }
};

export const selectLiveRoomCaptain = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const captain = sanitizePlayerName(req.body?.captain);

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'Invalid roomId' });
    }
    if (!captain) {
      return res.status(400).json({ message: 'Valid captain is required' });
    }

    const room = await LiveRoom.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Live room not found' });

    const context = ensureRoomParticipant({ room, userId: req.userId });
    await ensureNotExpiredRoom(room);

    if (String(room.status) !== 'CAPTAIN') {
      return res.status(409).json({ message: 'Room is not in captain selection state' });
    }
    if (!room.turnUserId) {
      return res.status(409).json({ message: 'Captains are finalized. Lock selection to continue.' });
    }
    if (String(room.turnUserId || '') !== String(req.userId)) {
      return res.status(409).json({ message: 'Not your turn' });
    }

    await ensureBothOnlineOrCancel({ room, context, actionLabel: 'captain' });

    maybeExtendRoomExpiry(room);

    const myPlayers = Array.isArray(room[context.playersField]) ? room[context.playersField] : [];
    const hasCaptainInTeam = myPlayers.some((p) => normalizeKey(p) === normalizeKey(captain));
    if (!hasCaptainInTeam) {
      return res.status(400).json({ message: 'Captain must be selected from your picked players' });
    }

    room[context.captainField] = captain;
    room.hostLocked = false;
    room.guestLocked = false;

    if (room.hostCaptain && room.guestCaptain) {
      room.turnUserId = null;
      await room.save();
      emitRoomUpdate(room, 'captain-complete-lock-pending');
    } else {
      room.turnUserId = String(req.userId) === String(room.hostUserId)
        ? room.guestUserId
        : room.hostUserId;
      await room.save();
      emitRoomUpdate(room, 'captain');
    }

    return res.status(200).json(getRoomResponse({ room, requesterUserId: req.userId }));
  } catch (error) {
    next(error);
  }
};

export const freezeLiveRoom = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'Invalid roomId' });
    }

    const room = await LiveRoom.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Live room not found' });

    const context = ensureRoomParticipant({ room, userId: req.userId });
    await ensureNotExpiredRoom(room);

    if (LIVE_TERMINAL_STATES.has(String(room.status || '').toUpperCase())) {
      if (String(room.status || '').toUpperCase() === 'FROZEN') {
        return res.status(200).json(getRoomResponse({ room, requesterUserId: req.userId }));
      }
      return res.status(409).json({ message: `Room is ${String(room.status || '').toLowerCase()}` });
    }

    await ensureBothOnlineOrCancel({ room, context, actionLabel: 'freeze' });

    if (!isDraftLockEligible(room)) {
      return res.status(409).json({
        message: `Both teams must pick between ${MIN_PLAYERS_PER_TEAM} and ${MAX_PLAYERS_PER_TEAM} players before locking`,
      });
    }

    if (!isCaptainComplete(room)) {
      if (String(room.status) !== 'CAPTAIN') {
        room.status = 'CAPTAIN';
        room.turnUserId = resolveRoomFirstTurnUserId(room) || room.hostUserId;
        room.hostLocked = false;
        room.guestLocked = false;
        await room.save();
        emitRoomUpdate(room, 'captain-started-lock-pending');
        return res.status(200).json(getRoomResponse({ room, requesterUserId: req.userId }));
      }

      return res.status(409).json({ message: 'Both captains must be selected before locking' });
    }

    const lockField = context.lockField;
    let nextRoom = await LiveRoom.findOneAndUpdate(
      { _id: room._id, [lockField]: { $ne: true } },
      { $set: { [lockField]: true } },
      { new: true }
    );

    if (!nextRoom) {
      nextRoom = await LiveRoom.findById(room._id);
    }
    if (!nextRoom) {
      return res.status(404).json({ message: 'Live room not found' });
    }

    await ensureNotExpiredRoom(nextRoom);

    if (LIVE_TERMINAL_STATES.has(String(nextRoom.status || '').toUpperCase())) {
      if (String(nextRoom.status || '').toUpperCase() === 'FROZEN') {
        return res.status(200).json(getRoomResponse({ room: nextRoom, requesterUserId: req.userId }));
      }
      return res.status(409).json({ message: `Room is ${String(nextRoom.status || '').toLowerCase()}` });
    }

    if (!(Boolean(nextRoom.hostLocked) && Boolean(nextRoom.guestLocked))) {
      if (maybeExtendRoomExpiry(nextRoom)) {
        await nextRoom.save();
      }
      emitRoomUpdate(nextRoom, 'lock-pending-opponent');
      return res.status(200).json(getRoomResponse({ room: nextRoom, requesterUserId: req.userId }));
    }

    await finalizeRoomAndCreateSelection({ room: nextRoom });
    return res.status(200).json(getRoomResponse({ room: nextRoom, requesterUserId: req.userId }));
  } catch (error) {
    next(error);
  }
};

export const cancelLiveRoom = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'Invalid roomId' });
    }

    const room = await LiveRoom.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Live room not found' });

    ensureRoomParticipant({ room, userId: req.userId });
    await ensureNotExpiredRoom(room);

    if (LIVE_TERMINAL_STATES.has(String(room.status || '').toUpperCase())) {
      return res.status(200).json(getRoomResponse({ room, requesterUserId: req.userId }));
    }

    room.status = 'CANCELLED';
    room.turnUserId = null;
    room.cancelReason = room.cancelReason || 'MANUAL_CANCEL';
    await room.save();
    emitRoomUpdate(room, 'cancelled-manual');

    return res.status(200).json(getRoomResponse({ room, requesterUserId: req.userId }));
  } catch (error) {
    next(error);
  }
};

export default {
  getLiveRoomOptions,
  createLiveRoom,
  listMyLiveRooms,
  getLiveRoomById,
  setLiveRoomReady,
  pickLiveRoomPlayer,
  selectLiveRoomCaptain,
  freezeLiveRoom,
  cancelLiveRoom,
};
