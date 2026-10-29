/**
 * 一次性体检：检查各视图组件是否存在「使用了 root 但未声明」的清理损伤
 * 运行：node tools/check-root-refs.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', 'assets', 'script', 'game');
const views = [
    'main/LevelSelectViewComp.ts',
    'main/CodexViewComp.ts',
    'main/EquipViewComp.ts',
    'main/DraftViewComp.ts',
    'main/HelpViewComp.ts',
    'main/SettingsViewComp.ts',
    'main/MainViewComp.ts',
    'main/EquipDetailViewComp.ts',
    'battle/view/StratViewComp.ts',
    'battle/view/PauseViewComp.ts',
    'battle/view/ResultViewComp.ts',
    'battle/view/StoryViewComp.ts',
    'battle/view/UnitDetailViewComp.ts',
    'battle/view/BattleViewComp.ts',
];

for (const rel of views) {
    const file = join(ROOT, rel);
    const src = readFileSync(file, 'utf8');
    const declared = /const root = this\.node/.test(src) || /this\.root\b/.test(src);
    const uses = /\broot\b\s*[,.)]/.test(src) || /get\(root/.test(src);
    const status = uses && !declared ? '⚠ 使用 root 但未声明' : 'OK';
    console.log(rel.padEnd(38), status);
}
