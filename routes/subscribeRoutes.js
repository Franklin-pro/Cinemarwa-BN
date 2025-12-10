import express from 'express';
import {
  subscribeCinemaRwa,
  notifySubscribers,
  changeSubscribeStatus,
  getSubscribers
} from '../controllers/subscribeController.js';
import { authenticateToken,requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/new', subscribeCinemaRwa);
router.post('/notify',requireAdmin, notifySubscribers);
router.put('/status',requireAdmin, changeSubscribeStatus);
router.get('/subscribers', getSubscribers);

export default router;