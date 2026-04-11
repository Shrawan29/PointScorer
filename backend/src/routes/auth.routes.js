import express from 'express';
import {
	register,
	login,
	logout,
	forceLogoutOtherSession,
	changePassword,
	requestPasswordReset,
	acceptFriendInvite,
	getUpdateNoticeStatus,
	markUpdateNoticeSeen,
} from '../controllers/auth.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/request-password-reset', requestPasswordReset);
router.post('/logout', authMiddleware, logout);
router.post('/force-logout-other-session', forceLogoutOtherSession);
router.post('/change-password', authMiddleware, changePassword);
router.post('/accept-friend-invite', authMiddleware, acceptFriendInvite);
router.get('/update-notice/:version', authMiddleware, getUpdateNoticeStatus);
router.post('/update-notice/:version/seen', authMiddleware, markUpdateNoticeSeen);

export default router;
