// sharp-pwa.js
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'assets', 'images', 'source.png'); // tolto "src" perché __dirname è già "src"
const outputDir = path.join(__dirname, 'assets', 'icons');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// Icone PWA standard
const icons = [72, 96, 128, 144, 152, 192, 384, 512];

// Splash screen comuni
const splash = [
  { width: 640, height: 1136 },   // iPhone SE
  { width: 750, height: 1334 },   // iPhone 8
  { width: 1125, height: 2436 },  // iPhone X/XS
  { width: 1536, height: 2048 },  // iPad
  { width: 2048, height: 2732 }   // iPad Pro
];

async function generateImages() {
  // Icone
  for (const size of icons) {
    await sharp(inputFile)
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(path.join(outputDir, `icon-${size}x${size}.png`));
    console.log(`Icona ${size}x${size} generata`);
  }

  // Splash
  for (const s of splash) {
    await sharp(inputFile)
      .resize(s.width, s.height, { fit: 'cover' })
      .png({ compressionLevel: 9 })
      .toFile(path.join(outputDir, `splash-${s.width}x${s.height}.png`));
    console.log(`Splash ${s.width}x${s.height} generato`);
  }

  console.log('✅ Tutte le immagini generate!');
}

generateImages().catch(console.error);
