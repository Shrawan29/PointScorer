import mongoose from 'mongoose';

import Friend from '../models/Friend.model.js';
import MatchSession from '../models/MatchSession.model.js';
import PlayerSelection from '../models/PlayerSelection.model.js';
import PointsBreakdown from '../models/PointsBreakdown.model.js';
import User from '../models/User.model.js';
import { getCricbuzzMatchStateById } from '../services/scraper.service.js';
import { buildDetailedBreakdownForSessionId } from '../services/breakdown.service.js';
import { refreshStatsAndRecalculateForSessionId } from '../services/statsRefresh.service.js';
import { getFriendInviteByToken } from '../services/friendInvite.service.js';

const toNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const isTruthyQueryFlag = (value) => {
	const normalized = String(value || '').trim().toLowerCase();
	return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

const shouldIncludePointsDebug = (req) => {
	if (!isTruthyQueryFlag(req?.query?.pointsDebug)) return false;
	const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
	const allowInProd = String(process.env.ALLOW_POINTS_DEBUG_IN_PROD || '').toLowerCase() === 'true';
	return !isProduction || allowInProd;
};

const buildEmptySessionPoints = (includePointsDebug = false) => {
	const base = {
		userTotalPoints: 0,
		friendTotalPoints: 0,
		pointsDifference: 0,
	};

	if (!includePointsDebug) return base;

	return {
		...base,
		pointsDebug: {
			enabled: true,
			rawUserTotalPoints: 0,
			rawFriendTotalPoints: 0,
			rawTotalPoints: 0,
			recheckedUserTotalPoints: 0,
			recheckedFriendTotalPoints: 0,
			recheckedTotalPoints: 0,
			deltaUserPoints: 0,
			deltaFriendPoints: 0,
			deltaTotalPoints: 0,
			hadMismatch: false,
		},
	};
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

const buildSessionPointsMap = async ({ sessionIds, selectionBySessionId, includePointsDebug = false }) => {
	if (!Array.isArray(sessionIds) || sessionIds.length === 0) return new Map();

	const rows = await PointsBreakdown.find({ sessionId: { $in: sessionIds } })
		.select('sessionId playerId totalPoints team createdAt updatedAt')
		.lean();

	const rowsBySessionId = new Map();
	for (const row of rows) {
		const sid = String(row?.sessionId || '');
		if (!sid) continue;
		const bucket = rowsBySessionId.get(sid) || [];
		bucket.push(row);
		rowsBySessionId.set(sid, bucket);
	}

	const pointsBySessionId = new Map();
	for (const sessionId of sessionIds) {
		const sid = String(sessionId || '');
		if (!sid) continue;
		const sessionRows = rowsBySessionId.get(sid) || [];
		const selection = selectionBySessionId?.get(sid) || null;
		const normalizedRows = normalizeBreakdowns(sessionRows, selection);
		const rawUserTotalPoints = sessionRows
			.filter((r) => String(r?.team || 'USER').toUpperCase() !== 'FRIEND')
			.reduce((sum, row) => sum + toNumber(row?.totalPoints), 0);
		const rawFriendTotalPoints = sessionRows
			.filter((r) => String(r?.team || 'USER').toUpperCase() === 'FRIEND')
			.reduce((sum, row) => sum + toNumber(row?.totalPoints), 0);
		const userTotalPoints = normalizedRows
			.filter((r) => String(r?.team || 'USER') === 'USER')
			.reduce((sum, row) => sum + toNumber(row?.totalPoints), 0);
		const friendTotalPoints = normalizedRows
			.filter((r) => String(r?.team || 'USER') === 'FRIEND')
			.reduce((sum, row) => sum + toNumber(row?.totalPoints), 0);
		const rawTotalPoints = rawUserTotalPoints + rawFriendTotalPoints;
		const recheckedTotalPoints = userTotalPoints + friendTotalPoints;
		const hadMismatch =
			rawUserTotalPoints !== userTotalPoints || rawFriendTotalPoints !== friendTotalPoints;

		const totals = {
			userTotalPoints,
			friendTotalPoints,
			pointsDifference: Math.abs(userTotalPoints - friendTotalPoints),
		};

		if (includePointsDebug) {
			totals.pointsDebug = {
				enabled: true,
				rawUserTotalPoints,
				rawFriendTotalPoints,
				rawTotalPoints,
				recheckedUserTotalPoints: userTotalPoints,
				recheckedFriendTotalPoints: friendTotalPoints,
				recheckedTotalPoints,
				deltaUserPoints: userTotalPoints - rawUserTotalPoints,
				deltaFriendPoints: friendTotalPoints - rawFriendTotalPoints,
				deltaTotalPoints: recheckedTotalPoints - rawTotalPoints,
				hadMismatch,
			};
		}

		pointsBySessionId.set(sid, totals);
	}

	return pointsBySessionId;
};

const resolveFriendFromToken = async (token) => {
	const safeToken = String(token || '').trim();
	if (!safeToken) return null;
	return Friend.findOne({ friendViewToken: safeToken }).lean();
};

const findSessionForFriend = async ({ friendId, sessionId }) => {
	if (!mongoose.Types.ObjectId.isValid(sessionId)) return null;
	return MatchSession.findOne({ _id: sessionId, friendId }).lean();
};

const isIgnorablePublicRefreshError = (error) => {
	const code = Number(error?.statusCode || error?.response?.status || 0);
	return code === 400 || code === 404 || code === 409;
};

const tryAutoRefreshPublicSessionScore = async ({ sessionId, userId, selection }) => {
	if (!selection?.isFrozen && !selection?.selectionFrozen) return null;

	try {
		return await refreshStatsAndRecalculateForSessionId({
			sessionId: String(sessionId),
			userId,
			force: true,
		});
	} catch (error) {
		if (!isIgnorablePublicRefreshError(error)) {
			console.error('[Public] Auto refresh failed', {
				sessionId: String(sessionId),
				message: error?.message,
			});
		}
		return null;
	}
};

const PUBLIC_HISTORY_STATUS_REFRESH_LIMIT = Number(process.env.PUBLIC_HISTORY_STATUS_REFRESH_LIMIT || 25);

const autoRefreshPublicHistoryStatuses = async ({ sessions, selectionBySessionId }) => {
	if (!Array.isArray(sessions) || sessions.length === 0) return false;

	let changed = false;
	const markCompletedIds = sessions
		.filter((s) => Boolean(s?.playedAt) && String(s?.status || '').toUpperCase() !== 'COMPLETED')
		.map((s) => s._id);

	if (markCompletedIds.length > 0) {
		await MatchSession.updateMany(
			{ _id: { $in: markCompletedIds } },
			{ $set: { status: 'COMPLETED' } },
		);
		changed = true;
	}

	const refreshCandidates = sessions
		.filter((s) => {
			if (String(s?.status || '').toUpperCase() === 'COMPLETED') return false;
			const summary = selectionBySessionId.get(String(s?._id));
			return Boolean(summary?.selectionFrozen);
		})
		.slice(0, PUBLIC_HISTORY_STATUS_REFRESH_LIMIT);

	for (const candidate of refreshCandidates) {
		const summary = selectionBySessionId.get(String(candidate?._id));
		// eslint-disable-next-line no-await-in-loop
		const out = await tryAutoRefreshPublicSessionScore({
			sessionId: candidate?._id,
			userId: candidate?.userId,
			selection: summary,
		});
		if (String(out?.matchStatus || '').toUpperCase() === 'COMPLETED') changed = true;
	}

	return changed;
};

const normalizeBreakdowns = (rows, selection) => {
	const list = Array.isArray(rows) ? rows : [];
	if (list.length === 0) return [];

	const toPlainRow = (input) => {
		if (!input || typeof input !== 'object') return input;
		return typeof input.toObject === 'function' ? input.toObject() : input;
	};

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
	for (const rawRow of list) {
		const row = toPlainRow(rawRow);
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
		const includePointsDebug = shouldIncludePointsDebug(req);
		const friend = await resolveFriendFromToken(token);
		if (!friend) {
			return res.status(404).json({ message: 'Invalid or expired friend link' });
		}

		const owner = await User.findById(friend.userId)
			.select('name email')
			.lean();
		const ownerName = owner?.name || owner?.email || 'Owner';

		let sessions = await MatchSession.find({ friendId: friend._id })
			.sort({ createdAt: -1 })
			.lean();

		let sessionIds = sessions.map((s) => s._id);
		let selections = await PlayerSelection.find({ sessionId: { $in: sessionIds } })
			.select('sessionId isFrozen userPlayers friendPlayers selectedPlayers userCaptain friendCaptain captain')
			.lean();
		let selectionBySessionId = new Map(
			selections.map((s) => [String(s.sessionId), buildSelectionSummary(s)])
		);

		const completionUpdated = await autoRefreshPublicHistoryStatuses({
			sessions,
			selectionBySessionId,
		});

		if (completionUpdated) {
			sessions = await MatchSession.find({ friendId: friend._id })
				.sort({ createdAt: -1 })
				.lean();
			sessionIds = sessions.map((s) => s._id);
			selections = await PlayerSelection.find({ sessionId: { $in: sessionIds } })
				.select('sessionId isFrozen userPlayers friendPlayers selectedPlayers userCaptain friendCaptain captain')
				.lean();
			selectionBySessionId = new Map(
				selections.map((s) => [String(s.sessionId), buildSelectionSummary(s)])
			);
		}

		const pointsBySessionId = await buildSessionPointsMap({
			sessionIds,
			selectionBySessionId,
			includePointsDebug,
		});

		const visibleSessions = sessions
			.map((s) => ({
				_id: String(s._id),
				realMatchId: s.realMatchId,
				realMatchName: s.realMatchName,
				status: s.status,
				playedAt: s.playedAt,
				createdAt: s.createdAt,
				...(selectionBySessionId.get(String(s._id)) || buildSelectionSummary(null)),
				...(pointsBySessionId.get(String(s._id)) || buildEmptySessionPoints(includePointsDebug)),
			}))
			.filter((s) => s.selectionFrozen);

		return res.status(200).json({
			friend: {
				friendId: String(friend._id),
				friendName: friend.friendName,
			},
			ownerName,
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

		const selection = await PlayerSelection.findOne({ sessionId }).lean();
		const autoRefreshed = await tryAutoRefreshPublicSessionScore({
			sessionId,
			userId: session.userId,
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

		const [breakdowns, owner, matchState] = await Promise.all([
			Array.isArray(autoRefreshed?.playerWisePoints)
				? Promise.resolve(autoRefreshed.playerWisePoints)
				: PointsBreakdown.find({ sessionId }).lean(),
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
		const effectiveMatchState =
			String(effectiveSession?.status || '').toUpperCase() === 'COMPLETED' ||
			autoRefreshed?.matchStatus === 'COMPLETED'
				? 'COMPLETED'
				: matchState?.state || 'UNKNOWN';

		return res.status(200).json({
			match: effectiveSession,
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
			matchState: effectiveMatchState,
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

export const getLiveInvitePreview = async (req, res, next) => {
	try {
		const { token } = req.params;
		const friend = await getFriendInviteByToken(token);
		const host = await User.findById(friend.userId)
			.select('name email')
			.lean();

		return res.status(200).json({
			friendId: String(friend._id),
			friendName: friend.friendName,
			hostName: host?.name || host?.email || 'User',
			expiresAt: friend.liveInviteExpiresAt,
			alreadyLinked: Boolean(friend.linkedUserId),
		});
	} catch (error) {
		next(error);
	}
};

export default {
	getFriendPublicView,
	getFriendPublicMatchResult,
	getFriendPublicMatchBreakdown,
	refreshFriendPublicSession,
	getLiveInvitePreview,
};
