/** 查看编译日志尾部错误：node tools/tail-log.mjs [行数] */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(ROOT, 'temp', 'programming', 'packer-driver', 'logs', 'debug.log');
const tail = Number(process.argv[2] ?? 4000);

const lines = readFileSync(path, 'utf8').split(/\r?\n/);
const slice = lines.slice(Math.max(0, lines.length - tail));

const seen = new Set();
for (let i = 0; i < slice.length; i++) {
    const line = slice[i];
    if (!/error/i.test(line)) continue;
    if (/resolve_error_module_not_found/.test(line)) continue;
    const key = line.slice(0, 160);
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(line);
    if (i + 1 < slice.length) console.log(`   ${slice[i + 1].slice(0, 200)}`);
}
console.log(`--- 日志总行数 ${lines.length}，检查末 ${Math.min(tail, lines.length)} 行 ---`);
