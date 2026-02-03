import {
	scrapeTodayAndLiveMatches,
	scrapeUpcomingMatches,
	scrapeMatchSquadsAndPlayingXI,
	scrapeMatchScorecard,
} from '../services/scraper.service.js';

export const getMatches = async (req, res, next) => {
	try {
		const matches = await scrapeTodayAndLiveMatches();
		if (!matches || matches.length === 0) {
			return res.status(502).json({ message: 'Failed to fetch matches' });
		}
		return res.status(200).json(matches);
	} catch (error) {
		next(error);
	}
};

export const getUpcomingMatches = async (req, res, next) => {
	try {
		const matches = await scrapeUpcomingMatches();
		if (!matches || matches.length === 0) {
			return res.status(502).json({ message: 'Failed to fetch upcoming matches' });
		}
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