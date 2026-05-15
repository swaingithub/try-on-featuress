import { fetchAllProducts, fetchAllCollections } from './productService.js';
import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Helper to build shop context
 */
async function getShopContext() {
  const [products, collections] = await Promise.all([
    fetchAllProducts(40),
    fetchAllCollections(15)
  ]);

  const shopUrl = `https://${process.env.SHOP_DOMAIN || '3boxesgifts.com'}`;

  const catalogContext = products.map(p => {
    const img = p.images?.[0]?.originalSrc || '';
    const variantId = p.variants?.[0]?.id || '';
    return `- ${p.title}: ${p.description.substring(0, 100)}... (Price: ${p.currencyCode} ${p.price}) [LINK: ${shopUrl}/products/${p.handle}] [IMG: ${img}] [VARIANT_ID: ${variantId}]`;
  }).join('\n');

  const collectionsContext = collections.map(c => 
    `- ${c.title} [LINK: ${shopUrl}/collections/${c.handle}]`
  ).join('\n');

  return { catalogContext, collectionsContext };
}

/**
 * Enhanced E-Commerce Chat using Gemini via Raw API (matches mobile backend logic)
 */
export async function chatECommerce(messages, productContext = null) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured in .env');
  }

  try {
    const { catalogContext, collectionsContext } = await getShopContext();

    const luxurySystemPrompt = `
You are the "3Boxes Luxury Concierge", a high-end personal shopper. 
Your goal is to provide a bespoke, sophisticated shopping experience.

CONVERSATION STYLE:
- Tone: Elite, professional, and punchy. 
- Brevity is key. Provide expert-level recommendations without fluff.
- Use precise, sensory language (e.g., "Meticulously crafted," "Refined silhouette").
- Emojis: Strictly 0-1 per response. Only use if it adds to the luxury feel.

RESPONSE STRUCTURE:
1. Opening: A warm, sophisticated greeting or acknowledgment.
2. Recommendations: Recommend 2-3 "Handpicked Selections". You MUST include the clickable link for EACH product using this exact markdown: [View Product Selection](Link)
   Example:
   **Product Name**
   Evocative description...
   [View Product Selection](Link)

3. Smart Suggestions: At the VERY END of your message, you MUST provide 3 short follow-up questions the user might ask, prefixed with "SUGGESTION: ". 

4. Cart Actions: If a user loves an item, offer a direct purchase link: [Curate to My Cart](CART:VariantID)

Rules:
- If a user expresses intent to buy, include the [Curate to My Cart](CART:VariantID) button.
- NEVER omit the [View Product Selection](Link) for a recommendation.
- ALWAYS use the exact URLs and VARIANT_IDs provided in the data.
- Ensure the response is luxurious and helpful.

REAL-TIME DATA:
COLLECTIONS: ${collectionsContext}
PRODUCTS: ${catalogContext}
CURRENT VIEW: ${productContext || 'Main Store'}
`;

    // Format for raw Gemini API
    const contents = [
      { role: "user", parts: [{ text: "Context: " + luxurySystemPrompt }] },
      { role: "model", parts: [{ text: "Understood. I am the 3Boxes AI Concierge. I will assist you with our curated luxury collection with an elite, professional tone." }] },
      ...messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }))
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      }
    );

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`${data.error.status}: ${data.error.message}`);
    }

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return reply || "I am reflecting on your request. How else may I assist you today?";

  } catch (error) {
    console.error('--- Gemini Chat Error Detail ---');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    console.error('--------------------------------');
    return `I apologize, but I am experiencing a brief pause in my service (${error.message}). How else may I assist you with our curated collections?`;
  }
}

/**
 * Vision Analysis using Gemini 1.5 Flash WITH Shopify context
 */
export async function analyzeProductChat(imageBase64, userQuestion = null) {
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  
  try {
    const { catalogContext } = await getShopContext();
    
    const visionSystemPrompt = `
You are the "3Boxes Visual Concierge". Analyze the image and recommend similar items from our luxury collection.

RESPONSE STRUCTURE:
1. Analysis: A brief, elite description of the item. Use **Markdown bullet points** (* ) for features.
2. Handpicked Similar Items: Select 2-3 items from 'OUR CATALOG' below.
3. For EACH recommendation, use this exact format:
   **Product Name**
   Refined description.
   [View Similar Item](Exact Link from catalog)

Rules:
- ALWAYS use proper Markdown lists (e.g., * Feature) for descriptions.
- NEVER leave the parenthesis empty: [View Similar Item](URL)
- Use an elite, professional tone.
- Keep the response structured and easy to read.

OUR CATALOG:
${catalogContext}
`;

    const contents = [{
      role: "user",
      parts: [
        { text: visionSystemPrompt + (userQuestion ? "\nUser Question: " + userQuestion : "\nFind similar items in our store.") },
        { inline_data: { mime_type: "image/jpeg", data: base64Data } }
      ]
    }];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      }
    );

    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "I could not find similar items in our current collection.";
  } catch (error) {
    console.error('Gemini Vision Error:', error);
    return "I am unable to analyze this image at the moment.";
  }
}

export async function searchProducts(query, filters = {}) {
  const message = `Search for: ${query}. Filters: ${JSON.stringify(filters)}`;
  return await chatECommerce([{ role: 'user', content: message }]);
}

export async function getOutfitRecommendation(occasion, budget = null, style = null) {
  const message = `Suggest an outfit for ${occasion}. Budget: ${budget || 'flexible'}. Style: ${style || 'luxury'}.`;
  return await chatECommerce([{ role: 'user', content: message }]);
}
