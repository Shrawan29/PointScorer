import Friend from '../models/Friend.model.js';
import User from '../models/User.model.js';
import { getPresenceSummary, getUserPresence, markUserOnline } from '../services/presence.service.js';
import { emitPresenceChangedForUser } from '../services/liveRoomRealtime.service.js';

const userDisplayName = (user) => user?.name || user?.email || 'User';

const sortByOnlineAndName = (a, b) => {
  if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
  return String(a.displayName || '').localeCompare(String(b.displayName || ''));
};

export const heartbeat = async (req, res, next) => {
  try {
    const marked = markUserOnline(req.userId);
    if (marked?.becameOnline) {
      await emitPresenceChangedForUser({
        userId: req.userId,
        reason: 'heartbeat-online',
      });
    }
    const summary = getPresenceSummary();

    return res.status(200).json({
      ok: true,
      userId: String(req.userId),
      lastSeenAt: marked?.lastSeenAt ? new Date(marked.lastSeenAt).toISOString() : null,
      ttlMs: summary.ttlMs,
    });
  } catch (error) {
    next(error);
  }
};

export const getLinkedFriendsPresence = async (req, res, next) => {
  try {
    markUserOnline(req.userId);

    const [ownedLinks, guestLinks] = await Promise.all([
      Friend.find({
        userId: req.userId,
        linkedUserId: { $exists: true, $ne: null },
      })
        .select('_id userId linkedUserId friendName')
        .lean(),
      Friend.find({ linkedUserId: req.userId })
        .select('_id userId linkedUserId friendName')
        .lean(),
    ]);

    const counterpartUserIds = new Set();
    for (const row of ownedLinks) {
      if (row?.linkedUserId) counterpartUserIds.add(String(row.linkedUserId));
    }
    for (const row of guestLinks) {
      if (row?.userId) counterpartUserIds.add(String(row.userId));
    }

    const counterpartUsers = await User.find({ _id: { $in: Array.from(counterpartUserIds) } })
      .select('name email')
      .lean();
    const userById = new Map(counterpartUsers.map((u) => [String(u._id), u]));

    const out = [];

    for (const row of ownedLinks) {
      const counterpartUserId = String(row?.linkedUserId || '');
      if (!counterpartUserId) continue;

      const counterpartUser = userById.get(counterpartUserId) || null;
      const presence = getUserPresence(counterpartUserId);

      out.push({
        relationshipId: `${String(row?._id)}:host`,
        relationType: 'HOST_VIEW',
        friendId: String(row?._id),
        displayName: row?.friendName || userDisplayName(counterpartUser),
        counterpartUserId,
        counterpartName: userDisplayName(counterpartUser),
        isOnline: presence.isOnline,
        lastSeenAt: presence.lastSeenAt,
      });
    }

    for (const row of guestLinks) {
      const counterpartUserId = String(row?.userId || '');
      if (!counterpartUserId) continue;

      const counterpartUser = userById.get(counterpartUserId) || null;
      const presence = getUserPresence(counterpartUserId);

      out.push({
        relationshipId: `${String(row?._id)}:guest`,
        relationType: 'GUEST_VIEW',
        friendId: String(row?._id),
        displayName: userDisplayName(counterpartUser),
        counterpartUserId,
        counterpartName: userDisplayName(counterpartUser),
        hostAliasForYou: row?.friendName || null,
        isOnline: presence.isOnline,
        lastSeenAt: presence.lastSeenAt,
      });
    }

    out.sort(sortByOnlineAndName);

    const summary = getPresenceSummary();

    return res.status(200).json({
      ttlMs: summary.ttlMs,
      onlineCount: out.filter((item) => item.isOnline).length,
      totalCount: out.length,
      friends: out,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  heartbeat,
  getLinkedFriendsPresence,
};
