import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(rootDir, 'dist');

// Ensure directories exist
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

// Deep organic forest green matching the official Sappy Stationary brand
const BRAND_GREEN = '#244834';
const BRAND_CREAM = '#fbf9f4';

// Pure circular emblem vector (Icon / Favicon / PWA)
const emblemSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <filter id="subtleShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#1b3626" flood-opacity="0.25" />
    </filter>
  </defs>

  <!-- Clean background for app icons / favicon -->
  <rect width="512" height="512" rx="108" fill="${BRAND_CREAM}" />

  <g stroke="${BRAND_GREEN}" fill="none" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
    <!-- Outer Emblem Circle -->
    <circle cx="256" cy="256" r="192" />

    <!-- Downward Pen Nib / V Geometry meeting at bottom -->
    <path d="M 188 92 L 256 448 L 324 92" />

    <!-- Floating Top Center Ink Droplet Dot -->
    <circle cx="256" cy="164" r="17" fill="${BRAND_GREEN}" stroke="none" />

    <!-- The Fluid 'S' Ribbon crossing horizontally through center -->
    <path d="M 160 162 C 160 216, 204 246, 256 246 L 316 246 C 362 246, 384 278, 350 342" />

    <!-- 'P' Loop connecting from center line back into the right leg of V -->
    <path d="M 316 246 C 316 294, 286 318, 272 344" />
  </g>
</svg>`;

// Transparent Emblem Vector (For inline Navbars, Headers, Receipts)
const emblemTransparentSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g stroke="${BRAND_GREEN}" fill="none" stroke-width="28" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="256" cy="256" r="194" />
    <path d="M 188 90 L 256 450 L 324 90" />
    <circle cx="256" cy="164" r="18" fill="${BRAND_GREEN}" stroke="none" />
    <path d="M 158 162 C 158 216, 204 246, 256 246 L 316 246 C 362 246, 384 278, 350 344" />
    <path d="M 316 246 C 316 294, 286 318, 272 344" />
  </g>
</svg>`;

// Full Wordmark Logo with SAPPY and stationery & printing.
const fullLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 700" width="600" height="700">
  <rect width="600" height="700" fill="${BRAND_CREAM}" />

  <!-- Center Emblem -->
  <g transform="translate(100, 40) scale(0.78)" stroke="${BRAND_GREEN}" fill="none" stroke-width="28" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="256" cy="256" r="194" />
    <path d="M 188 90 L 256 450 L 324 90" />
    <circle cx="256" cy="164" r="18" fill="${BRAND_GREEN}" stroke="none" />
    <path d="M 158 162 C 158 216, 204 246, 256 246 L 316 246 C 362 246, 384 278, 350 344" />
    <path d="M 316 246 C 316 294, 286 318, 272 344" />
  </g>

  <!-- SAPPY Wordmark -->
  <text x="300" y="530" 
        font-family="'Plus Jakarta Sans', 'Segoe UI', system-ui, -apple-system, sans-serif" 
        font-size="76" 
        font-weight="800" 
        letter-spacing="14" 
        fill="${BRAND_GREEN}" 
        text-anchor="middle">SAPPY</text>

  <!-- stationery & printing. Tagline -->
  <text x="300" y="605" 
        font-family="'Playfair Display', Georgia, 'Times New Roman', serif" 
        font-size="34" 
        font-weight="500" 
        font-style="normal" 
        letter-spacing="2" 
        fill="${BRAND_GREEN}" 
        text-anchor="middle">stationery &amp; printing.</text>
</svg>`;

async function generateAssets() {
  console.log('Generating brand assets and favicons...');

  // 1. Save SVG files
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), emblemSvg, 'utf-8');
  fs.writeFileSync(path.join(publicDir, 'logo.svg'), fullLogoSvg, 'utf-8');
  fs.writeFileSync(path.join(publicDir, 'emblem-transparent.svg'), emblemTransparentSvg, 'utf-8');

  // Copy to dist if dist exists
  if (fs.existsSync(distDir)) {
    fs.writeFileSync(path.join(distDir, 'icon.svg'), emblemSvg, 'utf-8');
    fs.writeFileSync(path.join(distDir, 'logo.svg'), fullLogoSvg, 'utf-8');
    fs.writeFileSync(path.join(distDir, 'emblem-transparent.svg'), emblemTransparentSvg, 'utf-8');
  }

  const emblemBuffer = Buffer.from(emblemSvg);

  // 2. Generate PNG Favicon & Apple Touch Icon
  await sharp(emblemBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  // 3. Generate PWA 192x192
  await sharp(emblemBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));

  // 4. Generate PWA 512x512
  await sharp(emblemBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));

  // 5. Generate Maskable Icon (with extra 15% inner padding for Android adaptive icon safe zone)
  await sharp(emblemBuffer)
    .resize(410, 410)
    .extend({
      top: 51,
      bottom: 51,
      left: 51,
      right: 51,
      background: BRAND_CREAM,
    })
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));

  // 6. Generate Favicon (64x64 PNG saved as favicon.ico and favicon.png)
  const fav32 = await sharp(emblemBuffer).resize(64, 64).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), fav32);
  fs.writeFileSync(path.join(publicDir, 'favicon.png'), fav32);

  // 7. Generate Full Brand Banner PNG
  await sharp(Buffer.from(fullLogoSvg))
    .resize(600, 700)
    .png()
    .toFile(path.join(publicDir, 'sappy-brand-logo.png'));

  // Sync to dist
  const filesToSync = [
    'apple-touch-icon.png',
    'pwa-192x192.png',
    'pwa-512x512.png',
    'pwa-maskable-512x512.png',
    'favicon.ico',
    'favicon.png',
    'sappy-brand-logo.png',
  ];

  if (fs.existsSync(distDir)) {
    for (const f of filesToSync) {
      const src = path.join(publicDir, f);
      const dst = path.join(distDir, f);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
      }
    }
  }

  console.log('✓ All Sappy Stationery & Printing logo, favicon, and PWA icon assets generated successfully!');
}

generateAssets().catch((err) => {
  console.error('Asset generation error:', err);
  process.exit(1);
});
