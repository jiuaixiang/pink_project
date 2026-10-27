/** 临时工具：打印预制体节点树，用于核对视图绑定路径 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = process.argv.slice(2);

for (const file of files) {
    const data = JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
    console.log(`\n=== ${file} ===`);
    const walk = (id, depth) => {
        const node = data[id];
        console.log(`${'  '.repeat(depth)}${node._name}`);
        for (const child of node._children ?? []) walk(child.__id__, depth + 1);
    };
    walk(data[0].data.__id__, 0);
}
