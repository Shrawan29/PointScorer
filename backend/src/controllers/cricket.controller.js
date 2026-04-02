import {
	scrapeTodayAndLiveMatches,
	scrapeUpcomingMatches,
	scrapeLatestIplEditionMatchesPlayedSoFar,
	scrapeMatchSquadsAndPlayingXI,
	scrapeMatchScorecard,
} from '../services/scraper.service.js';

// Simple in-memory cache with TTL
const cache = {};
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const getCachedData = (key) => {
	const cached = cache[key];
	if (!cached) return null;
	
	const age = Date.now() - cached.timestamp;
	if (age > CACHE_TTL) {
		delete cache[key];
		return null;
	}
	
	return cached.data;
};

const setCachedData = (key, data) => {
	cache[key] = {
		data,
		timestamp: Date.now(),
	};
};

const dedupeMatches = (matches) => {
	const out = [];
	const seen = new Set();

	for (const match of Array.isArray(matches) ? matches : []) {
		const key = String(
			match?.matchId ||
			match?.id ||
			match?.matchUrl ||
			`${String(match?.matchName || '').trim()}|${String(match?.team1 || '').trim()}|${String(match?.team2 || '').trim()}`,
		).trim();
		if (!key || seen.has(key)) continue;
		seen.add(key);
		out.push(match);
	}

	return out;
};

const shouldBypassCache = (req) => {
	const v = String(req?.query?.nocache || req?.query?.refresh || '').toLowerCase();
	return v === '1' || v === 'true' || v === 'yes';
};

const shouldIncludeIplSeason = (req) => {
	const v = String(req?.query?.includeIplSeason || req?.query?.iplSeason || req?.query?.ipl || '').toLowerCase();
	return v === '1' || v === 'true' || v === 'yes';
};

const TYPE_ALL = 'ALL';
const TYPE_T20 = 'T20';
const TYPE_ODI = 'ODI';
const TYPE_TEST = 'TEST';
const TYPE_IPL = 'IPL';

const normalizeMatchType = (value) => {
	if (!value) return null;
	const v = String(value).toUpperCase();
	if (v.includes('T20') || v.includes('T20I')) return TYPE_T20;
	if (v.includes('T10')) return TYPE_T20;
	if (v.includes('100 BALL') || v.includes('THE HUNDRED')) return TYPE_T20;
	if (v.includes('ODI') || v.includes('ONE DAY') || v.includes('ONE-DAY') || v.includes('LIST A') || v.includes('50 OVER')) return TYPE_ODI;
	if (v.includes('TEST') || v.includes('FIRST CLASS') || /\bFC\b/.test(v) || v.includes('4 DAY') || v.includes('5 DAY')) return TYPE_TEST;
	return null;
};

const teamsTextForSearch = (match) => {
	if (Array.isArray(match?.teams)) {
		return match.teams
			.map((t) => (typeof t === 'string' ? t : t?.name || t?.teamName || t?.shortName || t?.teamSName))
			.filter(Boolean)
			.join(' ');
	}
	return [match?.team1, match?.team2].filter(Boolean).join(' ');
};

const IPL_TEAM_TOKENS = new Set([
	'kkr',
	'kolkata knight riders',
	'srh',
	'sunrisers hyderabad',
	'mi',
	'mumbai indians',
	'csk',
	'chennai super kings',
	'rcb',
	'royal challengers bengaluru',
	'royal challengers bangalore',
	'dc',
	'delhi capitals',
	'rr',
	'rajasthan royals',
	'pbks',
	'punjab kings',
	'kxip',
	'kings xi punjab',
	'lsg',
	'lucknow super giants',
	'gt',
	'gujarat titans',
]);

const normalizeTeamToken = (value) =>
	String(value || '')
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

const isLikelyIplTeam = (value) => {
	const token = normalizeTeamToken(value);
	if (!token) return false;
	return IPL_TEAM_TOKENS.has(token);
};

const isLikelyIplTeamsPair = (match) => {
	const list = [];
	if (Array.isArray(match?.teams)) {
		for (const t of match.teams) {
			const name = typeof t === 'string' ? t : t?.name || t?.teamName || t?.shortName || t?.teamSName;
			if (name) list.push(name);
		}
	}
	if (match?.team1) list.push(match.team1);
	if (match?.team2) list.push(match.team2);
	if (list.length < 2) return false;
	return isLikelyIplTeam(list[0]) && isLikelyIplTeam(list[1]);
};

