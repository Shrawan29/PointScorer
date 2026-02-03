import express from 'express';
import { createFriend, getFriends, deleteFriend } from '../controllers/friend.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const router = express.Router();

// Protect all routes with auth middleware
router.use(authMiddleware);

router.post('/', createFriend);
router.get('/', getFriends);
router.delete('/:friendId', deleteFriend);

export default router;
