import type { CarRepository } from '../repositories/car-repository';
import type { CarInput } from '../types/models';
import type { ImageStore } from './image-storage/image-store';

/**
 * Optional demo records so a new user can see how the app looks. Every record
 * is flagged isSample, shows a "Demo" badge, uses a drawn illustration rather
 * than a photo, and can be removed in one tap from Settings.
 */
const DEMO_CARS: Array<{ name: string; color: string; hex: string; series: string; year: number }> = [
  { name: 'Ford GT-40', color: 'Red', hex: '#e5322d', series: 'HW Exotics', year: 2024 },
  { name: 'Nissan Skyline GT-R', color: 'Blue', hex: '#2f6bff', series: 'HW J-Imports', year: 2023 },
  { name: 'Porsche 911', color: 'Yellow', hex: '#ffcc1f', series: 'HW Exotics', year: 2022 },
  { name: 'Dodge Charger', color: 'Black', hex: '#2a2c33', series: 'HW Muscle Mania', year: 2021 },
  { name: "'67 Camaro", color: 'Purple', hex: '#8a4dff', series: 'HW Muscle Mania', year: 2020 },
  { name: 'McLaren 720S', color: 'Orange', hex: '#ff7a1a', series: 'HW Exotics', year: 2022 },
];

export function demoCarSvg(hex: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
<defs>
<radialGradient id="bg" cx="50%" cy="35%" r="80%"><stop offset="0" stop-color="#4a3424"/><stop offset="1" stop-color="#1c130d"/></radialGradient>
<linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hex}" stop-opacity="1"/><stop offset="1" stop-color="${hex}" stop-opacity=".72"/></linearGradient>
<linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fb8d8"/><stop offset="1" stop-color="#2b3a52"/></linearGradient>
</defs>
<rect width="400" height="300" fill="url(#bg)"/>
<ellipse cx="200" cy="222" rx="160" ry="16" fill="#000" opacity=".45"/>
<path d="M48 196 C52 170 78 160 110 156 L150 128 C166 117 186 112 214 112 L252 113 C276 114 294 124 312 140 L338 152 C356 158 360 172 358 196 Z" fill="url(#body)"/>
<path d="M156 130 L182 116 C196 113 214 113 236 115 L262 117 C278 120 290 128 300 140 Z" fill="url(#glass)"/>
<rect x="210" y="114" width="6" height="28" fill="${hex}" opacity=".9"/>
<path d="M60 182 L350 182" stroke="#fff" stroke-opacity=".25" stroke-width="3"/>
<path d="M70 168 L130 160" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>
<circle cx="112" cy="198" r="26" fill="#121318"/><circle cx="112" cy="198" r="13" fill="#9aa3ae"/><circle cx="112" cy="198" r="5" fill="#2a2c33"/>
<circle cx="300" cy="198" r="26" fill="#121318"/><circle cx="300" cy="198" r="13" fill="#9aa3ae"/><circle cx="300" cy="198" r="5" fill="#2a2c33"/>
<text x="200" y="272" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="700" fill="#fff" opacity=".55">DEMO ILLUSTRATION</text>
</svg>`;
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export async function loadDemoCars(cars: CarRepository, images: ImageStore): Promise<number> {
  let added = 0;
  for (const [index, demo] of DEMO_CARS.entries()) {
    const imagePath = await images.save(toBase64(demoCarSvg(demo.hex)), 'image/svg+xml');
    const input: Partial<CarInput> = {
      name: demo.name,
      imagePath,
      color: demo.color,
      series: demo.series,
      releaseYear: demo.year,
      notes: 'Demo record. Remove all demo cars in Settings → Demo data.',
      nameSource: 'manual',
      isSample: true,
    };
    // Stable ids make loading twice a no-op instead of creating duplicates.
    const id = `demo-car-000${index + 1}`;
    const existing = await cars.get(id);
    if (existing) {
      await images.releaseIfUnreferenced(imagePath);
      continue;
    }
    await cars.create(input, id);
    added++;
  }
  return added;
}
