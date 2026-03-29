import express from 'express';

import {
	getFriendPublicMatchBreakdown,
	getFriendPublicMatchResult,
	getFriendPublicView,
} from '../controllers/public.controller.js';

const router = express.Router();

router.get('/friends/:token', getFriendPublicView);
router.get('/friends/:token/sessions/:sessionId/result', getFriendPublicMatchResult);
router.get('/friends/:token/sessions/:sessionId/breakdown', getFriendPublicMatchBreakdown);

export default router;
