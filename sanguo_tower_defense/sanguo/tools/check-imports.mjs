/**
 * 依赖图自检：检测相对导入缺失与循环依赖
 * （循环依赖会让 Cocos 预览构建的模块注入失败，表现为 import 到的函数为 undefined）
 * 用法：node tools/check-imports.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'assets', 'script');

const files = [];
(function walk(dir) {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (entry.endsWith('.ts')) files.push(path);
    }
})(SCRIPT);

const graph = new Map();
const missing = [];

for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const deps = [];
    for (const match of content.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gm)) {
        const spec = match[1];
        if (!spec.startsWith('.')) continue;
        const target = resolve(dirname(file), `${spec}.ts`);
        if (!existsSync(target)) {
            missing.push(`${relative(ROOT, file)} -> ${spec}`);
            continue;
        }
        deps.push(target);
    }
    graph.set(file, deps);
}

const cycles = [];
const state = new Map();
const stack = [];

function dfs(node) {
    const status = state.get(node) ?? 0;
    if (status === 2) return;
    if (status === 1) {
        const index = stack.indexOf(node);
        cycles.push(stack.slice(index).concat(node).map((p) => relative(ROOT, p)));
        return;
    }
    state.set(node, 1);
    stack.push(node);
    for (const next of graph.get(node) ?? []) dfs(next);
    stack.pop();
    state.set(node, 2);
}

for (const file of files) dfs(file);

if (missing.length > 0) {
    console.error('缺失的相对导入：');
    for (const item of missing) console.error(` - ${item}`);
}
if (cycles.length > 0) {
    console.error('检测到循环依赖：');
    for (const cycle of cycles) console.error(` - ${cycle.join(' -> ')}`);
}
if (missing.length === 0 && cycles.length === 0) {
    console.log(`依赖自检通过：${files.length} 个脚本，无缺失导入、无循环依赖`);
    process.exit(0);
}
process.exit(1);
