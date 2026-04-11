import express from 'express';
import {
	createFriend,
	createFriendInviteLink,
	getFriends,
	deleteFriend,
} from '../controllers/friend.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const router = express.Router();

// Protect all routes with auth middleware
router.use(authMiddleware);

router.post('/', createFriend);
router.get('/', getFriends);
router.delete('/:friendId', deleteFriend);
router.post('/:friendId/live-invite', createFriendInviteLink);

export default router;
