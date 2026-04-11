import express from 'express';

import {
  cancelLiveRoom,
  createLiveRoom,
  freezeLiveRoom,
  getLiveRoomById,
  getLiveRoomOptions,
  listMyLiveRooms,
  pickLiveRoomPlayer,
  selectLiveRoomCaptain,
  setLiveRoomReady,
} from '../controllers/liveRoom.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/', listMyLiveRooms);
router.get('/options/:friendId', getLiveRoomOptions);
router.post('/', createLiveRoom);
router.get('/:roomId', getLiveRoomById);
router.post('/:roomId/ready', setLiveRoomReady);
router.post('/:roomId/pick', pickLiveRoomPlayer);
router.post('/:roomId/captain', selectLiveRoomCaptain);
router.post('/:roomId/freeze', freezeLiveRoom);
router.post('/:roomId/cancel', cancelLiveRoom);

export default router;
