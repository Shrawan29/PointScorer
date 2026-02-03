import express from 'express';

import { getWhatsAppBreakdownShareText, getWhatsAppShareText } from '../controllers/share.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/whatsapp/:sessionId', getWhatsAppShareText);
router.get('/whatsapp-breakdown/:sessionId', getWhatsAppBreakdownShareText);

export default router;
