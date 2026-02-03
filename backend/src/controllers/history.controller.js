import mongoose from 'mongoose';

import Friend from '../models/Friend.model.js';
import MatchSession from '../models/MatchSession.model.js';
import PlayerSelection from '../models/PlayerSelection.model.js';
import PointsBreakdown from '../models/PointsBreakdown.model.js';
import { getCricbuzzMatchStateById } from '../services/scraper.service.js';

export const getHistoryByRuleSet = async (req, res, next) => {
  try {
    const { friendId, rulesetId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(friendId)) {
      return res.status(400).json({ message: 'Invalid friendId' });
    }
    if (!mongoose.Types.ObjectId.isValid(rulesetId)) {
      return res.status(400).json({ message: 'Invalid rulesetId' });
    }

    const sessions = await MatchSession.find({
      userId: req.userId,
      friendId,
      rulesetId,
      status: 'COMPLETED',
    })
      .sort({ playedAt: -1 })
      .lean();

    return res.status(200).json(sessions);
  } catch (error) {
    next(error);
  }
};

export const getMatchResult = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: 'Invalid sessionId' });
    }

    const session = await MatchSession.findOne({ _id: sessionId, userId: req.userId }).lean();
    if (!session) {
      return res.status(404).json({ message: 'MatchSession not found' });
    }

    const [breakdowns, selection, matchState, friend] = await Promise.all([
      PointsBreakdown.find({ sessionId }).lean(),
      PlayerSelection.findOne({ sessionId }).lean(),
      getCricbuzzMatchStateById(session.realMatchId).catch(() => ({ state: 'UNKNOWN', match: null })),
      Friend.findOne({ _id: session.friendId, userId: req.userId }).lean(),
    ]);

    const normalizeBreakdowns = (rows, sel) => {
      const list = Array.isArray(rows) ? rows : [];
      if (list.length === 0) return [];

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
      for (const row of list) {
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

    return res.status(200).json({
      match: session,
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
      matchState: matchState?.state || 'UNKNOWN',
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
