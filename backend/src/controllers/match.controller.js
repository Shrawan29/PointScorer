import mongoose from 'mongoose';

import Friend from '../models/Friend.model.js';
import MatchSession from '../models/MatchSession.model.js';
import PlayerSelection from '../models/PlayerSelection.model.js';
import PointsBreakdown from '../models/PointsBreakdown.model.js';
import RawPlayerStats from '../models/RawPlayerStats.model.js';
import RuleSet from '../models/RuleSet.model.js';
import MatchHistory from '../models/MatchHistory.model.js';
import { scrapeTodayAndLiveMatches, scrapeUpcomingMatches, scrapeMatchDetails } from '../services/scraper.service.js';

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

		if (!mongoose.Types.ObjectId.isValid(friendId)) {
			return res.status(400).json({ message: 'Invalid friendId' });
		}

		const sessions = await MatchSession.find({ userId: req.userId, friendId })
			.sort({ createdAt: -1 })
			.lean();

		if (!sessions || sessions.length === 0) return res.status(200).json([]);

		const sessionIds = sessions.map((s) => s._id);
		const selections = await PlayerSelection.find({ sessionId: { $in: sessionIds } })
			.select('sessionId isFrozen')
			.lean();
		const frozenBySessionId = new Map(selections.map((s) => [String(s.sessionId), Boolean(s.isFrozen)]));

		const enriched = sessions.map((s) => ({
			...s,
			selectionFrozen: frozenBySessionId.get(String(s._id)) || false,
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

		if (!mongoose.Types.ObjectId.isValid(rulesetId)) {
			return res.status(400).json({ message: 'Invalid rulesetId' });
		}

		const sessions = await MatchSession.find({ userId: req.userId, rulesetId }).lean();
		if (!sessions || sessions.length === 0) return res.status(200).json([]);

		const sessionIds = sessions.map((s) => s._id);
		const selections = await PlayerSelection.find({ sessionId: { $in: sessionIds } })
			.select('sessionId isFrozen')
			.lean();
		const frozenBySessionId = new Map(selections.map((s) => [String(s.sessionId), Boolean(s.isFrozen)]));
		const enriched = sessions.map((s) => ({
			...s,
			selectionFrozen: frozenBySessionId.get(String(s._id)) || false,
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
