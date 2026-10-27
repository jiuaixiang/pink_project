/** 在预览构建产物中搜索关键字：node tools/find-in-build.mjs MainViewComp */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const keyword = process.argv[2] ?? 'MainViewComp';
const dirs = [
    join(ROOT, 'temp', 'programming', 'packer-driver', 'targets', 'preview'),
    join(ROOT, 'temp', 'programming', 'packer-driver', 'targets', 'editor'),
];

let hit = 0;
function walk(dir) {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
            walk(path);
            continue;
        }
        let content;
        try {
            content = readFileSync(path, 'utf8');
        }
        catch {
            continue;
        }
        const index = content.indexOf(keyword);
        if (index < 0) continue;
        hit += 1;
        console.log(`\n### ${relative(ROOT, path)}`);
        console.log(content.slice(Math.max(0, index - 260), index + 260).replace(/\s+/g, ' '));
    }
}

for (const dir of dirs) {
    try {
        walk(dir);
    }
    catch {
        // 目录不存在时忽略
    }
}
console.log(`\n命中 ${hit} 处`);
