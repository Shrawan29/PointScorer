import express from 'express';

import {
	calculatePointsForSession,
	getDetailedBreakdownForSession,
	getRawStatsForSession,
	refreshStatsAndRecalculate,
	upsertRawStatsForSession,
} from '../controllers/scoring.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/session/:sessionId/stats', getRawStatsForSession);
router.get('/session/:sessionId/breakdown', getDetailedBreakdownForSession);
router.post('/session/:sessionId/stats', upsertRawStatsForSession);
router.post('/session/:sessionId/calculate', calculatePointsForSession);
router.post('/session/:sessionId/refresh', refreshStatsAndRecalculate);

export default router;
