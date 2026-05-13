import { GoogleGenerativeAI } from '@google/generative-ai';
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── State ────────────────────────────────────────────────────────────────────

let genAI = null;
let zaiInstance = null;
let zaiConfig = null;

// ─── Configuration ────────────────────────────────────────────────────────────

function getGemini() {
  if (genAI) return genAI;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  genAI = new GoogleGenerativeAI(apiKey);
  return genAI;
}

function getConfig() {
  if (zaiConfig) return zaiConfig;

  if (process.env.ZAI_BASE_URL && process.env.ZAI_API_KEY) {
    zaiConfig = {
      baseUrl: process.env.ZAI_BASE_URL,
      apiKey: process.env.ZAI_API_KEY,
    };
    return zaiConfig;
  }

  const configPaths = [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
  ];

  for (const p of configPaths) {
    try {
      if (fs.existsSync(p)) {
        zaiConfig = JSON.parse(fs.readFileSync(p, 'utf8'));
        return zaiConfig;
      }
    } catch (_) {}
  }

  // Fallback default
  return { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: process.env.ZAI_API_KEY || '' };
}

async function getZAI() {
  if (zaiInstance) return zaiInstance;
  const config = getConfig();
  const cwdConfig = path.join(process.cwd(), '.z-ai-config');
  if (!fs.existsSync(cwdConfig) && config.apiKey) {
    try {
      fs.writeFileSync(cwdConfig, JSON.stringify(config, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[chatService] Could not write temp config:', err.message);
    }
  }
  try {
    zaiInstance = await ZAI.create();
    return zaiInstance;
  } catch (sdkErr) {
    console.warn('[chatService] ZAI.create() failed:', sdkErr.message);
    return null;
  }
}

async function rawFetchZAI(endpoint, body) {
  const config = getConfig();
  const url = `${config.baseUrl}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BigModel API ${response.status}: ${errorText}`);
  }
  return response.json();
}

