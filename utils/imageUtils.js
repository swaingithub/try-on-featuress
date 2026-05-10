import fs from 'fs';
import path from 'path';

/**
 * Convert a local file to a base64 data URL.
 */
export function fileToBase64DataUrl(filePath, mimeType) {
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Save a base64 image string to disk.
 */
export function saveBase64Image(base64Data, outputDir, filename) {
  const rawBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(rawBase64, 'base64');
  const filepath = path.join(outputDir, filename);
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(filepath, buffer);
  return filepath;
}

/**
 * Helper to get MIME type from filename.
 */
export function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    default: return 'image/jpeg';
  }
}
