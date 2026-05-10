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

  // Priority 1: Environment variables
  if (process.env.ZAI_BASE_URL && process.env.ZAI_API_KEY) {
    zaiConfig = {
      baseUrl: process.env.ZAI_BASE_URL,
      apiKey: process.env.ZAI_API_KEY,
    };
    return zaiConfig;
  }

  // Priority 2: .z-ai-config file
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
    } catch (_) {
      // skip invalid files
    }
  }

  throw new Error(
    'Configuration not found. Set ZAI_BASE_URL + ZAI_API_KEY env vars, or create .z-ai-config file.'
  );
}

// ─── ZAI Instance ─────────────────────────────────────────────────────────────

async function getZAI() {
  if (zaiInstance) return zaiInstance;

  const config = getConfig();

  // Ensure a config file exists somewhere the SDK can find it.
  const cwdConfig = path.join(process.cwd(), '.z-ai-config');
  if (!fs.existsSync(cwdConfig)) {
    try {
      fs.writeFileSync(cwdConfig, JSON.stringify(config, null, 2), 'utf-8');
      console.log('[zaiService] Wrote temp .z-ai-config to cwd');
    } catch (err) {
      console.warn('[zaiService] Could not write temp config:', err.message);
    }
  }

  try {
    zaiInstance = await ZAI.create();
    return zaiInstance;
  } catch (sdkErr) {
    console.warn('[zaiService] ZAI.create() failed:', sdkErr.message);
    console.log('[zaiService] Will use raw fetch() fallback for all API calls');
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

// ─── Utilities ────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 3000) {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRateLimit =
        error.message && (
          error.message.includes('1305') ||
          error.message.includes('访问量过大') ||
          error.message.includes('429') ||
          error.message.includes('rate')
        );

      if (isRateLimit && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`⏳ Traffic overload. Retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// ─── Vision: Analyze Images ───────────────────────────────────────────────────

async function analyzeImageWithVision(messages, maxTokens = 1024) {
  const zai = await getZAI();

  if (zai) {
    try {
      const result = await retryWithBackoff(async () => {
        const response = await zai.chat.completions.create({
          model: 'glm-4.6v-flash',
          messages,
          max_tokens: maxTokens,
          temperature: 0.7,
        });
        return response.choices[0].message.content;
      }, 3, 3000);
      return result;
    } catch (sdkErr) {
      console.warn('[zaiService] SDK vision call failed, trying raw fetch:', sdkErr.message);
    }
  }

  return retryWithBackoff(async () => {
    const result = await rawFetch('/chat/completions', {
      model: 'glm-4.6v-flash',
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    });
    return result.choices?.[0]?.message?.content || '';
  }, 3, 3000);
}

async function analyzeUserPhoto(imageBase64) {
  console.log('📸 Analyzing user photo (glm-4.6v-flash)...');
  try {
    const result = await analyzeImageWithVision([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Describe this person's appearance in detail for a virtual try-on. Include:
1. Body type and build (slim, average, athletic, curvy, etc.)
2. Height estimate based on proportions
3. Skin tone (fair, medium, olive, dark, etc.)
4. Current pose and posture (standing, sitting, facing direction)
5. Hair style and color
6. Any visible accessories or clothing style
Be specific and descriptive. Output ONLY the description.`,
          },
          {
            type: 'image_url',
            image_url: { url: imageBase64 },
          },
        ],
      },
    ]);
    return result;
  } catch (error) {
    return null;
  }
}

async function analyzeProductImage(imageBase64) {
  console.log('👗 Analyzing product image (glm-4.6v-flash)...');
  try {
    const result = await analyzeImageWithVision([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this clothing/fashion product image in detail for virtual try-on:
1. Type of garment (dress, shirt, jacket, pants, etc.)
2. Color and pattern (solid, striped, floral, etc.)
3. Fabric type and texture (silk, cotton, denim, leather, etc.)
4. Fit and cut (slim fit, regular, oversized, A-line, etc.)
5. Length (crop, waist, knee, ankle, floor-length)
6. Notable design details (buttons, zippers, embroidery, pockets, etc.)
7. Style category (casual, formal, streetwear, ethnic, sportswear, etc.)
8. Season suitability (summer, winter, all-season)
Be specific so the try-on image looks accurate. Output ONLY the description.`,
          },
          {
            type: 'image_url',
            image_url: { url: imageBase64 },
          },
        ],
      },
    ]);
    return result;
  } catch (error) {
    return null;
  }
}

async function analyzeBothImages(userImageBase64, productImageBase64) {
  console.log('📸👗 Analyzing BOTH images together (glm-4.6v-flash)...');
  try {
    const result = await analyzeImageWithVision(
      [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are an AI fashion assistant. Analyze BOTH images together for a virtual try-on:

IMAGE 1: The person who will wear the outfit.
IMAGE 2: The clothing product to be tried on.

Provide:
1. Person's body type, build, and skin tone
2. Product type, color, pattern, and fabric
3. How well this product suits the person's body type
4. Suggested styling adjustments (tucking in, rolling sleeves, layering, etc.)
5. A vivid, detailed description of how the person would look wearing this product — describe it as if you're looking at a photograph
`,
            },
            { type: 'image_url', image_url: { url: userImageBase64 } },
            { type: 'image_url', image_url: { url: productImageBase64 } },
          ],
        },
      ],
      1500
    );
    return result;
  } catch (error) {
    return null;
  }
}

