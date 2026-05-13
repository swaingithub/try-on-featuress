import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── State ────────────────────────────────────────────────────────────────────

let zaiInstance = null;
let zaiConfig = null;

// ─── Configuration ────────────────────────────────────────────────────────────

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

  throw new Error('Configuration not found. Set ZAI_BASE_URL + ZAI_API_KEY env vars, or create .z-ai-config file.');
}

// ─── ZAI Instance ─────────────────────────────────────────────────────────────

async function getZAI() {
  if (zaiInstance) return zaiInstance;

  const config = getConfig();
  const cwdConfig = path.join(process.cwd(), '.z-ai-config');
  if (!fs.existsSync(cwdConfig)) {
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

// ─── Raw Fetch Helper ─────────────────────────────────────────────────────────

async function rawFetch(endpoint, body) {
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
      const isRateLimit =
        error.message &&
        (error.message.includes('1305') ||
          error.message.includes('访问量过大') ||
          error.message.includes('429') ||
          error.message.includes('rate'));

      if (isRateLimit && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`⏳ Rate limited. Retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// ─── E-Commerce System Prompt ─────────────────────────────────────────────────

const ECOMMERCE_SYSTEM_PROMPT = `You are an expert AI e-commerce shopping assistant. Your name is "StyleBot". You help customers with:

🛍️ PRODUCT DISCOVERY
- Find products based on description, style, occasion, or budget
- Suggest similar or complementary items
- Compare products and recommend the best option

🔍 SEARCH & FILTER HELP
- Help users narrow down choices by price, color, size, brand, rating, etc.
- Explain product specifications and features
- Sort recommendations by relevance, price, popularity

📊 PRODUCT ANALYSIS
- Analyze product details from descriptions or images
- Highlight pros and cons
- Suggest styling tips and outfit combinations

💡 SHOPPING ADVICE
- Recommend outfits for occasions (weddings, interviews, casual, parties)
- Seasonal wardrobe suggestions
- Size and fit guidance
- Budget-friendly alternatives

📋 FORMATTING RULES
- Use bullet points for lists
- Use emojis for visual appeal (👗👔👖👟👜 etc.)
- Include price ranges when discussing budgets
- Be specific and actionable
- When suggesting products, format as: **Product Name** — Brief description (Price range)
- If you don't know exact prices, give typical ranges
- Always ask follow-up questions to refine recommendations

Keep responses concise but helpful. Be friendly, enthusiastic, and fashion-savvy.`;

// ─── Chat Functions ───────────────────────────────────────────────────────────

/**
 * Text-based e-commerce chat (FREE — glm-4-flash)
 * Handles product search, filtering, recommendations, Q&A
 */
export async function chatECommerce(messages, productContext = null) {
  const systemMessage = {
    role: 'system',
    content: productContext
      ? `${ECOMMERCE_SYSTEM_PROMPT}\n\n📋 CURRENT STORE CONTEXT:\n${productContext}`
      : ECOMMERCE_SYSTEM_PROMPT,
  };

  const allMessages = [systemMessage, ...messages];

  const zai = await getZAI();

  // Try SDK first
  if (zai) {
    try {
      const result = await retryWithBackoff(async () => {
        const response = await zai.chat.completions.create({
          model: 'glm-4-flash', // FREE text model
          messages: allMessages,
          max_tokens: 2048,
          temperature: 0.8,
        });
        return response.choices[0].message.content;
      }, 3, 2000);
      return result;
    } catch (sdkErr) {
      console.warn('[chatService] SDK chat failed, trying raw fetch:', sdkErr.message);
    }
  }

  // Fallback: raw fetch
  return retryWithBackoff(async () => {
    const result = await rawFetch('/chat/completions', {
      model: 'glm-4-flash',
      messages: allMessages,
      max_tokens: 2048,
      temperature: 0.8,
    });
    return result.choices?.[0]?.message?.content || '';
  }, 3, 2000);
}

/**
 * Analyze a product image with e-commerce context (FREE — glm-4.6v-flash)
 * Identifies product type, style, price estimate, similar items
 */
export async function analyzeProductChat(imageBase64, userQuestion = null) {
  const prompt = userQuestion
    ? `Analyze this product image and answer the user's question.

User's question: ${userQuestion}

Provide a detailed analysis including:
1. Product identification (type, brand if visible, category)
2. Key features and specifications
3. Estimated price range
4. Style and occasion suitability
5. Similar product suggestions
6. Pros and cons
7. Size/fit recommendations

Be specific and helpful for shopping decisions.`
    : `Analyze this product image for an e-commerce shopping assistant:

1. What is this product? (type, category, subcategory)
2. Key features and design details
3. Color, material, and texture
4. Estimated price range (budget/mid-range/premium)
5. Target audience and occasion
6. Style category (casual, formal, sportswear, etc.)
7. Similar or complementary products to suggest
8. Pros and cons of this product

Be detailed and specific for shopping recommendations.`;

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

  // Try SDK first
  if (zai) {
    try {
      const result = await retryWithBackoff(async () => {
        const response = await zai.chat.completions.create({
          model: 'glm-4.6v-flash', // FREE vision model
          messages: visionMessages,
          max_tokens: 1500,
          temperature: 0.7,
        });
        return response.choices[0].message.content;
      }, 3, 3000);
      return result;
    } catch (sdkErr) {
      console.warn('[chatService] SDK vision failed, trying raw fetch:', sdkErr.message);
    }
  }

  // Fallback: raw fetch
  return retryWithBackoff(async () => {
    const result = await rawFetch('/chat/completions', {
      model: 'glm-4.6v-flash',
      messages: visionMessages,
      max_tokens: 1500,
      temperature: 0.7,
    });
    return result.choices?.[0]?.message?.content || '';
  }, 3, 3000);
}

/**
 * Search/filter products by text description (FREE — glm-4-flash)
 * Returns structured product suggestions
 */
export async function searchProducts(query, filters = {}) {
  const filterText = Object.entries(filters)
    .filter(([_, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  const searchMessages = [
    {
      role: 'user',
      content: `I'm looking for: ${query}

${filterText ? `My preferences: ${filterText}` : ''}

Please suggest products with:
- Product name and brief description
- Typical price range
- Why it matches my search
- Where to find similar items (general shopping platforms)
- Alternative options at different price points

Format as a clear, organized list.`,
    },
  ];

  return await chatECommerce(searchMessages);
}

/**
 * Get outfit recommendations based on occasion (FREE — glm-4-flash)
 */
export async function getOutfitRecommendation(occasion, budget = null, style = null) {
  const messages = [
    {
      role: 'user',
      content: `Suggest a complete outfit for: ${occasion}
${budget ? `Budget: ${budget}` : ''}
${style ? `Style preference: ${style}` : ''}

Include:
1. Complete outfit breakdown (top, bottom, shoes, accessories)
2. Specific product suggestions with price ranges
3. Color coordination tips
4. Alternative options for different budgets
5. Where to shop for each item`,
    },
  ];

  return await chatECommerce(messages);
}
