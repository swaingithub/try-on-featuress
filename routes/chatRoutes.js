import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import {
  handleChat,
  handleProductAnalysis,
  handleProductSearch,
  handleOutfitRecommendation,
} from '../controllers/chatController.js';

const router = Router();

// Multer for product image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `chat-${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Chat Routes ──────────────────────────────────────────────────────────────

// General e-commerce chat (multi-turn)
router.post('/chat', handleChat);

// Analyze product image with vision AI
router.post('/chat/analyze-product', upload.single('productImage'), handleProductAnalysis);

// Search/filter products
router.post('/chat/search', handleProductSearch);

// Get outfit recommendations
router.post('/chat/outfit', handleOutfitRecommendation);

export default router;
