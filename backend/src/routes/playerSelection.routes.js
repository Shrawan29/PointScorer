import express from 'express';

import {
  createOrUpdateSelection,
  freezeSelection,
  getSelectionBySession,
} from '../controllers/playerSelection.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/', createOrUpdateSelection);
router.post('/freeze/:sessionId', freezeSelection);
router.get('/:sessionId', getSelectionBySession);

export default router;
