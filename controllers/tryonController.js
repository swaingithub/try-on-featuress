import {
  virtualTryOn,
  virtualTryOnByText,
  generateOutfitImage,
  analyzeBodyType,
} from '../services/zaiService.js';
import { fileToBase64DataUrl, saveBase64Image, getMimeType } from '../utils/imageUtils.js';
import path from 'path';
import fs from 'fs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOutputDir() {
  const dir = path.join(process.cwd(), 'uploads', 'results');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function cleanupFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {}
}

// ─── Controllers ──────────────────────────────────────────────────────────────

export async function handleTryOn(req, res) {
  const userPhoto = req.files?.userPhoto?.[0];
  const productImage = req.files?.productImage?.[0];

  try {
    if (!userPhoto) return res.status(400).json({ error: 'User photo is required' });
    if (!productImage) return res.status(400).json({ error: 'Product image is required' });

    const { size = '768x1344' } = req.body;

    const userImageBase64 = fileToBase64DataUrl(userPhoto.path, getMimeType(userPhoto.originalname));
    const productImageBase64 = fileToBase64DataUrl(productImage.path, getMimeType(productImage.originalname));

    const result = await virtualTryOn(userImageBase64, productImageBase64, size);

    const resultFilename = `tryon-${Date.now()}.png`;
    const outputDir = getOutputDir();

    try {
      saveBase64Image(result.resultImage, outputDir, resultFilename);
    } catch (e) {
      console.warn('Failed to save result image to disk:', e.message);
    }

    cleanupFile(userPhoto.path);
    cleanupFile(productImage.path);

    res.json({
      success: true,
      resultImage: `data:image/png;base64,${result.resultImage}`,
      resultUrl: `/results/${resultFilename}`,
      userDescription: result.userDescription,
      productDescription: result.productDescription,
      combinedDescription: result.combinedDescription,
      analysisMethod: result.analysisMethod,
    });
  } catch (error) {
    console.error('[tryonController] Try-on error:', error);
    cleanupFile(userPhoto?.path);
    cleanupFile(productImage?.path);
    res.status(500).json({ error: 'Failed to generate try-on image', details: error.message });
  }
}

export async function handleTryOnByText(req, res) {
  const userPhoto = req.file;
  try {
    if (!userPhoto) return res.status(400).json({ error: 'User photo is required' });
    const { prompt, size = '768x1344' } = req.body;
    if (!prompt) {
      cleanupFile(userPhoto.path);
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const userImageBase64 = fileToBase64DataUrl(userPhoto.path, getMimeType(userPhoto.originalname));
    const result = await virtualTryOnByText(userImageBase64, prompt.trim(), size);

    const resultFilename = `tryon-text-${Date.now()}.png`;
    const outputDir = getOutputDir();
    saveBase64Image(result.resultImage, outputDir, resultFilename);

    cleanupFile(userPhoto.path);

    res.json({
      success: true,
      resultImage: `data:image/png;base64,${result.resultImage}`,
      resultUrl: `/results/${resultFilename}`,
      userDescription: result.userDescription,
    });
  } catch (error) {
    cleanupFile(userPhoto?.path);
    res.status(500).json({ error: 'Failed to generate try-on image', details: error.message });
  }
}

export async function handleGenerateOutfit(req, res) {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    const resultBase64 = await generateOutfitImage(prompt.trim());
    res.json({ success: true, outfitImage: `data:image/png;base64,${resultBase64}` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate outfit image', details: error.message });
  }
}

export async function handleAnalyze(req, res) {
  const userPhoto = req.file;
  try {
    if (!userPhoto) return res.status(400).json({ error: 'User photo is required' });
    const imageBase64 = fileToBase64DataUrl(userPhoto.path, getMimeType(userPhoto.originalname));
    const analysis = await analyzeBodyType(imageBase64);
    cleanupFile(userPhoto.path);
    res.json({ success: true, analysis });
  } catch (error) {
    cleanupFile(userPhoto?.path);
    res.status(500).json({ error: 'Failed to analyze image', details: error.message });
  }
}
