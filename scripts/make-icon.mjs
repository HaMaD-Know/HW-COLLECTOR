// Renders the original app mark (not the Mattel logo) into the source images
// that `npx capacitor-assets generate` expects in ./assets.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'assets');
mkdirSync(out, { recursive: true });

const flame = `<linearGradient id="f" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#ffcc1f"/><stop offset=".55" stop-color="#ff7a1a"/><stop offset="1" stop-color="#ff3d2e"/>
</linearGradient>`;

// Foreground mark centred in the safe zone of a 1024 canvas.
const mark = `<g transform="translate(212 222) scale(9.4)">
  <path d="M2 40 L22 40 L42 10 L22 10 Z" fill="url(#f)"/>
  <path d="M12 52 L56 52 L63 44 L17 44 Z" fill="#1f7bff"/>
</g>`;

const background = `<radialGradient id="bg" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="#13234a"/><stop offset="1" stop-color="#060a14"/></radialGradient>`;

const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs>${flame}${background}</defs>
<rect width="1024" height="1024" fill="url(#bg)"/>${mark}</svg>`;
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs>${flame}</defs>${mark}</svg>`;
const bgOnly = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs>${background}</defs><rect width="1024" height="1024" fill="url(#bg)"/></svg>`;
const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732"><defs>${flame}</defs>
<rect width="2732" height="2732" fill="#060a14"/><g transform="translate(854 854)">${mark}</g>
<text x="1366" y="1980" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-style="italic" font-size="120" fill="#ffffff" letter-spacing="6">HW COLLECTOR</text></svg>`;

const write = (svg, name) => sharp(Buffer.from(svg)).png().toFile(resolve(out, name));
await Promise.all([
  write(icon, 'icon-only.png'),
  write(foreground, 'icon-foreground.png'),
  write(bgOnly, 'icon-background.png'),
  write(splash, 'splash.png'),
  write(splash, 'splash-dark.png'),
]);
console.info('[make-icon] assets/*.png written');
