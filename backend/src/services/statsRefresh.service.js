import mongoose from 'mongoose';

import MatchSession from '../models/MatchSession.model.js';
import PlayerSelection from '../models/PlayerSelection.model.js';
import PointsBreakdown from '../models/PointsBreakdown.model.js';
import RawPlayerStats from '../models/RawPlayerStats.model.js';
import RuleSet from '../models/RuleSet.model.js';
import { calculatePlayerPoints } from './pointsEngine.service.js';
import { getCricbuzzMatchStateById, scrapeCricbuzzScorecardPlayerStats } from './scraper.service.js';

const normalizeKey = (value) =>
	String(value || '')
		.replace(/[†\u2020]/g, '')
		.replace(/\([^)]*\)/g, '')
		.replace(/[,]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();

export const refreshRawStatsFromCricbuzzForSession = async ({ session, selection }) => {
	if (!session?.realMatchId) {
		return { updatedCount: 0, source: null };
	}

	const matchState = await getCricbuzzMatchStateById(session.realMatchId).catch(() => ({ state: 'UNKNOWN' }));
	if (matchState?.state === 'UPCOMING') {
		const err = new Error('Match not started yet');
		err.statusCode = 409;
		throw err;
	}

	const userPlayers =
		Array.isArray(selection?.userPlayers) && selection.userPlayers.length > 0
			? selection.userPlayers
			: Array.isArray(selection?.selectedPlayers)
				? selection.selectedPlayers
				: [];
	const friendPlayers = Array.isArray(selection?.friendPlayers) ? selection.friendPlayers : [];
	const allSelected = [...userPlayers, ...friendPlayers];

	const scraped = await scrapeCricbuzzScorecardPlayerStats(session.realMatchId);
	if (!scraped) {
		const err = new Error('Failed to fetch scorecard stats');
		err.statusCode = 502;
		throw err;
	}

	const scrapedById = scraped.playerStatsById && typeof scraped.playerStatsById === 'object' ? scraped.playerStatsById : {};
	const nameById = scraped.playerNameById && typeof scraped.playerNameById === 'object' ? scraped.playerNameById : {};
	const idByNormalizedName = new Map();
	for (const [pid, nm] of Object.entries(nameById)) {
		// Only index ids that actually have stats in the scorecard extract.
		if (!scrapedById[String(pid)]) continue;
		const key = normalizeKey(nm);
		if (!key) continue;
		if (!idByNormalizedName.has(key)) idByNormalizedName.set(key, String(pid));
	}

	const resolveScrapedStatsForSelectedKey = (selectedKey) => {
		const sel = String(selectedKey || '').trim();
		if (!sel) return null;
		// 1) If selection stores Cricbuzz numeric ids, direct hit
		if (scrapedById[sel]) return scrapedById[sel];
		// 2) If selection stores names, map name -> id -> stats
		const byNameId = idByNormalizedName.get(normalizeKey(sel));
		if (byNameId && scrapedById[byNameId]) return scrapedById[byNameId];

		// 3) Conservative fuzzy fallback: substring match against indexed names
		const nsel = normalizeKey(sel);
		if (!nsel) return null;
		for (const [n, pid] of idByNormalizedName.entries()) {
			if (n === nsel) return scrapedById[pid] || null;
			if (n.includes(nsel) || nsel.includes(n)) {
				if (scrapedById[pid]) return scrapedById[pid];
			}
		}
		return null;
	};

	const statsByPlayerId = new Map();
	const unmatched = [];
	const matched = [];
	const nonZero = [];
	for (const playerId of allSelected) {
		const pid = String(playerId);
		const resolved = resolveScrapedStatsForSelectedKey(pid);
		const s = resolved || {};
		const isMatched = Boolean(resolved);
		if (!isMatched) unmatched.push(pid);
		else matched.push(pid);
		const hasAny =
			Number(s.runs || 0) > 0 ||
			Number(s.fours || 0) > 0 ||
			Number(s.sixes || 0) > 0 ||
			Number(s.wickets || 0) > 0 ||
			Number(s.catches || 0) > 0 ||
			Number(s.runouts || 0) > 0;
		if (hasAny) nonZero.push(pid);
		statsByPlayerId.set(pid, {
			playerId: pid,
			runs: Number(s.runs || 0),
			fours: Number(s.fours || 0),
			sixes: Number(s.sixes || 0),
			wickets: Number(s.wickets || 0),
			catches: Number(s.catches || 0),
			runouts: Number(s.runouts || 0),
		});
	}

	if (unmatched.length) {
		console.warn('[StatsRefresh] Some selected players could not be mapped to scorecard stats', {
			sessionId: String(session._id),
			count: unmatched.length,
			sample: unmatched.slice(0, 6),
		});
	}

	const bulk = [];
	for (const s of statsByPlayerId.values()) {
		bulk.push({
			updateOne: {
				filter: { sessionId: session._id, playerId: s.playerId },
				update: {
					$set: {
						runs: Number(s.runs || 0),
						fours: Number(s.fours || 0),
						sixes: Number(s.sixes || 0),
						wickets: Number(s.wickets || 0),
						catches: Number(s.catches || 0),
						runouts: Number(s.runouts || 0),
					},
				},
				upsert: true,
			},
		});
	}

	if (bulk.length > 0) {
		await RawPlayerStats.bulkWrite(bulk, { ordered: false });
	}

	return {
		updatedCount: bulk.length,
		source: scraped.sourceUrl || null,
		unmatchedPlayers: unmatched,
		matchedPlayers: matched,
		nonZeroPlayers: nonZero,
		scorecardState: scraped?.matchHeader?.state || null,
		scorecardStatus: scraped?.matchHeader?.status || null,
	};
};

export const recalculatePointsForSession = async ({ session, selection, ruleSet }) => {
	const userPlayers =
		Array.isArray(selection?.userPlayers) && selection.userPlayers.length > 0
			? selection.userPlayers
			: Array.isArray(selection?.selectedPlayers)
				? selection.selectedPlayers
				: [];
	const friendPlayers = Array.isArray(selection?.friendPlayers) ? selection.friendPlayers : [];
	const userCaptain = selection?.userCaptain ?? selection?.captain ?? null;
	const friendCaptain = selection?.friendCaptain ?? null;

	const rawStats = await RawPlayerStats.find({ sessionId: session._id }).lean();
	const rawByPlayerId = new Map(rawStats.map((s) => [String(s.playerId), s]));

	const docsToInsert = [];
	for (const playerId of userPlayers) {
		const stats = rawByPlayerId.get(String(playerId)) || { playerId };
		const isCaptain = userCaptain && String(playerId) === String(userCaptain);
		const { totalPoints, ruleWiseBreakdown } = calculatePlayerPoints(stats, ruleSet.rules, isCaptain);
		docsToInsert.push({ sessionId: session._id, team: 'USER', playerId, totalPoints, ruleWiseBreakdown });
	}
	for (const playerId of friendPlayers) {
		const stats = rawByPlayerId.get(String(playerId)) || { playerId };
		const isCaptain = friendCaptain && String(playerId) === String(friendCaptain);
		const { totalPoints, ruleWiseBreakdown } = calculatePlayerPoints(stats, ruleSet.rules, isCaptain);
		docsToInsert.push({ sessionId: session._id, team: 'FRIEND', playerId, totalPoints, ruleWiseBreakdown });
	}

	await PointsBreakdown.deleteMany({ sessionId: session._id });
	const created = docsToInsert.length > 0 ? await PointsBreakdown.insertMany(docsToInsert, { ordered: true }) : [];

	const userTotalPoints = created
		.filter((r) => String(r?.team || 'USER') === 'USER')
		.reduce((sum, row) => sum + (typeof row.totalPoints === 'number' ? row.totalPoints : 0), 0);
	const friendTotalPoints = created
		.filter((r) => String(r?.team || 'USER') === 'FRIEND')
		.reduce((sum, row) => sum + (typeof row.totalPoints === 'number' ? row.totalPoints : 0), 0);
	return {
		playerWisePoints: created,
		userTotalPoints,
		friendTotalPoints,
		totalPoints: userTotalPoints + friendTotalPoints,
	};
};

export const refreshStatsAndRecalculateForSessionId = async ({ sessionId, userId, force = false }) => {
	if (!mongoose.Types.ObjectId.isValid(sessionId)) {
		const err = new Error('Invalid sessionId');
		err.statusCode = 400;
		throw err;
	}

	const session = await MatchSession.findOne(userId ? { _id: sessionId, userId } : { _id: sessionId }).lean();
	if (!session) {
		const err = new Error('MatchSession not found');
		err.statusCode = 404;
		throw err;
	}

	const selection = await PlayerSelection.findOne({ sessionId }).lean();
	if (!selection) {
		const err = new Error('PlayerSelection not found');
		err.statusCode = 404;
		throw err;
	}
	if (!selection.isFrozen) {
		const err = new Error('PlayerSelection must be frozen');
		err.statusCode = 409;
		throw err;
	}

	if (!force) {
		// If no friend team is selected, still allow refresh for user's team.
	}

	const ruleSet = await RuleSet.findById(session.rulesetId).lean();
	if (!ruleSet) {
		const err = new Error('RuleSet not found');
		err.statusCode = 404;
		throw err;
	}

	const refreshed = await refreshRawStatsFromCricbuzzForSession({ session, selection });
	const recalced = await recalculatePointsForSession({ session, selection, ruleSet });

	return {
		message: 'Stats refreshed and points recalculated',
		statsUpdated: refreshed.updatedCount,
		sourceUrl: refreshed.source,
		unmatchedPlayers: refreshed.unmatchedPlayers,
		matchedCount: Array.isArray(refreshed.matchedPlayers) ? refreshed.matchedPlayers.length : 0,
		nonZeroCount: Array.isArray(refreshed.nonZeroPlayers) ? refreshed.nonZeroPlayers.length : 0,
		scorecardState: refreshed.scorecardState,
		scorecardStatus: refreshed.scorecardStatus,
		...recalced,
	};
};

export default {
	refreshRawStatsFromCricbuzzForSession,
	recalculatePointsForSession,
	refreshStatsAndRecalculateForSessionId,
};
