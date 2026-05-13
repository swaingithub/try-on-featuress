import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

// ─── Configuration ────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn('[chatService] GEMINI_API_KEY not found in environment variables.');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Maps standard role names to Gemini role names
 */
function mapRole(role) {
  if (role === 'assistant') return 'model';
  return 'user';
}

/**
 * Converts messages to Gemini chat history format
 */
function convertToGeminiHistory(messages) {
  // Gemini expects history to NOT include the current message
  // and roles to be 'user' and 'model'
  const history = messages.slice(0, -1).map(msg => ({
    role: mapRole(msg.role),
    parts: [{ text: msg.content }],
  }));
  
  const lastMessage = messages[messages.length - 1].content;
  
  return { history, lastMessage };
}

// ─── Chat Functions ───────────────────────────────────────────────────────────

/**
 * Text-based e-commerce chat (Gemini 1.5 Flash)
 * Handles product search, filtering, recommendations, Q&A
 */
export async function chatECommerce(messages, productContext = null) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      systemInstruction: productContext 
        ? `${ECOMMERCE_SYSTEM_PROMPT}\n\n📋 CURRENT STORE CONTEXT:\n${productContext}`
        : ECOMMERCE_SYSTEM_PROMPT,
    });

    const { history, lastMessage } = convertToGeminiHistory(messages);

    const chat = model.startChat({
      history: history,
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.8,
      },
    });

    const result = await chat.sendMessage(lastMessage);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('[chatService] Gemini chat failed:', error);
    throw error;
  }
}

/**
 * Analyze a product image with e-commerce context (Gemini 1.5 Flash)
 * Identifies product type, style, price estimate, similar items
 */
export async function analyzeProductChat(imageBase64, userQuestion = null) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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

    // Extract base64 data and mime type
    // Expected format: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...
    const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      throw new Error('Invalid image format. Expected data URL with base64 data.');
    }

    const mimeType = match[1];
    const data = match[2];

    const imagePart = {
      inlineData: {
        data: data,
        mimeType: mimeType
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('[chatService] Gemini vision failed:', error);
    throw error;
  }
}

/**
 * Search/filter products by text description (Gemini 1.5 Flash)
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
 * Get outfit recommendations based on occasion (Gemini 1.5 Flash)
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