// ─── Retry Utility ────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 2000) {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRetryable = error.message && (
        error.message.includes('429') || 
        error.message.includes('503') || 
        error.message.includes('quota') ||
        error.message.includes('rate')
      );

      if (isRetryable && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`⏳ Busy. Retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// ─── E-Commerce System Prompt ─────────────────────────────────────────────────

const ECOMMERCE_SYSTEM_PROMPT = `You are an expert AI e-commerce gift concierge. Your name is "3Boxes AI Concierge". You help customers with:

🛍️ GIFT DISCOVERY
- Find the perfect gift based on recipient, occasion, or personality
- Suggest curated gift boxes and hampers
- Recommend luxury jewellery and lifestyle items

🔍 SEARCH & FILTER HELP
- Help users narrow down choices by price, category, material, etc.
- Explain the craftsmanship and story behind products
- Sort recommendations by premium quality and occasion fit

📊 PRODUCT ANALYSIS
- Analyze product details from descriptions or images
- Highlight why it makes a great gift
- Suggest personalization and gift-wrapping options

💡 GIFTING ADVICE
- Recommend gifts for specific occasions (Weddings, Anniversaries, Corporate, Birthdays)
- Seasonal gifting guides
- Help with luxury presentation and etiquette
- Budget-friendly luxury alternatives

📋 FORMATTING RULES
- Use bullet points for lists
- Use elegant emojis for visual appeal (💎🎁✨🕯️👔 etc.)
- Include price ranges when discussing budgets
- Be specific, professional, and helpful
- When suggesting products, format as: **Product Name** — Why it's a great gift (Price range)
- Always ask follow-up questions to understand the recipient better

Keep responses concise, premium, and helpful. Be friendly, enthusiastic, and sophisticated.`;

// ─── Chat Functions ───────────────────────────────────────────────────────────

/**
 * Text-based e-commerce chat.
 * Tries Gemini first, fallbacks to Z AI (Zhipu).
 */
export async function chatECommerce(messages, productContext = null) {
  const gemini = getGemini();

  if (gemini) {
    try {
      const model = gemini.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        systemInstruction: productContext 
          ? `${ECOMMERCE_SYSTEM_PROMPT}\n\n📋 CURRENT STORE CONTEXT:\n${productContext}`
          : ECOMMERCE_SYSTEM_PROMPT,
      });

      const history = messages.slice(0, -1).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));
      const lastMessage = messages[messages.length - 1].content;

      return await retryWithBackoff(async () => {
        const chat = model.startChat({ history });
        const result = await chat.sendMessage(lastMessage);
        return result.response.text();
      });
    } catch (err) {
      console.warn('[chatService] Gemini failed, falling back to ZAI:', err.message);
    }
  }

  // Fallback to Z AI
  const systemMessage = {
    role: 'system',
    content: productContext
      ? `${ECOMMERCE_SYSTEM_PROMPT}\n\n📋 CURRENT STORE CONTEXT:\n${productContext}`
      : ECOMMERCE_SYSTEM_PROMPT,
  };
  const allMessages = [systemMessage, ...messages];

  const zai = await getZAI();
  if (zai) {
    try {
      return await retryWithBackoff(async () => {
        const response = await zai.chat.completions.create({
          model: 'glm-4-flash',
          messages: allMessages,
          max_tokens: 2048,
          temperature: 0.8,
        });
        return response.choices[0].message.content;
      });
    } catch (sdkErr) {
      console.warn('[chatService] ZAI SDK failed, trying raw fetch:', sdkErr.message);
    }
  }

  return await retryWithBackoff(async () => {
    const result = await rawFetchZAI('/chat/completions', {
      model: 'glm-4-flash',
      messages: allMessages,
      max_tokens: 2048,
      temperature: 0.8,
    });
    return result.choices?.[0]?.message?.content || '';
  });
}

/**
 * Analyze product image.
 * Tries Gemini Vision first, fallbacks to Z AI Vision.
 */
export async function analyzeProductChat(imageBase64, userQuestion = null) {
  const gemini = getGemini();

  const prompt = userQuestion
    ? `Analyze this product image and answer the user's question.
User's question: ${userQuestion}
Provide a detailed analysis including identification, features, price range, and style.`
    : `Analyze this product image for an e-commerce shopping assistant:
Identify product, features, color/material, price range, and target audience.`;

  if (gemini) {
    try {
      const model = gemini.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      const imagePart = { inlineData: { data: base64Data, mimeType: 'image/png' } };

      return await retryWithBackoff(async () => {
        const result = await model.generateContent([ECOMMERCE_SYSTEM_PROMPT, prompt, imagePart]);
        return result.response.text();
      });
    } catch (err) {
      console.warn('[chatService] Gemini Vision failed, falling back to ZAI:', err.message);
    }
  }

  // Fallback to Z AI Vision
  const zai = await getZAI();
  const visionMessages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageBase64 } },
      ],
    },
  ];

  if (zai) {
    try {
      return await retryWithBackoff(async () => {
        const response = await zai.chat.completions.create({
          model: 'glm-4.6v-flash',
          messages: visionMessages,
          max_tokens: 1500,
          temperature: 0.7,
        });
        return response.choices[0].message.content;
      });
    } catch (sdkErr) {
      console.warn('[chatService] ZAI SDK Vision failed, trying raw fetch:', sdkErr.message);
    }
  }

  return await retryWithBackoff(async () => {
    const result = await rawFetchZAI('/chat/completions', {
      model: 'glm-4.6v-flash',
      messages: visionMessages,
      max_tokens: 1500,
      temperature: 0.7,
    });
    return result.choices?.[0]?.message?.content || '';
  });
}


/**
 * Search/filter products
 */
export async function searchProducts(query, filters = {}) {
  const filterText = Object.entries(filters)
    .filter(([_, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  const prompt = `I'm looking for: ${query}
${filterText ? `My preferences: ${filterText}` : ''}
Please suggest products with name, description, price range, and why they match.`;

  return await chatECommerce([{ role: 'user', content: prompt }]);
}

/**
 * Get outfit recommendations
 */
export async function getOutfitRecommendation(occasion, budget = null, style = null) {
  const prompt = `Suggest a complete outfit for: ${occasion}
${budget ? `Budget: ${budget}` : ''}
${style ? `Style preference: ${style}` : ''}
Include breakdown, price ranges, and styling tips.`;

  return await chatECommerce([{ role: 'user', content: prompt }]);
}

