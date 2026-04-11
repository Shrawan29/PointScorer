import mongoose from 'mongoose';

import Friend from '../models/Friend.model.js';
import MatchSession from '../models/MatchSession.model.js';
import PlayerSelection from '../models/PlayerSelection.model.js';
import PointsBreakdown from '../models/PointsBreakdown.model.js';
import RuleSet from '../models/RuleSet.model.js';
import User from '../models/User.model.js';
import { getCricbuzzMatchStateById } from '../services/scraper.service.js';
import { refreshStatsAndRecalculateForSessionId } from '../services/statsRefresh.service.js';
import {
  orientBreakdownsForViewer,
  orientSelectionForViewer,
  orientTotalsForViewer,
  resolveSessionViewerAccess,
} from '../services/sessionAccess.service.js';

const HISTORY_COMPLETION_CHECK_LIMIT = Number(process.env.HISTORY_COMPLETION_CHECK_LIMIT || 5);

const isTruthyQueryFlag = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

const buildSelectionSummary = (selection) => {
  const userPlayers =
    Array.isArray(selection?.userPlayers) && selection.userPlayers.length > 0
      ? selection.userPlayers
      : Array.isArray(selection?.selectedPlayers)
        ? selection.selectedPlayers
        : [];
  const friendPlayers = Array.isArray(selection?.friendPlayers) ? selection.friendPlayers : [];

  return {
    selectionFrozen: Boolean(selection?.isFrozen),
    userPlayers,
    friendPlayers,
    userCaptain: selection?.userCaptain || selection?.captain || null,
    friendCaptain: selection?.friendCaptain || null,
  };
};

const isIgnorableAutoRefreshError = (error) => {
  const code = Number(error?.statusCode || error?.response?.status || 0);
  return code === 400 || code === 404 || code === 409;
};

const tryAutoRefreshSessionScore = async ({ sessionId, userId, selection }) => {
  if (!selection?.isFrozen) return null;

  try {
    return await refreshStatsAndRecalculateForSessionId({
      sessionId: String(sessionId),
      userId,
      force: true,
    });
  } catch (error) {
    if (!isIgnorableAutoRefreshError(error)) {
      console.error('[History] Auto refresh failed', {
        sessionId: String(sessionId),
        message: error?.message,
      });
    }
    return null;
  }
};

const resolveFriendViewerAccess = async ({ friendId, userId }) => {
  const friend = await Friend.findById(friendId).lean();
  if (!friend) {
    const err = new Error('Friend not found');
    err.statusCode = 404;
    throw err;
  }

  const viewer = String(userId || '');
  const ownerUserId = String(friend.userId || '');
  const linkedUserId = String(friend.linkedUserId || '');

  if (viewer === ownerUserId) {
    return { viewerRole: 'HOST', ownerUserId, friend };
  }

  if (linkedUserId && viewer === linkedUserId) {
    return { viewerRole: 'GUEST', ownerUserId, friend };
  }

  const err = new Error('You do not have access to this friend');
  err.statusCode = 403;
  throw err;
};

