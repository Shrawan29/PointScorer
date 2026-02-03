import mongoose from 'mongoose';

import MatchSession from '../models/MatchSession.model.js';
import PlayerSelection from '../models/PlayerSelection.model.js';
import PointsBreakdown from '../models/PointsBreakdown.model.js';
import RawPlayerStats from '../models/RawPlayerStats.model.js';
import RuleSet from '../models/RuleSet.model.js';
import { calculatePlayerPoints } from '../services/pointsEngine.service.js';
import { buildDetailedBreakdownForSessionId } from '../services/breakdown.service.js';
import { getCricbuzzMatchStateById } from '../services/scraper.service.js';
import { refreshStatsAndRecalculateForSessionId } from '../services/statsRefresh.service.js';

export const calculatePointsForSession = async (req, res, next) => {
	try {
		const sessionId = req.params.sessionId || req.body.sessionId;
		const force = String(req.query?.force ?? req.body?.force ?? 'false').toLowerCase() === 'true';

		if (!sessionId) {
			return res.status(400).json({ message: 'sessionId is required' });
		}
		if (!mongoose.Types.ObjectId.isValid(sessionId)) {
			return res.status(400).json({ message: 'Invalid sessionId' });
		}

		const session = await MatchSession.findOne({ _id: sessionId, userId: req.userId });
		if (!session) {
			return res.status(404).json({ message: 'MatchSession not found' });
		}
		// Note: We allow calculation even if session is UPCOMING,
		// because this app supports manual stat entry and sessions may not auto-transition.
		// However: if the Cricbuzz match is still UPCOMING, treat it as not started.
		const matchState = await getCricbuzzMatchStateById(session.realMatchId).catch(() => ({ state: 'UNKNOWN' }));
		if (matchState?.state === 'UPCOMING') {
			return res.status(409).json({ message: 'Match not started yet' });
		}

		const selection = await PlayerSelection.findOne({ sessionId });
		if (!selection) {
			return res.status(404).json({ message: 'PlayerSelection not found' });
		}
		if (!selection.isFrozen) {
			return res.status(409).json({ message: 'PlayerSelection must be frozen' });
		}

		const userPlayers = Array.isArray(selection.userPlayers) && selection.userPlayers.length > 0
			? selection.userPlayers
			: Array.isArray(selection.selectedPlayers)
				? selection.selectedPlayers
				: [];
		const friendPlayers = Array.isArray(selection.friendPlayers) ? selection.friendPlayers : [];
		const userCaptain = selection.userCaptain ?? selection.captain ?? null;
		const friendCaptain = selection.friendCaptain ?? null;

		const normalizeBreakdowns = (rows) => {
			const list = Array.isArray(rows) ? rows : [];
			if (list.length === 0) return [];

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

		const existingBreakdowns = await PointsBreakdown.find({ sessionId }).lean();
		if (Array.isArray(existingBreakdowns) && existingBreakdowns.length > 0 && !force) {
			const normalizedExisting = normalizeBreakdowns(existingBreakdowns);
			const userTotalPoints = existingBreakdowns
				.filter((r) => String(r?.team || 'USER') === 'USER')
				.reduce((sum, row) => sum + (typeof row.totalPoints === 'number' ? row.totalPoints : 0), 0);
			const friendTotalPoints = existingBreakdowns
				.filter((r) => String(r?.team || 'USER') === 'FRIEND')
				.reduce((sum, row) => sum + (typeof row.totalPoints === 'number' ? row.totalPoints : 0), 0);
			const totalPoints = userTotalPoints + friendTotalPoints;
			return res.status(200).json({
				message: 'Points already calculated for this session',
				playerWisePoints: normalizedExisting,
				userTotalPoints: normalizedExisting
					.filter((r) => String(r?.team || 'USER') === 'USER')
					.reduce((sum, row) => sum + (typeof row.totalPoints === 'number' ? row.totalPoints : 0), 0),
				friendTotalPoints: normalizedExisting
					.filter((r) => String(r?.team || 'USER') === 'FRIEND')
					.reduce((sum, row) => sum + (typeof row.totalPoints === 'number' ? row.totalPoints : 0), 0),
				totalPoints: normalizedExisting.reduce(
					(sum, row) => sum + (typeof row.totalPoints === 'number' ? row.totalPoints : 0),
					0
				),
			});
		}
		if (Array.isArray(existingBreakdowns) && existingBreakdowns.length > 0 && force) {
			await PointsBreakdown.deleteMany({ sessionId });
		}

		const ruleSet = await RuleSet.findOne({ _id: session.rulesetId, userId: req.userId }).lean();
		if (!ruleSet) {
			return res.status(404).json({ message: 'RuleSet not found' });
		}

		const rawStats = await RawPlayerStats.find({ sessionId }).lean();
		const rawByPlayerId = new Map(rawStats.map((s) => [String(s.playerId), s]));

		const docsToInsert = [];

		for (const playerId of userPlayers) {
			const stats = rawByPlayerId.get(String(playerId)) || { playerId };
			const isCaptain = userCaptain && String(playerId) === String(userCaptain);
			const { totalPoints, ruleWiseBreakdown } = calculatePlayerPoints(stats, ruleSet.rules, isCaptain);
			docsToInsert.push({ sessionId, team: 'USER', playerId, totalPoints, ruleWiseBreakdown });
		}

		for (const playerId of friendPlayers) {
			const stats = rawByPlayerId.get(String(playerId)) || { playerId };
			const isCaptain = friendCaptain && String(playerId) === String(friendCaptain);
			const { totalPoints, ruleWiseBreakdown } = calculatePlayerPoints(stats, ruleSet.rules, isCaptain);
			docsToInsert.push({ sessionId, team: 'FRIEND', playerId, totalPoints, ruleWiseBreakdown });
		}

		const created = await PointsBreakdown.insertMany(docsToInsert, { ordered: true });
		const userTotalPoints = created
			.filter((r) => String(r?.team || 'USER') === 'USER')
			.reduce((sum, row) => sum + (typeof row.totalPoints === 'number' ? row.totalPoints : 0), 0);
		const friendTotalPoints = created
			.filter((r) => String(r?.team || 'USER') === 'FRIEND')
			.reduce((sum, row) => sum + (typeof row.totalPoints === 'number' ? row.totalPoints : 0), 0);
		const totalPoints = userTotalPoints + friendTotalPoints;

		return res.status(201).json({
			message: 'Points calculated successfully',
			count: created.length,
			playerWisePoints: created,
			userTotalPoints,
			friendTotalPoints,
			totalPoints,
		});
	} catch (error) {
		next(error);
	}
};

export const getRawStatsForSession = async (req, res, next) => {
	try {
		const { sessionId } = req.params;
		if (!mongoose.Types.ObjectId.isValid(sessionId)) {
			return res.status(400).json({ message: 'Invalid sessionId' });
		}

		const session = await MatchSession.findOne({ _id: sessionId, userId: req.userId }).lean();
		if (!session) {
			return res.status(404).json({ message: 'MatchSession not found' });
		}

		const rows = await RawPlayerStats.find({ sessionId }).lean();
		return res.status(200).json(rows || []);
	} catch (error) {
		next(error);
	}
};

export const upsertRawStatsForSession = async (req, res, next) => {
	try {
		const { sessionId } = req.params;
		if (!mongoose.Types.ObjectId.isValid(sessionId)) {
			return res.status(400).json({ message: 'Invalid sessionId' });
		}

		const session = await MatchSession.findOne({ _id: sessionId, userId: req.userId }).lean();
		if (!session) {
			return res.status(404).json({ message: 'MatchSession not found' });
		}

		const stats = Array.isArray(req.body?.stats) ? req.body.stats : [];
		if (stats.length === 0) {
			return res.status(400).json({ message: 'stats[] is required' });
		}

		for (const row of stats) {
			const playerId = String(row?.playerId || '').trim();
			if (!playerId) continue;

			// eslint-disable-next-line no-await-in-loop
			await RawPlayerStats.updateOne(
				{ sessionId, playerId },
				{
					$set: {
						runs: Number(row?.runs || 0),
						fours: Number(row?.fours || 0),
						sixes: Number(row?.sixes || 0),
						wickets: Number(row?.wickets || 0),
						catches: Number(row?.catches || 0),
						runouts: Number(row?.runouts || 0),
					},
				},
				{ upsert: true }
			);
		}

		// If points were calculated before, drop them so recalculation reflects new stats
		await PointsBreakdown.deleteMany({ sessionId });

		const updated = await RawPlayerStats.find({ sessionId }).lean();
		return res.status(200).json(updated || []);
	} catch (error) {
		next(error);
	}
};

export const refreshStatsAndRecalculate = async (req, res, next) => {
	try {
		const { sessionId } = req.params;
		const force = String(req.query?.force ?? req.body?.force ?? 'true').toLowerCase() === 'true';
		const out = await refreshStatsAndRecalculateForSessionId({
			sessionId,
			userId: req.userId,
			force,
		});
		return res.status(200).json(out);
	} catch (error) {
		next(error);
	}
};

export const getDetailedBreakdownForSession = async (req, res, next) => {
	try {
		const { sessionId } = req.params;
		const out = await buildDetailedBreakdownForSessionId({ sessionId, userId: req.userId });
		return res.status(200).json(out);
	} catch (error) {
		next(error);
	}
};

export default {
	calculatePointsForSession,
	getRawStatsForSession,
	upsertRawStatsForSession,
	refreshStatsAndRecalculate,
	getDetailedBreakdownForSession,
};
