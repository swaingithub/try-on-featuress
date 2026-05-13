import {
  chatECommerce,
  analyzeProductChat,
  searchProducts,
  getOutfitRecommendation,
} from '../services/chatService.js';
import { fileToBase64DataUrl, getMimeType } from '../utils/imageUtils.js';
import fs from 'fs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanupFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
}

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /api/chat
 * Body: { messages: [{role, content}], productContext?: string }
 *
 * General e-commerce chat. Supports multi-turn conversation.
 * Uses FREE glm-4-flash model.
 */
export async function handleChat(req, res) {
  try {
    const { messages, productContext } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    // Validate message format
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return res.status(400).json({ error: 'Each message must have role and content' });
      }
      if (!['user', 'assistant'].includes(msg.role)) {
        return res.status(400).json({ error: 'Message role must be "user" or "assistant"' });
      }
    }

    console.log(`[chatController] Chat request: ${messages.length} messages`);

    const reply = await chatECommerce(messages, productContext || null);

    res.json({
      success: true,
      reply,
      model: 'gemini-1.5-flash',
    });
  } catch (error) {
    console.error('[chatController] Chat error:', error);
    res.status(500).json({
      error: 'Chat failed',
      details: error.message,
    });
  }
}

/**
 * POST /api/chat/analyze-product
 * File: productImage (multipart upload)
 * Body: { question?: string }
 *
 * Analyze a product image using vision AI.
 * Uses FREE glm-4.6v-flash model.
 */
export async function handleProductAnalysis(req, res) {
  const productImage = req.file;

  try {
    if (!productImage) {
      return res.status(400).json({ error: 'Product image is required' });
    }

    const { question } = req.body;
    const mimeType = getMimeType(productImage.originalname);
    const imageBase64 = fileToBase64DataUrl(productImage.path, mimeType);

    console.log(`[chatController] Product analysis: ${productImage.originalname}`);

    const analysis = await analyzeProductChat(imageBase64, question || null);

    cleanupFile(productImage.path);

    res.json({
      success: true,
      analysis,
      model: 'gemini-1.5-flash',
    });
  } catch (error) {
    console.error('[chatController] Product analysis error:', error);
    cleanupFile(productImage?.path);

    res.status(500).json({
      error: 'Product analysis failed',
      details: error.message,
    });
  }
}

/**
 * POST /api/chat/search
 * Body: { query: string, filters?: { category?, priceRange?, color?, size?, brand?, style? } }
 *
 * Search for product suggestions.
 * Uses FREE glm-4-flash model.
 */
export async function handleProductSearch(req, res) {
  try {
    const { query, filters } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    console.log(`[chatController] Product search: "${query}"`);

    const results = await searchProducts(query.trim(), filters || {});

    res.json({
      success: true,
      results,
      model: 'gemini-1.5-flash',
    });
  } catch (error) {
    console.error('[chatController] Search error:', error);
    res.status(500).json({
      error: 'Product search failed',
      details: error.message,
    });
  }
}

/**
 * POST /api/chat/outfit
 * Body: { occasion: string, budget?: string, style?: string }
 *
 * Get outfit recommendations.
 * Uses FREE glm-4-flash model.
 */
export async function handleOutfitRecommendation(req, res) {
  try {
    const { occasion, budget, style } = req.body;

    if (!occasion || occasion.trim().length === 0) {
      return res.status(400).json({ error: 'Occasion is required' });
    }

    console.log(`[chatController] Outfit recommendation: "${occasion}"`);

    const recommendation = await getOutfitRecommendation(
      occasion.trim(),
      budget || null,
      style || null
    );

    res.json({
      success: true,
      recommendation,
      model: 'gemini-1.5-flash',
    });
  } catch (error) {
    console.error('[chatController] Outfit recommendation error:', error);
    res.status(500).json({
      error: 'Outfit recommendation failed',
      details: error.message,
    });
  }
}
