import express from 'express';
import multer from 'multer';
import {
  subscribeCinemaRwa,
  notifySubscribers,
  changeSubscribeStatus,
  getSubscribers
} from '../controllers/subscribeController.js';
import { authenticateToken,requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Prepare multer for handling single image uploads (memory storage)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image file types are allowed'));
    }
    cb(null, true);
  }
});

router.post('/new', subscribeCinemaRwa);
router.post('/notify',authenticateToken,requireAdmin, upload.single('image'), notifySubscribers);
router.put('/status',authenticateToken,requireAdmin, changeSubscribeStatus);
router.get('/subscribers', getSubscribers);

export default router;