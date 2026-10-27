/**
 * 检查某个预制体的「源文件」与「编辑器导入产物」是否一致
 *
 * 用法：node tools/check-prefab-imported.mjs gui/battle/get_hero
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rel = process.argv[2] ?? 'gui/battle/get_hero';
const src = join(ROOT, 'assets', 'bundle', `${rel}.prefab`);
const metaPath = `${src}.meta`;

if (!existsSync(src)) {
    console.log('源预制体不存在:', src);
    process.exit(1);
}

const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
const libPath = join(ROOT, 'library', meta.uuid.slice(0, 2), `${meta.uuid}.json`);
const srcText = readFileSync(src, 'utf8');

console.log('源预制体 :', rel, '修改于', statSync(src).mtime.toLocaleString());
console.log('资源 UUID:', meta.uuid);
console.log('导入产物 :', existsSync(libPath) ? libPath : '缺失（编辑器尚未导入）');

if (!existsSync(libPath)) process.exit(0);

const libText = readFileSync(libPath, 'utf8');
const libTime = statSync(libPath).mtime.toLocaleString();

const names = ['paper', 'backdrop', 'portrait', 'card_name', 'shadow', 'flash'];
for (const name of names) {
    const inSrc = srcText.includes(`"_name": "${name}"`) || srcText.includes(`"_name":"${name}"`);
    const inLib = libText.includes(`"_name": "${name}"`) || libText.includes(`"_name":"${name}"`);
    console.log(`  ${name.padEnd(10)} 源:${inSrc ? '有' : '无'}  导入:${inLib ? '有' : '无'}`);
}

const portraitInLib = libText.includes('portrait_default');
console.log('  画像引用   导入:', portraitInLib ? '有' : '无');
console.log('导入时间  :', libTime);
