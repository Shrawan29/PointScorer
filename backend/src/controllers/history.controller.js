import mongoose from 'mongoose';

import Friend from '../models/Friend.model.js';
import MatchSession from '../models/MatchSession.model.js';
import PlayerSelection from '../models/PlayerSelection.model.js';
import PointsBreakdown from '../models/PointsBreakdown.model.js';
import { getCricbuzzMatchStateById } from '../services/scraper.service.js';
import { refreshStatsAndRecalculateForSessionId } from '../services/statsRefresh.service.js';

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

    const sessionsToCheck = await MatchSession.find({
      userId: req.userId,
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
          userId: req.userId,
          selection: pendingSelection,
        });
      }
    }

    const sessions = await MatchSession.find({
      userId: req.userId,
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

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: 'Invalid sessionId' });
    }

    const session = await MatchSession.findOne({ _id: sessionId, userId: req.userId }).lean();
    if (!session) {
      return res.status(404).json({ message: 'MatchSession not found' });
    }

    const selection = await PlayerSelection.findOne({ sessionId }).lean();
    const autoRefreshed = skipAutoRefresh
      ? null
      : await tryAutoRefreshSessionScore({
          sessionId,
          userId: req.userId,
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
      Friend.findOne({ _id: session.friendId, userId: req.userId }).lean(),
    ]);

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

    const userTotalPoints = normalizedBreakdowns
      .filter((r) => String(r?.team || 'USER') === 'USER')
      .reduce((sum, row) => sum + (typeof row.totalPoints === 'number' ? row.totalPoints : 0), 0);
    const friendTotalPoints = normalizedBreakdowns
      .filter((r) => String(r?.team || 'USER') === 'FRIEND')
      .reduce((sum, row) => sum + (typeof row.totalPoints === 'number' ? row.totalPoints : 0), 0);
    const combinedTotalPoints = userTotalPoints + friendTotalPoints;
    const effectiveMatchState =
      String(effectiveSession?.status || '').toUpperCase() === 'COMPLETED' ||
      autoRefreshed?.matchStatus === 'COMPLETED'
        ? 'COMPLETED'
        : matchState?.state || 'UNKNOWN';

    return res.status(200).json({
      match: effectiveSession,
      friendName: friend?.friendName || null,
      // Legacy + new captains
      captain: selection?.captain || selection?.userCaptain || null,
      userCaptain: selection?.userCaptain || selection?.captain || null,
      friendCaptain: selection?.friendCaptain || null,
      userPlayers:
        Array.isArray(selection?.userPlayers) && selection.userPlayers.length > 0
          ? selection.userPlayers
          : Array.isArray(selection?.selectedPlayers)
            ? selection.selectedPlayers
            : [],
      friendPlayers: Array.isArray(selection?.friendPlayers) ? selection.friendPlayers : [],
      selectionFrozen: Boolean(selection?.isFrozen),
      matchState: effectiveMatchState,
      playerWisePoints: normalizedBreakdowns,
      userTotalPoints,
      friendTotalPoints,
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
