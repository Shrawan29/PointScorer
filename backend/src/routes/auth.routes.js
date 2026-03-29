import express from 'express';
import { register, login, logout, forceLogoutOtherSession, changePassword } from '../controllers/auth.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', authMiddleware, logout);
router.post('/force-logout-other-session', forceLogoutOtherSession);
router.post('/change-password', authMiddleware, changePassword);

export default router;
