import express from 'express';

import {
	getMatches,
	getUpcomingMatches,
	getSquads,
	getScorecard,
} from '../controllers/cricket.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/matches', getMatches);
router.get('/matches/upcoming', getUpcomingMatches);
router.get('/matches/:matchId/squads', getSquads);
router.get('/matches/:matchId/scorecard', getScorecard);

export default router;
