import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import tryonRoutes from './routes/tryon.js';
import chatRoutes from './routes/chatRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files for results
const isVercel = process.env.VERCEL === '1';
const resultsDir = isVercel 
  ? path.join('/tmp', 'results') 
  : path.join(process.cwd(), 'uploads', 'results');

if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
}
app.use('/results', express.static(resultsDir));

// Routes
app.use('/api', tryonRoutes);
app.use('/api', chatRoutes);

app.get('/', (req, res) => {
    res.send('🧥 Try-On Backend is running...');
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`🧥 Try-On Backend running on http://localhost:${PORT}`);
    });
}

export default app;
