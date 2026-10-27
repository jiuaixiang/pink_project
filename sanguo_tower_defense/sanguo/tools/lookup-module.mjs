/** 在预览构建的 import-map 中查找某个源文件对应的 chunk 路径 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] ?? 'L.ts';
const mapPath = join(ROOT, 'temp', 'programming', 'packer-driver', 'targets', 'preview', 'import-map.json');
const map = JSON.parse(readFileSync(mapPath, 'utf8'));

const imports = map.imports ?? map;
for (const key of Object.keys(imports)) {
    if (!key.includes(target)) continue;
    console.log(`${key}\n  -> ${imports[key]}`);
}
