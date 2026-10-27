/** 检查预制体是否已被 Creator 导入到 library */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
    'assets/bundle/gui/main/main.prefab',
    'assets/bundle/gui/main/level_select.prefab',
    'assets/bundle/gui/main/codex.prefab',
    'assets/bundle/gui/main/settings.prefab',
    'assets/bundle/gui/battle/battle.prefab',
    'assets/bundle/gui/battle/pause.prefab',
    'assets/bundle/gui/battle/result.prefab',
    'assets/bundle/gui/battle/actor_unit.prefab',
    'assets/bundle/gui/main/card.prefab',
    'assets/bundle/game/texture/tex_panel.png',
    'assets/script/game/main/MainViewComp.ts',
    'assets/script/game/battle/view/BattleViewComp.ts',
];

for (const asset of targets) {
    const metaPath = join(ROOT, `${asset}.meta`);
    if (!existsSync(metaPath)) {
        console.log(`NO-META  ${asset}`);
        continue;
    }
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    const uuid = meta.uuid;
    const lib = join(ROOT, 'library', uuid.slice(0, 2), `${uuid}.json`);
    const ok = existsSync(lib);
    console.log(`${ok ? 'IMPORTED' : 'MISSING '}  ${asset}  (${uuid})`);
}
