import mongoose from 'mongoose';

import Friend from '../models/Friend.model.js';
import MatchSession from '../models/MatchSession.model.js';
import PlayerSelection from '../models/PlayerSelection.model.js';
import PointsBreakdown from '../models/PointsBreakdown.model.js';
import User from '../models/User.model.js';
import { getCricbuzzMatchStateById } from '../services/scraper.service.js';
import { buildDetailedBreakdownForSessionId } from '../services/breakdown.service.js';
import { refreshStatsAndRecalculateForSessionId } from '../services/statsRefresh.service.js';

const toNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const resolveFriendFromToken = async (token) => {
	const safeToken = String(token || '').trim();
	if (!safeToken) return null;
	return Friend.findOne({ friendViewToken: safeToken }).lean();
};

const findSessionForFriend = async ({ friendId, sessionId }) => {
	if (!mongoose.Types.ObjectId.isValid(sessionId)) return null;
	return MatchSession.findOne({ _id: sessionId, friendId }).lean();
};

const normalizeBreakdowns = (rows, selection) => {
	const list = Array.isArray(rows) ? rows : [];
	if (list.length === 0) return [];

	const userPlayers =
		Array.isArray(selection?.userPlayers) && selection.userPlayers.length > 0
			? selection.userPlayers
			: Array.isArray(selection?.selectedPlayers)
				? selection.selectedPlayers
				: [];
	const friendPlayers = Array.isArray(selection?.friendPlayers) ? selection.friendPlayers : [];

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
			team = friendSet.has(playerId) && !userSet.has(playerId) ? 'FRIEND' : 'USER';
		}

		const key = `${String(team)}:${playerId}`;
		const existing = byKey.get(key);
		if (!existing) byKey.set(key, { ...row, team });
		else byKey.set(key, pickNewest(existing, { ...row, team }));
	}

	return Array.from(byKey.values());
};

export const getFriendPublicView = async (req, res, next) => {
	try {
		const { token } = req.params;
		const friend = await resolveFriendFromToken(token);
		if (!friend) {
			return res.status(404).json({ message: 'Invalid or expired friend link' });
		}

		const sessions = await MatchSession.find({ friendId: friend._id })
			.sort({ createdAt: -1 })
			.lean();

		const sessionIds = sessions.map((s) => s._id);
		const selections = await PlayerSelection.find({ sessionId: { $in: sessionIds } })
			.select('sessionId isFrozen')
			.lean();
		const frozenBySessionId = new Map(selections.map((s) => [String(s.sessionId), Boolean(s.isFrozen)]));

		const visibleSessions = sessions
			.map((s) => ({
				_id: String(s._id),
				realMatchId: s.realMatchId,
				realMatchName: s.realMatchName,
				status: s.status,
				playedAt: s.playedAt,
				createdAt: s.createdAt,
				selectionFrozen: frozenBySessionId.get(String(s._id)) || false,
			}))
			.filter((s) => s.selectionFrozen);

		return res.status(200).json({
			friend: {
				friendId: String(friend._id),
				friendName: friend.friendName,
			},
			sessions: visibleSessions,
		});
	} catch (error) {
		next(error);
	}
};

export const getFriendPublicMatchResult = async (req, res, next) => {
	try {
		const { token, sessionId } = req.params;
		const friend = await resolveFriendFromToken(token);
		if (!friend) {
			return res.status(404).json({ message: 'Invalid or expired friend link' });
		}

		const session = await findSessionForFriend({ friendId: friend._id, sessionId });
		if (!session) {
			return res.status(404).json({ message: 'MatchSession not found' });
		}

		const [selection, breakdowns, owner, matchState] = await Promise.all([
			PlayerSelection.findOne({ sessionId }).lean(),
			PointsBreakdown.find({ sessionId }).lean(),
			User.findById(session.userId).lean(),
			getCricbuzzMatchStateById(session.realMatchId).catch(() => ({ state: 'UNKNOWN', match: null })),
		]);

		const normalizedBreakdowns = normalizeBreakdowns(breakdowns, selection);
		const userTotalPoints = normalizedBreakdowns
			.filter((r) => String(r?.team || 'USER') === 'USER')
			.reduce((sum, row) => sum + toNumber(row?.totalPoints), 0);
		const friendTotalPoints = normalizedBreakdowns
			.filter((r) => String(r?.team || 'USER') === 'FRIEND')
			.reduce((sum, row) => sum + toNumber(row?.totalPoints), 0);

		return res.status(200).json({
			match: session,
			friendName: friend.friendName,
			ownerName: owner?.name || owner?.email || 'Owner',
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
			totalPoints: userTotalPoints + friendTotalPoints,
		});
	} catch (error) {
		next(error);
	}
};

export const getFriendPublicMatchBreakdown = async (req, res, next) => {
	try {
		const { token, sessionId } = req.params;
		const friend = await resolveFriendFromToken(token);
		if (!friend) {
			return res.status(404).json({ message: 'Invalid or expired friend link' });
		}

		const session = await findSessionForFriend({ friendId: friend._id, sessionId });
		if (!session) {
			return res.status(404).json({ message: 'MatchSession not found' });
		}

		const breakdown = await buildDetailedBreakdownForSessionId({
			sessionId,
			userId: session.userId,
		});

		return res.status(200).json({
			...breakdown,
			friendName: friend.friendName,
		});
	} catch (error) {
		next(error);
	}
};

export const refreshFriendPublicSession = async (req, res, next) => {
	try {
		const { token, sessionId } = req.params;
		const friend = await resolveFriendFromToken(token);
		if (!friend) {
			return res.status(404).json({ message: 'Invalid or expired friend link' });
		}

		const session = await findSessionForFriend({ friendId: friend._id, sessionId });
		if (!session) {
			return res.status(404).json({ message: 'MatchSession not found' });
		}

		const out = await refreshStatsAndRecalculateForSessionId({
			sessionId,
			userId: session.userId,
			force: true,
		});

		return res.status(200).json(out);
	} catch (error) {
		next(error);
	}
};

export default {
	getFriendPublicView,
	getFriendPublicMatchResult,
	getFriendPublicMatchBreakdown,
	refreshFriendPublicSession,
};
