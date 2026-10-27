/**
 * 静态数据自检：
 * 1、配置表 JSON 可解析且引用完整
 * 2、界面配置中的预制体路径真实存在
 * 3、代码中使用的多语言键在 zh/en 中都存在
 * 用法：node tools/check-data.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = join(ROOT, 'assets', 'bundle');
const SCRIPT = join(ROOT, 'assets', 'script');

const errors = [];
const warn = (message) => errors.push(message);

function readJson(path) {
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    }
    catch (e) {
        warn(`JSON 解析失败：${relative(ROOT, path)} -> ${e.message}`);
        return null;
    }
}

//#region 配置表
const units = readJson(join(BUNDLE, 'config', 'game', 'units.json')) ?? [];
const enemies = readJson(join(BUNDLE, 'config', 'game', 'enemies.json')) ?? [];
const projectiles = readJson(join(BUNDLE, 'config', 'game', 'projectiles.json')) ?? [];
const waves = readJson(join(BUNDLE, 'config', 'game', 'waves.json')) ?? [];
const levels = readJson(join(BUNDLE, 'config', 'game', 'levels.json')) ?? [];

const unitIds = new Set(units.map((u) => u.id));
const enemyIds = new Set(enemies.map((e) => e.id));
const projectileIds = new Set(projectiles.map((p) => p.id));
const waveMap = new Map(waves.map((w) => [w.id, w]));

for (const unit of units) {
    if (unit.projectile != null && !projectileIds.has(unit.projectile)) warn(`单位 ${unit.id} 引用了不存在的弹道 ${unit.projectile}`);
}
for (const wave of waves) {
    for (const group of wave.groups ?? []) {
        if (!enemyIds.has(group.enemy)) warn(`波次 ${wave.id} 引用了不存在的敌军 ${group.enemy}`);
    }
}
for (const level of levels) {
    for (const id of level.units ?? []) {
        if (!unitIds.has(id)) warn(`关卡 ${level.id} 引用了不存在的单位 ${id}`);
    }
    for (const id of level.waves ?? []) {
        if (!waveMap.has(id)) warn(`关卡 ${level.id} 引用了不存在的波次 ${id}`);
    }
}
console.log(`配置表：${units.length} 单位 / ${enemies.length} 敌军 / ${waves.length} 波次 / ${levels.length} 关卡`);
//#endregion

//#region 预制体路径
function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path, out);
        else if (entry.endsWith('.prefab')) out.push(path);
    }
    return out;
}
const prefabPaths = new Set(walk(join(BUNDLE, 'gui')).map((p) => `gui/${relative(join(BUNDLE, 'gui'), p).replace(/\\/g, '/').replace('.prefab', '')}`));

const uiConfigRaw = readFileSync(join(SCRIPT, 'game', 'common', 'config', 'GameUIConfig.ts'), 'utf8');
// 去掉注释行，避免把文档示例里的路径当成真实配置
const uiConfig = uiConfigRaw
    .split(/\r?\n/)
    .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    })
    .join('\n');

for (const match of uiConfig.matchAll(/prefab:\s*'([^']+)'/g)) {
    const path = match[1];
    if (!prefabPaths.has(path)) warn(`界面配置引用了不存在的预制体：${path}`);
}
const referenced = [
    'gui/battle/battle',
    'gui/main/level_card',
    'gui/main/chip',
    'gui/main/codex_item',
    'gui/main/detail_row',
    'gui/battle/card',
    'gui/battle/actor_unit',
    'gui/battle/actor_enemy',
    'gui/battle/actor_bullet',
    'gui/battle/actor_food',
    'gui/battle/float_text',
    'gui/battle/fx_burst',
];
for (const path of referenced) {
    if (!prefabPaths.has(path)) warn(`代码引用了不存在的预制体：${path}`);
}
console.log(`预制体：共 ${prefabPaths.size} 个`);
//#endregion

//#region 多语言
const zh = readJson(join(BUNDLE, 'language', 'json', 'zh.json')) ?? {};
const en = readJson(join(BUNDLE, 'language', 'json', 'en.json')) ?? {};

const tsFiles = [];
(function collect(dir) {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) collect(path);
        else if (entry.endsWith('.ts')) tsFiles.push(path);
    }
})(SCRIPT);

const usedKeys = new Set();
for (const file of tsFiles) {
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(/ViewKit\.lang\(\s*'([a-zA-Z0-9_]+)'/g)) usedKeys.add(match[1]);
    for (const match of content.matchAll(/ViewKit\.lang\(`([a-zA-Z0-9_]+)\$\{/g)) {
        // 动态键（kind_XXX / ekind_XXX）单独校验前缀
        const prefix = match[1];
        if (prefix === 'kind_') {
            for (const value of ['producer', 'shooter', 'wall', 'bomber', 'rowclear', 'support', 'mine', 'lobber']) usedKeys.add(`kind_${value}`);
        }
        if (prefix === 'ekind_') {
            for (const value of ['normal', 'fast', 'armor', 'jumper', 'digger', 'boss']) usedKeys.add(`ekind_${value}`);
        }
    }
}
// 配置表里引用的名称/描述键
for (const item of [...units, ...enemies]) {
    if (item.nameKey) usedKeys.add(item.nameKey);
    if (item.descKey) usedKeys.add(item.descKey);
}
for (const level of levels) {
    if (level.nameKey) usedKeys.add(level.nameKey);
}

for (const key of usedKeys) {
    if (zh[key] == null) warn(`中文语言包缺少键：${key}`);
    if (en[key] == null) warn(`英文语言包缺少键：${key}`);
}
console.log(`多语言：代码与配置引用 ${usedKeys.size} 个键`);
//#endregion

if (errors.length === 0) {
    console.log('数据自检通过');
    process.exit(0);
}
console.error(`发现 ${errors.length} 处问题：`);
for (const message of errors) console.error(` - ${message}`);
process.exit(1);
