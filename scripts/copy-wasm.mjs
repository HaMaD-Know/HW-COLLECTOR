// Copies the sql.js WebAssembly binary into public/assets so the web build
// (jeep-sqlite, used only when running in a browser) can load it.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'node_modules/sql.js/dist/sql-wasm.wasm');
const targetDir = resolve(root, 'public/assets');

if (!existsSync(source)) {
  console.warn('[copy-wasm] sql.js is not installed yet; skipping.');
  process.exit(0);
}
mkdirSync(targetDir, { recursive: true });
copyFileSync(source, resolve(targetDir, 'sql-wasm.wasm'));
console.info('[copy-wasm] public/assets/sql-wasm.wasm ready');
