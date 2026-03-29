import express from 'express';

import {
	getFriendPublicMatchBreakdown,
	getFriendPublicMatchResult,
	getFriendPublicView,
	refreshFriendPublicSession,
} from '../controllers/public.controller.js';

const router = express.Router();

router.get('/friends/:token', getFriendPublicView);
router.get('/friends/:token/sessions/:sessionId/result', getFriendPublicMatchResult);
router.get('/friends/:token/sessions/:sessionId/breakdown', getFriendPublicMatchBreakdown);
router.post('/friends/:token/sessions/:sessionId/refresh', refreshFriendPublicSession);

export default router;
