import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 元画像のパス
const sourceIcon = path.join(rootDir, 'public', 'turtle_icon.png');

async function generateIcons() {
  // PWA用アイコン (192x192)
  await sharp(sourceIcon)
    .resize(192, 192)
    .png()
    .toFile(path.join(rootDir, 'public', 'pwa-192x192.png'));
  console.log('Generated pwa-192x192.png');

  // PWA用アイコン (512x512)
  await sharp(sourceIcon)
    .resize(512, 512)
    .png()
    .toFile(path.join(rootDir, 'public', 'pwa-512x512.png'));
  console.log('Generated pwa-512x512.png');

  // Apple Touch Icon (180x180)
  await sharp(sourceIcon)
    .resize(180, 180)
    .png()
    .toFile(path.join(rootDir, 'public', 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // Favicon用 (32x32)
  await sharp(sourceIcon)
    .resize(32, 32)
    .png()
    .toFile(path.join(rootDir, 'public', 'favicon-32x32.png'));
  console.log('Generated favicon-32x32.png');

  // Favicon用 (16x16)
  await sharp(sourceIcon)
    .resize(16, 16)
    .png()
    .toFile(path.join(rootDir, 'public', 'favicon-16x16.png'));
  console.log('Generated favicon-16x16.png');
}

generateIcons().catch(console.error);
