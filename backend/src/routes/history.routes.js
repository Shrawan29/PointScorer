import express from 'express';

import { getHistoryByRuleSet, getMatchResult } from '../controllers/history.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/ruleset/:friendId/:rulesetId', getHistoryByRuleSet);
router.get('/match/:sessionId', getMatchResult);

export default router;
