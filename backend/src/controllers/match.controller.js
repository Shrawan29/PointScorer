import mongoose from 'mongoose';

import Friend from '../models/Friend.model.js';
import MatchSession from '../models/MatchSession.model.js';
import PlayerSelection from '../models/PlayerSelection.model.js';
import PointsBreakdown from '../models/PointsBreakdown.model.js';
import RawPlayerStats from '../models/RawPlayerStats.model.js';
import RuleSet from '../models/RuleSet.model.js';
import MatchHistory from '../models/MatchHistory.model.js';
import { scrapeTodayAndLiveMatches, scrapeUpcomingMatches, scrapeMatchDetails } from '../services/scraper.service.js';
import { refreshStatsAndRecalculateForSessionId } from '../services/statsRefresh.service.js';

const normalizeStatusBucket = (match) => {
	const raw = String(match?.matchStatus || '').toLowerCase();
	if (raw.includes('live') || raw.includes('in progress') || raw.includes('ongoing') || raw.includes('today')) {
		return 'TODAY';
	}
	if (raw.includes('upcoming') || raw.includes('scheduled') || raw.includes('fixture')) {
		return 'UPCOMING';
	}

	// Fallback: if startTime is today (local), bucket into TODAY.
	const st = match?.startTime;
	const d = typeof st === 'number' ? new Date(st) : new Date(String(st || ''));
	if (!Number.isNaN(d.getTime())) {
		const now = new Date();
		const sameDay =
			d.getFullYear() === now.getFullYear() &&
			d.getMonth() === now.getMonth() &&
			d.getDate() === now.getDate();
		if (sameDay) return 'TODAY';
	}

	return 'UPCOMING';
};

const sanitizeMatch = (match, bucket) => {
	const matchType = match?.matchType ? String(match.matchType).toUpperCase() : null;
	return {
		matchId: match?.matchId ?? null,
		matchName: match?.matchName ?? null,
		teams: match?.teams ?? [],
		matchType: matchType === 'T20' || matchType === 'ODI' || matchType === 'TEST' ? matchType : null,
		matchStatus: bucket,
		startTime: match?.startTime ?? null,
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

const toNumber = (value) => {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
};

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

const normalizeBreakdownRowsForSelection = (rows, selection) => {
	const list = Array.isArray(rows) ? rows : [];
	if (list.length === 0) return [];

	const userPlayers = Array.isArray(selection?.userPlayers) && selection.userPlayers.length > 0
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
		const row = rawRow && typeof rawRow.toObject === 'function' ? rawRow.toObject() : rawRow;
		const playerId = String(row?.playerId || '');
		if (!playerId) continue;

		let team = row?.team;
		if (!team) {
			team = friendSet.has(playerId) && !userSet.has(playerId) ? 'FRIEND' : 'USER';
		}

		const key = `${String(team)}:${playerId}`;
		const candidate = { ...row, team };
		const existing = byKey.get(key);
		if (!existing) {
			byKey.set(key, candidate);
		} else {
			byKey.set(key, pickNewest(existing, candidate));
		}
	}

	return Array.from(byKey.values());
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
		const normalizedRows = normalizeBreakdownRowsForSelection(sessionRows, selection);
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

const HISTORY_STATUS_REFRESH_LIMIT = Number(process.env.HISTORY_STATUS_REFRESH_LIMIT || 25);

const isIgnorableHistoryRefreshError = (error) => {
	const code = Number(error?.statusCode || error?.response?.status || 0);
	return code === 400 || code === 404 || code === 409;
};

const autoRefreshCompletionForSessions = async ({ sessions, selectionBySessionId, userId }) => {
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
			const status = String(s?.status || '').toUpperCase();
			if (status === 'COMPLETED') return false;
			const summary = selectionBySessionId.get(String(s?._id));
			return Boolean(summary?.selectionFrozen);
		})
		.slice(0, HISTORY_STATUS_REFRESH_LIMIT);

	for (const candidate of refreshCandidates) {
		try {
			// eslint-disable-next-line no-await-in-loop
			const out = await refreshStatsAndRecalculateForSessionId({
				sessionId: String(candidate._id),
				userId,
				force: true,
			});
			if (String(out?.matchStatus || '').toUpperCase() === 'COMPLETED') changed = true;
		} catch (error) {
			if (!isIgnorableHistoryRefreshError(error)) {
				console.error('[MatchHistory] Auto refresh failed', {
					sessionId: String(candidate?._id || ''),
					message: error?.message,
				});
			}
		}
	}

	return changed;
};

