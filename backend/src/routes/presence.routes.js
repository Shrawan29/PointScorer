import express from 'express';

import { getLinkedFriendsPresence, heartbeat } from '../controllers/presence.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/heartbeat', heartbeat);
router.get('/friends', getLinkedFriendsPresence);

export default router;