const isIplMatch = (match) => {
	const text = `${match?.league || ''} ${match?.seriesName || ''} ${match?.matchName || ''} ${match?.rawText || ''}`.toLowerCase();
	if (/indian premier league|\bipl\b/.test(text) && !/women|women's|womens|\bwpl\b/.test(text)) return true;
	return isLikelyIplTeamsPair(match);
};

const resolveRequestedMatchType = (req) => {
	const v = String(req?.query?.matchType || req?.query?.type || req?.query?.format || TYPE_ALL).trim().toUpperCase();
	if (!v || v === TYPE_ALL) return TYPE_ALL;
	if (v === TYPE_IPL) return TYPE_IPL;
	if (v === TYPE_T20 || v === 'T20I' || v === 'T10') return TYPE_T20;
	if (v === TYPE_ODI || v === 'ONE DAY' || v === 'ONE-DAY' || v === 'LIST A') return TYPE_ODI;
	if (v === TYPE_TEST || v === 'FIRST CLASS' || v === 'FC') return TYPE_TEST;
	return TYPE_ALL;
};

const resolveSearchQuery = (req) => String(req?.query?.search || req?.query?.q || '').trim().toLowerCase();

const filterMatches = (matches, { requestedType = TYPE_ALL, searchQuery = '' } = {}) => {
	const list = Array.isArray(matches) ? matches : [];
	const q = String(searchQuery || '').trim().toLowerCase();

	return list.filter((m) => {
		const normalizedType =
			normalizeMatchType(m?.matchType) ||
			normalizeMatchType(m?.matchFormat) ||
			normalizeMatchType(m?.format) ||
			normalizeMatchType(m?.matchName) ||
			normalizeMatchType(m?.rawText);
		const typeOk =
			requestedType === TYPE_ALL ||
			(requestedType === TYPE_IPL
				? isIplMatch(m)
				: normalizedType === requestedType);
		if (!typeOk) return false;

		if (!q) return true;
		const haystack = `${m?.matchName || ''} ${teamsTextForSearch(m)} ${m?.rawText || ''} ${m?.matchType || ''} ${m?.matchStatus || ''} ${m?.seriesName || ''} ${m?.league || ''}`.toLowerCase();
		return haystack.includes(q);
	});
};

export const getMatches = async (req, res, next) => {
	try {
		const requestedType = resolveRequestedMatchType(req);
		const searchQuery = resolveSearchQuery(req);
		const includeIplSeason = shouldIncludeIplSeason(req) || requestedType === TYPE_IPL;
		const cacheKey = includeIplSeason ? 'today_matches_with_ipl_recent' : 'today_matches';

		// Check cache first unless bypassed
		if (!shouldBypassCache(req)) {
			const cached = getCachedData(cacheKey);
			if (cached) {
				return res.status(200).json(filterMatches(cached, { requestedType, searchQuery }));
			}
		} else {
			delete cache[cacheKey];
		}

		const liveToday = await scrapeTodayAndLiveMatches();
		let payload = Array.isArray(liveToday) ? liveToday : [];

		if (includeIplSeason) {
			const iplRecent = await scrapeLatestIplEditionMatchesPlayedSoFar();
			payload = dedupeMatches([...(payload || []), ...(Array.isArray(iplRecent) ? iplRecent : [])]);
		}

		if (!payload || payload.length === 0) {
			return res.status(502).json({ message: 'Failed to fetch matches' });
		}
		
		// Cache successful response
		setCachedData(cacheKey, payload);
		
		return res.status(200).json(filterMatches(payload, { requestedType, searchQuery }));
	} catch (error) {
		next(error);
	}
};

export const getUpcomingMatches = async (req, res, next) => {
	try {
		const requestedType = resolveRequestedMatchType(req);
		const searchQuery = resolveSearchQuery(req);
		// Check cache first unless bypassed
		if (!shouldBypassCache(req)) {
			const cached = getCachedData('upcoming_matches');
			if (cached) {
				return res.status(200).json(filterMatches(cached, { requestedType, searchQuery }));
			}
		} else {
			delete cache.upcoming_matches;
		}

		const matches = await scrapeUpcomingMatches();
		if (!matches || matches.length === 0) {
			return res.status(502).json({ message: 'Failed to fetch upcoming matches' });
		}
		
		// Cache successful response
		setCachedData('upcoming_matches', matches);
		
		return res.status(200).json(filterMatches(matches, { requestedType, searchQuery }));
	} catch (error) {
		next(error);
	}
};

export const getSquads = async (req, res, next) => {
	try {
		const { matchId } = req.params;
		if (!matchId) {
			return res.status(400).json({ message: 'matchId is required' });
		}

		const data = await scrapeMatchSquadsAndPlayingXI(matchId);
		if (!data) {
			return res.status(502).json({ message: 'Failed to fetch match squads' });
		}
		return res.status(200).json(data);
	} catch (error) {
		next(error);
	}
};

export const getScorecard = async (req, res, next) => {
	try {
		const { matchId } = req.params;
		if (!matchId) {
			return res.status(400).json({ message: 'matchId is required' });
		}

		const scorecard = await scrapeMatchScorecard(matchId);
		if (!scorecard) {
			return res.status(502).json({ message: 'Failed to fetch match scorecard' });
		}
		return res.status(200).json(scorecard);
	} catch (error) {
		next(error);
	}
};

export default {
	getMatches,
	getUpcomingMatches,
	getSquads,
	getScorecard,
};