export const getMatches = async (req, res, next) => {
	try {
		const [todayAndLive, upcoming] = await Promise.all([
			scrapeTodayAndLiveMatches(),
			scrapeUpcomingMatches(),
		]);

		// Handle cases where arrays might be null or empty
		const todayArrays = Array.isArray(todayAndLive) ? todayAndLive : [];
		const upcomingArray = Array.isArray(upcoming) ? upcoming : [];

		const todayMatches = [];
		for (const m of todayArrays) {
			// Treat LIVE as part of the Today tab.
			const raw = String(m?.matchStatus || '').toUpperCase();
			const bucket = raw === 'LIVE' ? 'TODAY' : normalizeStatusBucket(m);
			const safe = sanitizeMatch(m, bucket);
			if (!safe.matchId) continue;
			if (bucket === 'TODAY') todayMatches.push(safe);
		}

		const processedUpcomingMatches = [];
		for (const m of upcomingArray) {
			const safe = sanitizeMatch(m, 'UPCOMING');
			if (!safe.matchId) continue;
			processedUpcomingMatches.push(safe);
		}

		return res.status(200).json({ todayMatches, upcomingMatches: processedUpcomingMatches });
	} catch (error) {
		next(error);
	}
};

export const getMatchById = async (req, res, next) => {
	try {
		const { matchId } = req.params;
		if (!matchId) {
			return res.status(400).json({ message: 'matchId is required' });
		}

		const match = await scrapeMatchDetails(matchId);
		if (!match) {
			return res.status(502).json({ message: 'Failed to fetch match details' });
		}

		return res.status(200).json(match);
	} catch (error) {
		next(error);
	}
};

export const createMatchSession = async (req, res, next) => {
	try {
		const { friendId, rulesetId, realMatchId, realMatchName } = req.body;

		if (!friendId || !rulesetId || !realMatchId || !realMatchName) {
			return res.status(400).json({
				message: 'friendId, rulesetId, realMatchId, and realMatchName are required',
			});
		}

		if (!mongoose.Types.ObjectId.isValid(friendId)) {
			return res.status(400).json({ message: 'Invalid friendId' });
		}
		if (!mongoose.Types.ObjectId.isValid(rulesetId)) {
			return res.status(400).json({ message: 'Invalid rulesetId' });
		}

		// Check if user has already played this match with this friend
		const existingMatch = await MatchHistory.findOne({
			userId: req.userId,
			friendId,
			matchId: realMatchId,
		});

		if (existingMatch) {
			return res.status(400).json({
				message: `You have already played this match (${realMatchName}) with this friend. You can only play each match with the same friend once.`,
			});
		}

		const friend = await Friend.findOne({ _id: friendId, userId: req.userId });
		if (!friend) {
			return res.status(404).json({ message: 'Friend not found' });
		}

		const ruleset = await RuleSet.findOne({
			_id: rulesetId,
			userId: req.userId,
		});
		if (!ruleset) {
			return res.status(404).json({ message: 'RuleSet not found' });
		}

		const session = await MatchSession.create({
			userId: req.userId,
			friendId,
			rulesetId,
			realMatchId,
			realMatchName,
			status: 'UPCOMING',
		});

		return res.status(201).json(session);
	} catch (error) {
		next(error);
	}
};

