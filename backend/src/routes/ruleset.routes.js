import express from 'express';

import {
	createRuleSet,
	deleteRuleSet,
	getRuleSetById,
	getRuleSetsByFriend,
	updateRuleSet,
} from '../controllers/ruleset.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/', createRuleSet);
router.get('/friend/:friendId', getRuleSetsByFriend);
router.get('/:rulesetId', getRuleSetById);
router.put('/:rulesetId', updateRuleSet);
router.delete('/:rulesetId', deleteRuleSet);

export default router;
