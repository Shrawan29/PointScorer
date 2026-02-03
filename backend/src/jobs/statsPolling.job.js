import MatchSession from '../models/MatchSession.model.js';
import PlayerSelection from '../models/PlayerSelection.model.js';
import { refreshStatsAndRecalculateForSessionId } from '../services/statsRefresh.service.js';

const POLL_INTERVAL_MS = Number(process.env.STATS_POLL_INTERVAL_MS || 15 * 60_000);
const ENABLED = String(process.env.ENABLE_STATS_POLLING ?? 'true').toLowerCase() === 'true';
const MAX_SESSIONS_PER_TICK = Number(process.env.STATS_POLL_MAX_SESSIONS || 10);

export const startStatsPollingJob = () => {
	if (!ENABLED) {
		console.log('[StatsPolling] Disabled');
		return () => {};
	}

	console.log(`[StatsPolling] Started (interval=${POLL_INTERVAL_MS}ms, max=${MAX_SESSIONS_PER_TICK}/tick)`);

	const timer = setInterval(async () => {
		try {
			// Only consider sessions created recently to avoid scraping old history forever
			const since = new Date(Date.now() - 3 * 24 * 60 * 60_000);
			const sessions = await MatchSession.find({ createdAt: { $gte: since } })
				.sort({ updatedAt: -1 })
				.limit(MAX_SESSIONS_PER_TICK)
				.lean();
			if (!sessions || sessions.length === 0) return;

			const sessionIds = sessions.map((s) => s._id);
			const frozenSelections = await PlayerSelection.find({ sessionId: { $in: sessionIds }, isFrozen: true })
				.select('sessionId')
				.lean();
			const frozenSet = new Set(frozenSelections.map((s) => String(s.sessionId)));

			for (const s of sessions) {
				if (!frozenSet.has(String(s._id))) continue;
				// eslint-disable-next-line no-await-in-loop
				await refreshStatsAndRecalculateForSessionId({ sessionId: String(s._id), userId: null, force: true }).catch((err) => {
					console.error('[StatsPolling] Session refresh failed', {
						sessionId: String(s._id),
						message: err?.message,
					});
				});
			}
		} catch (err) {
			console.error('[StatsPolling] Tick failed', { message: err?.message });
		}
	}, POLL_INTERVAL_MS);

	return () => clearInterval(timer);
};

export default { startStatsPollingJob };
