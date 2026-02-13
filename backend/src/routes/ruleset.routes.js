import express from 'express';

import {
	createRuleSet,
	deleteRuleSet,
	getRuleSetById,
	getRuleSetsByFriend,
	updateRuleSet,
	getAllUserRuleSets,
	getRuleSetTemplates,
} from '../controllers/ruleset.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/', createRuleSet);
router.get('/', getAllUserRuleSets);
router.get('/templates', getRuleSetTemplates);
router.get('/friend/:friendId', getRuleSetsByFriend);
router.get('/:rulesetId', getRuleSetById);
router.put('/:rulesetId', updateRuleSet);
router.delete('/:rulesetId', deleteRuleSet);

export default router;
