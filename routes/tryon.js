import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  handleTryOn,
  handleTryOnByText,
  handleGenerateOutfit,
  handleAnalyze,
} from '../controllers/tryonController.js';

const router = Router();

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const isVercel = process.env.VERCEL === '1';
    const uploadDir = isVercel 
      ? path.join('/tmp', 'uploads') 
      : path.join(process.cwd(), 'uploads', 'temp');
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

// Routes
router.post('/tryon', upload.fields([
  { name: 'userPhoto', maxCount: 1 },
  { name: 'productImage', maxCount: 1 }
]), handleTryOn);

router.post('/tryon/text', upload.single('userPhoto'), handleTryOnByText);
router.post('/outfit/generate', handleGenerateOutfit);
router.post('/analyze', upload.single('userPhoto'), handleAnalyze);

export default router;
