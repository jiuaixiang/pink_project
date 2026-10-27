/**
 * 校验预制体引用的脚本组件 UUID 与 .ts.meta 一致
 * 用法：node tools/check-uuid.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function compress(uuid) {
    const hex = uuid.replace(/-/g, '');
    let out = hex.slice(0, 5);
    for (let i = 5; i < 32; i += 3) {
        const value = parseInt(hex.slice(i, i + 3), 16);
        out += KEYS[value >> 6] + KEYS[value & 0x3f];
    }
    return out;
}

const PAIRS = [
    ['assets/script/game/main/MainViewComp.ts', 'assets/bundle/gui/main/main.prefab'],
    ['assets/script/game/main/LevelSelectViewComp.ts', 'assets/bundle/gui/main/level_select.prefab'],
    ['assets/script/game/main/CodexViewComp.ts', 'assets/bundle/gui/main/codex.prefab'],
    ['assets/script/game/main/SettingsViewComp.ts', 'assets/bundle/gui/main/settings.prefab'],
    ['assets/script/game/battle/view/BattleViewComp.ts', 'assets/bundle/gui/battle/battle.prefab'],
    ['assets/script/game/battle/view/PauseViewComp.ts', 'assets/bundle/gui/battle/pause.prefab'],
    ['assets/script/game/battle/view/ResultViewComp.ts', 'assets/bundle/gui/battle/result.prefab'],
];

let failed = 0;
for (const [script, prefab] of PAIRS) {
    const meta = JSON.parse(readFileSync(join(ROOT, `${script}.meta`), 'utf8'));
    const type = compress(meta.uuid);
    const content = readFileSync(join(ROOT, prefab), 'utf8');
    const ok = content.includes(`"__type__": "${type}"`);
    if (!ok) failed++;
    console.log(`${ok ? 'OK  ' : 'MISS'} ${script} -> ${type}`);
}
console.log(failed === 0 ? '脚本 UUID 引用全部一致' : `存在 ${failed} 处不一致`);
process.exit(failed === 0 ? 0 : 1);
