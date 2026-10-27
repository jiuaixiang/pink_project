import type { BattleModel } from './BattleModel';
import { Combat } from './Combat';

/** 敌军抵达该横坐标即触发拒马 */
const TRIGGER_X = 0.18;

/**
 * 拒马系统
 *
 * 与原版推车一致：每行一次保命机会，敌军逼近城墙时触发，清空整行并消耗掉该拒马；
 * 已消耗的行再次被突破则判负（由 BattleJudge 处理）
 */
export class LawnmowerSystem {
    static update(model: BattleModel): void {
        for (const mower of model.mowers) {
            if (mower.used) continue;

            let triggered = false;
            for (const enemy of model.enemies) {
                if (!enemy.alive || enemy.row !== mower.row) continue;
                if (enemy.x <= TRIGGER_X) {
                    triggered = true;
                    break;
                }
            }
            if (!triggered) continue;

            mower.used = true;
            mower.running = true;
            model.mowerUsed = true;
            // 滚木触发后城门短暂无敌
            model.gateInvuln = Math.max(model.gateInvuln, model.gameplay.mowerInvuln);

            for (const enemy of model.enemies) {
                if (!enemy.alive || enemy.row !== mower.row) continue;
                Combat.damageEnemy(model, enemy, 99999, '#D9A441');
            }
            model.addEffect({ kind: 'mower', row: mower.row, x: mower.x });
        }
    }
}
