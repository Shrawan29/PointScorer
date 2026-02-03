import {
	scrapeTodayAndLiveMatches,
	scrapeUpcomingMatches,
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

const shouldBypassCache = (req) => {
	const v = String(req?.query?.nocache || req?.query?.refresh || '').toLowerCase();
	return v === '1' || v === 'true' || v === 'yes';
};

export const getMatches = async (req, res, next) => {
	try {
		// Check cache first unless bypassed
		if (!shouldBypassCache(req)) {
			const cached = getCachedData('today_matches');
			if (cached) {
				return res.status(200).json(cached);
			}
		} else {
			delete cache.today_matches;
		}

		const matches = await scrapeTodayAndLiveMatches();
		if (!matches || matches.length === 0) {
			return res.status(502).json({ message: 'Failed to fetch matches' });
		}
		
		// Cache successful response
		setCachedData('today_matches', matches);
		
		return res.status(200).json(matches);
	} catch (error) {
		next(error);
	}
};

export const getUpcomingMatches = async (req, res, next) => {
	try {
		// Check cache first unless bypassed
		if (!shouldBypassCache(req)) {
			const cached = getCachedData('upcoming_matches');
			if (cached) {
				return res.status(200).json(cached);
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
		
		return res.status(200).json(matches);
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