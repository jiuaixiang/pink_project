/** 打印文件中关键字附近的代码：node tools/snippet.mjs <file> <keyword> [前后字符数] */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [file, keyword, range] = process.argv.slice(2);
if (file == null || keyword == null) {
    console.log('用法: node tools/snippet.mjs <file> <keyword> [range]');
    process.exit(1);
}
const span = Number(range ?? 500);
const content = readFileSync(join(ROOT, file), 'utf8');
let index = content.indexOf(keyword);
if (index < 0) {
    console.log(`未找到关键字: ${keyword}`);
    process.exit(1);
}
console.log(content.slice(Math.max(0, index - span), index + span));
