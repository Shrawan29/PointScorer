import MatchSession from '../models/MatchSession.model.js';
import { scrapeMatchScorecard } from '../services/scraper.service.js';

const POLL_INTERVAL_MS = Number(process.env.MATCH_POLL_INTERVAL_MS || 30000);

const extractStatus = (scorecardData) => {
	const raw =
		scorecardData?.status ||
		scorecardData?.match?.status ||
		scorecardData?.matchStatus ||
		scorecardData?.state ||
		scorecardData?.statusText;

	if (!raw || typeof raw !== 'string') return null;
	const status = raw.toLowerCase();

	if (
		status.includes('complete') ||
		status.includes('completed') ||
		status.includes('result') ||
		status.includes('won') ||
		status.includes('no result')
	) {
		return 'COMPLETED';
	}
	if (status.includes('live') || status.includes('in progress') || status.includes('ongoing')) {
		return 'LIVE';
	}
	if (status.includes('upcoming') || status.includes('scheduled')) {
		return 'UPCOMING';
	}
	return null;
};

const processSession = async (session) => {
	try {
		const scorecard = await scrapeMatchScorecard(session.realMatchId);
		if (!scorecard) return;

		const nextStatus = extractStatus(scorecard);
		if (!nextStatus) return;

		if (nextStatus === 'LIVE' && session.status !== 'LIVE') {
			await MatchSession.updateOne(
				{ _id: session._id, status: { $ne: 'LIVE' } },
				{ $set: { status: 'LIVE' } }
			);
			return;
		}

		if (nextStatus === 'COMPLETED' && session.status !== 'COMPLETED') {
			await MatchSession.updateOne(
				{ _id: session._id, status: { $ne: 'COMPLETED' } },
				{ $set: { status: 'COMPLETED' } }
			);
		}
	} catch (error) {
		console.error('[MatchPolling] Failed processing session', {
			sessionId: String(session?._id),
			message: error?.message,
		});
	}
};

export const startMatchPollingJob = () => {
	console.log('[MatchPolling] Job disabled for debugging');
	// Disabled for debugging
	// const timer = setInterval(async () => {
	// 	try {
	// 		const sessions = await MatchSession.find({
	// 			status: { $in: ['UPCOMING', 'LIVE'] },
	// 		}).lean();

	// 		if (!sessions || sessions.length === 0) return;

	// 		for (const session of sessions) {
	// 			// Sequential to avoid spikes; cached calls prevent repeats.
	// 			// eslint-disable-next-line no-await-in-loop
	// 			await processSession(session);
	// 		}
	// 	} catch (error) {
	// 		console.error('[MatchPolling] Tick failed', { message: error?.message });
	// 	}
	// }, POLL_INTERVAL_MS);

	// return () => clearInterval(timer);
	return () => {};
};

export default { startMatchPollingJob };