export const getMatchSessionsByFriend = async (req, res, next) => {
	try {
		const { friendId } = req.params;
		const onlyFrozen = String(req.query.onlyFrozen ?? 'true').toLowerCase() !== 'false';
		const includePointsDebug = shouldIncludePointsDebug(req);

		if (!mongoose.Types.ObjectId.isValid(friendId)) {
			return res.status(400).json({ message: 'Invalid friendId' });
		}

		let sessions = await MatchSession.find({ userId: req.userId, friendId })
			.sort({ createdAt: -1 })
			.lean();

		if (!sessions || sessions.length === 0) return res.status(200).json([]);

		let sessionIds = sessions.map((s) => s._id);
		let selections = await PlayerSelection.find({ sessionId: { $in: sessionIds } })
			.select('sessionId isFrozen userPlayers friendPlayers selectedPlayers userCaptain friendCaptain captain')
			.lean();
		let selectionBySessionId = new Map(
			selections.map((s) => [String(s.sessionId), buildSelectionSummary(s)])
		);

		const completionUpdated = await autoRefreshCompletionForSessions({
			sessions,
			selectionBySessionId,
			userId: req.userId,
		});

		if (completionUpdated) {
			sessions = await MatchSession.find({ userId: req.userId, friendId })
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

		const enriched = sessions.map((s) => ({
			...s,
			...(selectionBySessionId.get(String(s._id)) || buildSelectionSummary(null)),
			...(pointsBySessionId.get(String(s._id)) || buildEmptySessionPoints(includePointsDebug)),
		}));

		return res.status(200).json(onlyFrozen ? enriched.filter((s) => s.selectionFrozen) : enriched);
	} catch (error) {
		next(error);
	}
};

export const getMatchSessionsByRuleSet = async (req, res, next) => {
	try {
		const { rulesetId } = req.params;
		const onlyFrozen = String(req.query.onlyFrozen ?? 'true').toLowerCase() !== 'false';
		const includePointsDebug = shouldIncludePointsDebug(req);

		if (!mongoose.Types.ObjectId.isValid(rulesetId)) {
			return res.status(400).json({ message: 'Invalid rulesetId' });
		}

		let sessions = await MatchSession.find({ userId: req.userId, rulesetId }).lean();
		if (!sessions || sessions.length === 0) return res.status(200).json([]);

		let sessionIds = sessions.map((s) => s._id);
		let selections = await PlayerSelection.find({ sessionId: { $in: sessionIds } })
			.select('sessionId isFrozen userPlayers friendPlayers selectedPlayers userCaptain friendCaptain captain')
			.lean();
		let selectionBySessionId = new Map(
			selections.map((s) => [String(s.sessionId), buildSelectionSummary(s)])
		);

		const completionUpdated = await autoRefreshCompletionForSessions({
			sessions,
			selectionBySessionId,
			userId: req.userId,
		});

		if (completionUpdated) {
			sessions = await MatchSession.find({ userId: req.userId, rulesetId }).lean();
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
		const enriched = sessions.map((s) => ({
			...s,
			...(selectionBySessionId.get(String(s._id)) || buildSelectionSummary(null)),
			...(pointsBySessionId.get(String(s._id)) || buildEmptySessionPoints(includePointsDebug)),
		}));

		return res.status(200).json(onlyFrozen ? enriched.filter((s) => s.selectionFrozen) : enriched);
	} catch (error) {
		next(error);
	}
};

export const getMatchSessionById = async (req, res, next) => {
	try {
		const { sessionId } = req.params;
		if (!sessionId) {
			return res.status(400).json({ message: 'sessionId is required' });
		}
		if (!mongoose.Types.ObjectId.isValid(sessionId)) {
			return res.status(400).json({ message: 'Invalid sessionId' });
		}

		const session = await MatchSession.findOne({ _id: sessionId, userId: req.userId }).lean();
		if (!session) {
			return res.status(404).json({ message: 'MatchSession not found' });
		}

		return res.status(200).json(session);
	} catch (error) {
		next(error);
	}
};

export const deleteMatchSession = async (req, res, next) => {
	try {
		const { sessionId } = req.params;
		if (!sessionId) {
			return res.status(400).json({ message: 'sessionId is required' });
		}
		if (!mongoose.Types.ObjectId.isValid(sessionId)) {
			return res.status(400).json({ message: 'Invalid sessionId' });
		}

		const session = await MatchSession.findOne({ _id: sessionId, userId: req.userId }).lean();
		if (!session) {
			return res.status(404).json({ message: 'MatchSession not found' });
		}

		await Promise.all([
			PlayerSelection.deleteMany({ sessionId }),
			PointsBreakdown.deleteMany({ sessionId }),
			RawPlayerStats.deleteMany({ sessionId }),
			MatchSession.deleteOne({ _id: sessionId, userId: req.userId }),
		]);

		return res.status(200).json({ ok: true });
	} catch (error) {
		next(error);
	}
};

export default {
	getMatches,
	getMatchById,
	createMatchSession,
	getMatchSessionsByFriend,
	getMatchSessionsByRuleSet,
	getMatchSessionById,
	deleteMatchSession,
};