export const getHistoryByRuleSet = async (req, res, next) => {
  try {
    const { friendId, rulesetId } = req.params;
    const skipAutoRefresh = isTruthyQueryFlag(req.query.skipAutoRefresh);

    if (!mongoose.Types.ObjectId.isValid(friendId)) {
      return res.status(400).json({ message: 'Invalid friendId' });
    }
    if (!mongoose.Types.ObjectId.isValid(rulesetId)) {
      return res.status(400).json({ message: 'Invalid rulesetId' });
    }

    const access = await resolveFriendViewerAccess({ friendId, userId: req.userId });

    const rulesetExists = await RuleSet.findOne({
      _id: rulesetId,
      userId: access.ownerUserId,
      friendId,
    })
      .select('_id')
      .lean();
    if (!rulesetExists) {
      return res.status(404).json({ message: 'RuleSet not found' });
    }

    const sessionsToCheck = await MatchSession.find({
      userId: access.ownerUserId,
      friendId,
      rulesetId,
      status: { $in: ['UPCOMING', 'LIVE'] },
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(HISTORY_COMPLETION_CHECK_LIMIT)
      .select('_id')
      .lean();

    if (!skipAutoRefresh && sessionsToCheck.length > 0) {
      const checkIds = sessionsToCheck.map((s) => s._id);
      const checkSelections = await PlayerSelection.find({ sessionId: { $in: checkIds } })
        .select('sessionId isFrozen')
        .lean();
      const selectionBySessionId = new Map(
        checkSelections.map((s) => [String(s.sessionId), s])
      );

      for (const pendingSession of sessionsToCheck) {
        const pendingSelection = selectionBySessionId.get(String(pendingSession._id));
        // eslint-disable-next-line no-await-in-loop
        await tryAutoRefreshSessionScore({
          sessionId: pendingSession._id,
          userId: access.ownerUserId,
          selection: pendingSelection,
        });
      }
    }

    const sessions = await MatchSession.find({
      userId: access.ownerUserId,
      friendId,
      rulesetId,
      status: 'COMPLETED',
    })
      .sort({ playedAt: -1 })
      .lean();

    if (!sessions || sessions.length === 0) {
      return res.status(200).json([]);
    }

    const sessionIds = sessions.map((s) => s._id);
    const selections = await PlayerSelection.find({ sessionId: { $in: sessionIds } })
      .select('sessionId isFrozen userPlayers friendPlayers selectedPlayers userCaptain friendCaptain captain')
      .lean();
    const selectionBySessionId = new Map(
      selections.map((s) => [String(s.sessionId), buildSelectionSummary(s)])
    );

    const enriched = sessions.map((s) => ({
      ...s,
      ...(selectionBySessionId.get(String(s._id)) || buildSelectionSummary(null)),
    }));

    return res.status(200).json(enriched);
  } catch (error) {
    next(error);
  }
};

export const getMatchResult = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const skipAutoRefresh = isTruthyQueryFlag(req.query.skipAutoRefresh);

    const access = await resolveSessionViewerAccess({ sessionId, userId: req.userId });
    const session = access.session;

    const selection = await PlayerSelection.findOne({ sessionId }).lean();
    const autoRefreshed = skipAutoRefresh
      ? null
      : await tryAutoRefreshSessionScore({
          sessionId,
          userId: access.ownerUserId,
          selection,
        });
    const effectiveSession =
      autoRefreshed?.matchStatus === 'COMPLETED' && session?.status !== 'COMPLETED'
        ? {
            ...session,
            status: 'COMPLETED',
            playedAt: session?.playedAt || new Date(),
          }
        : session;

    const [breakdowns, matchState, friend] = await Promise.all([
      Array.isArray(autoRefreshed?.playerWisePoints)
        ? Promise.resolve(autoRefreshed.playerWisePoints)
        : PointsBreakdown.find({ sessionId }).lean(),
      getCricbuzzMatchStateById(session.realMatchId).catch(() => ({ state: 'UNKNOWN', match: null })),
      Promise.resolve(access.friend),
    ]);
    const hostUser = access.viewerRole === 'GUEST'
      ? await User.findById(access.ownerUserId).select('name email').lean()
      : null;

    const normalizeBreakdowns = (rows, sel) => {
      const list = Array.isArray(rows) ? rows : [];
      if (list.length === 0) return [];

      const toPlainRow = (input) => {
        if (!input || typeof input !== 'object') return input;
        return typeof input.toObject === 'function' ? input.toObject() : input;
      };

      const userPlayers = Array.isArray(sel?.userPlayers) && sel.userPlayers.length > 0
        ? sel.userPlayers
        : Array.isArray(sel?.selectedPlayers)
          ? sel.selectedPlayers
          : [];
      const friendPlayers = Array.isArray(sel?.friendPlayers) ? sel.friendPlayers : [];

      const userSet = new Set(userPlayers.map((p) => String(p)));
      const friendSet = new Set(friendPlayers.map((p) => String(p)));

      const pickNewest = (a, b) => {
        const aT = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
        const bT = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
        return bT >= aT ? b : a;
      };

      const byKey = new Map();
      for (const rawRow of list) {
        const row = toPlainRow(rawRow);
        const playerId = String(row?.playerId || '');
        if (!playerId) continue;

        let team = row?.team;
        if (!team) {
          // Legacy rows: infer team using saved selection.
          // If a player exists in friend team (and not in user), treat as FRIEND; otherwise USER.
          team = friendSet.has(playerId) && !userSet.has(playerId) ? 'FRIEND' : 'USER';
        }

        const key = `${String(team)}:${playerId}`;
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, { ...row, team });
        } else {
          byKey.set(key, pickNewest(existing, { ...row, team }));
        }
      }

      return Array.from(byKey.values());
    };

    const normalizedBreakdowns = normalizeBreakdowns(breakdowns, selection);
    const viewerBreakdowns = orientBreakdownsForViewer({
      rows: normalizedBreakdowns,
      viewerRole: access.viewerRole,
    });

    const userTotalPoints = normalizedBreakdowns
      .filter((r) => String(r?.team || 'USER') === 'USER')
      .reduce((sum, row) => sum + (typeof row.totalPoints === 'number' ? row.totalPoints : 0), 0);
    const friendTotalPoints = normalizedBreakdowns
      .filter((r) => String(r?.team || 'USER') === 'FRIEND')
      .reduce((sum, row) => sum + (typeof row.totalPoints === 'number' ? row.totalPoints : 0), 0);
    const viewerTotals = orientTotalsForViewer({
      userTotalPoints,
      friendTotalPoints,
      viewerRole: access.viewerRole,
    });
    const combinedTotalPoints = viewerTotals.userTotalPoints + viewerTotals.friendTotalPoints;
    const effectiveMatchState =
      String(effectiveSession?.status || '').toUpperCase() === 'COMPLETED' ||
      autoRefreshed?.matchStatus === 'COMPLETED'
        ? 'COMPLETED'
        : matchState?.state || 'UNKNOWN';
    const orientedSelection = orientSelectionForViewer({
      selection,
      viewerRole: access.viewerRole,
    });

    return res.status(200).json({
      match: effectiveSession,
      friendName:
        access.viewerRole === 'GUEST'
          ? hostUser?.name || hostUser?.email || 'User'
          : friend?.friendName || null,
      // Legacy + new captains
      captain: orientedSelection?.captain || null,
      userCaptain: orientedSelection?.userCaptain || null,
      friendCaptain: orientedSelection?.friendCaptain || null,
      userPlayers: Array.isArray(orientedSelection?.userPlayers)
        ? orientedSelection.userPlayers
        : [],
      friendPlayers: Array.isArray(orientedSelection?.friendPlayers)
        ? orientedSelection.friendPlayers
        : [],
      selectionFrozen: Boolean(orientedSelection?.isFrozen),
      matchState: effectiveMatchState,
      playerWisePoints: viewerBreakdowns,
      userTotalPoints: viewerTotals.userTotalPoints,
      friendTotalPoints: viewerTotals.friendTotalPoints,
      totalPoints: combinedTotalPoints,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getHistoryByRuleSet,
  getMatchResult,
};