// ─── Image Generation ─────────────────────────────────────────────────────────

async function generateTryOnImage(prompt, size = '768x1344') {
  try {
    console.log('🎨 Generating image via Pollinations.ai (FREE)...');
    return await generateImagePollinations(prompt, size);
  } catch (error) {
    console.log('💰 Falling back to BigModel...');
    return await generateImageBigModel(prompt, size);
  }
}

async function generateImagePollinations(prompt, size = '768x1344') {
  const [width, height] = size.split('x').map(Number);
  const maxPromptLen = 600;
  const shortPrompt = prompt.length > maxPromptLen ? prompt.substring(0, maxPromptLen) : prompt;
  const enhancedPrompt = `${shortPrompt}, professional photo, high quality`;
  const encodedPrompt = encodeURIComponent(enhancedPrompt);

  const models = ['flux', 'turbo'];

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const seed = Date.now() + attempt;
        const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=${model}&nologo=true&seed=${seed}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(45000) });

        if (!response.ok) continue;
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength < 5000) continue;
        return Buffer.from(arrayBuffer).toString('base64');
      } catch (error) {
        if (attempt < 2) await sleep(3000);
      }
    }
  }
  throw new Error('Pollinations failed');
}

async function generateImageBigModel(prompt, size = '768x1344') {
  const config = getConfig();
  const url = `${config.baseUrl}/images/generations`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: 'cogView-4-250304', prompt, size }),
  });

  if (!response.ok) throw new Error('BigModel generation failed');
  const result = await response.json();

  if (result.data?.[0]?.b64_json) return result.data[0].b64_json;
  if (result.data?.[0]?.url) {
    const imgResp = await fetch(result.data[0].url);
    return Buffer.from(await imgResp.arrayBuffer()).toString('base64');
  }
  if (result.id) return await pollBigModelResult(result.id);

  throw new Error('BigModel failed');
}

async function pollBigModelResult(taskId, maxAttempts = 30, interval = 5000) {
  const config = getConfig();
  for (let i = 0; i < maxAttempts; i++) {
    const pollUrl = `${config.baseUrl}/async-result?id=${encodeURIComponent(taskId)}`;
    const response = await fetch(pollUrl, { headers: { Authorization: `Bearer ${config.apiKey}` } });
    const result = await response.json();
    if (result.task_status === 'SUCCESS' || result.task_status === 'SUCCEEDED') {
      if (result.data?.[0]?.b64_json) return result.data[0].b64_json;
      const imgUrl = result.url || result.data?.[0]?.url;
      const imgResp = await fetch(imgUrl);
      return Buffer.from(await imgResp.arrayBuffer()).toString('base64');
    }
    if (result.task_status === 'FAILED') throw new Error('Task failed');
    await sleep(interval);
  }
  throw new Error('Timeout');
}

// ─── Exported Functions ───────────────────────────────────────────────────────

export async function virtualTryOn(userImageBase64, productImageBase64, size = '768x1344') {
  let userDescription = null;
  let productDescription = null;
  let combinedDescription = await analyzeBothImages(userImageBase64, productImageBase64);
  let analysisMethod = combinedDescription ? 'combined' : 'none';

  if (!combinedDescription) {
    userDescription = await analyzeUserPhoto(userImageBase64);
    productDescription = await analyzeProductImage(productImageBase64);
    analysisMethod = (userDescription || productDescription) ? 'individual' : 'none';
  }

  let tryOnPrompt;
  if (combinedDescription) {
    tryOnPrompt = `Photorealistic full-body virtual try-on photo: ${combinedDescription}. The person is wearing the described outfit perfectly. Natural lighting, studio quality, fashion photography style, high detail, realistic fabric draping.`;
  } else {
    tryOnPrompt = `Photorealistic full-body fashion photo of a person with the following appearance: ${userDescription || 'average build'}. They are wearing: ${productDescription || 'a stylish outfit'}. Realistic fabric draping, natural lighting, high detail.`;
  }

  const resultBase64 = await generateTryOnImage(tryOnPrompt, size);

  return {
    resultImage: resultBase64,
    userDescription,
    productDescription,
    combinedDescription,
    analysisMethod,
  };
}

export async function virtualTryOnByText(userImageBase64, outfitDescription, size = '768x1344') {
  const userDescription = await analyzeUserPhoto(userImageBase64);
  const tryOnPrompt = `Photorealistic full-body virtual try-on photo of a person with appearance: ${userDescription || 'average build'}. They are wearing: ${outfitDescription}. Natural lighting, studio quality, high detail.`;
  const resultBase64 = await generateTryOnImage(tryOnPrompt, size);
  return { resultImage: resultBase64, userDescription };
}

export async function generateOutfitImage(prompt) {
  const outfitPrompt = `Full-body fashion photo of a model wearing: ${prompt}. Professional fashion photography, studio lighting, high quality.`;
  return await generateTryOnImage(outfitPrompt, '768x1344');
}

export async function analyzeBodyType(imageBase64) {
  const description = await analyzeUserPhoto(imageBase64);
  return description || 'Unable to analyze.';
}
