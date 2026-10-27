/**
 * 预制体结构自检：校验 JSON 引用完整性、组件归属、fileId 唯一性
 * 用法：node tools/validate-prefab.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'assets', 'bundle', 'gui');

function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path, out);
        else if (entry.endsWith('.prefab')) out.push(path);
    }
    return out;
}

let errorCount = 0;
for (const file of walk(TARGET)) {
    const name = relative(ROOT, file);
    let data;
    try {
        data = JSON.parse(readFileSync(file, 'utf8'));
    }
    catch (e) {
        console.error(`${name}: JSON 解析失败 ${e.message}`);
        errorCount++;
        continue;
    }

    const fail = (message) => {
        console.error(`${name}: ${message}`);
        errorCount++;
    };

    if (!Array.isArray(data)) {
        fail('根节点不是数组');
        continue;
    }
    if (data[0].__type__ !== 'cc.Prefab') fail('首元素不是 cc.Prefab');
    if (data[0].data?.__id__ !== 1) fail('Prefab.data 未指向根节点');

    const ids = [];
    const collect = (obj) => {
        if (obj == null || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
            obj.forEach(collect);
            return;
        }
        if (obj.__id__ != null) ids.push(obj.__id__);
        for (const key of Object.keys(obj)) {
            if (key === '__id__') continue;
            collect(obj[key]);
        }
    };
    collect(data);

    for (const id of ids) {
        if (typeof id !== 'number' || id < 0 || id >= data.length) fail(`非法 __id__: ${id}`);
    }

    const fileIds = new Set();
    const nodes = [];
    data.forEach((item, index) => {
        if (item == null || typeof item !== 'object') return;
        if (item.__type__ === 'cc.Node') nodes.push({ index, item });
        if (item.__type__ === 'cc.CompPrefabInfo' || item.__type__ === 'cc.PrefabInfo') {
            if (fileIds.has(item.fileId)) fail(`重复 fileId: ${item.fileId}`);
            fileIds.add(item.fileId);
        }
        if (item.__prefab != null) {
            const target = data[item.__prefab.__id__];
            if (target == null || target.__type__ !== 'cc.CompPrefabInfo') {
                fail(`组件 ${index} 的 __prefab 未指向 CompPrefabInfo`);
            }
        }
        if (item.node != null) {
            const target = data[item.node.__id__];
            if (target == null || target.__type__ !== 'cc.Node') fail(`组件 ${index} 的 node 未指向 Node`);
        }
    });

    for (const { index, item } of nodes) {
        const hasTransform = (item._components ?? []).some((ref) => data[ref.__id__]?.__type__ === 'cc.UITransform');
        if (!hasTransform) fail(`节点 ${item._name}(${index}) 缺少 UITransform`);
        if (item._prefab == null) fail(`节点 ${item._name}(${index}) 缺少 PrefabInfo`);
        for (const child of item._children ?? []) {
            const target = data[child.__id__];
            if (target == null || target.__type__ !== 'cc.Node') fail(`节点 ${item._name} 的子节点引用非法`);
            else if (target._parent?.__id__ !== index) fail(`节点 ${target._name} 的父节点引用不一致`);
        }
    }
}

console.log(errorCount === 0 ? '预制体结构自检通过' : `发现 ${errorCount} 处问题`);
process.exit(errorCount === 0 ? 0 : 1);
