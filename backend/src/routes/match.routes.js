import express from 'express';

import {
	createMatchSession,
	getMatches,
	getMatchById,
	getMatchSessionById,
	getMatchSessionsByFriend,
	getMatchSessionsByRuleSet,
} from '../controllers/match.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/', getMatches);
router.post('/', createMatchSession);
router.get('/session/:sessionId', getMatchSessionById);
router.get('/friend/:friendId', getMatchSessionsByFriend);
router.get('/ruleset/:rulesetId', getMatchSessionsByRuleSet);
router.get('/:matchId', getMatchById);

export default router;
