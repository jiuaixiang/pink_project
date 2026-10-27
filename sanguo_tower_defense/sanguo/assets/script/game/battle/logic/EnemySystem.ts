import type { IEnemyConfig } from '../../common/table/ITable';
import { TableEnemies } from '../../common/table/TableEnemies';
import type { IEnemyInst, IUnitInst } from './Actor';
import type { BattleModel } from './BattleModel';
import { Combat } from './Combat';

/**
 * 敌军系统
 *
 * 行为：
 * 1、向左侧推进，遇到阻挡单位转为啃咬
 * 2、护甲单位先掉护甲再掉血（Combat 处理）
 * 3、飞骑可跃过第一个阻挡，掘子军可绕过第一个阻挡
 * 4、减速效果同时影响移动与啃咬频率（通过时间缩放实现）
 */
export class EnemySystem {
    /** 出兵 */
    static spawn(model: BattleModel, enemyId: string, row: number): IEnemyInst | null {
        const cfg: IEnemyConfig | null = TableEnemies.get(enemyId);
        if (cfg == null) {
            console.warn(`[三国塔防] 未找到敌军配置：${enemyId}`);
            return null;
        }

        const enemy: IEnemyInst = {
            uid: model.nextUid(),
            cfgId: cfg.id,
            cfg,
            row,
            x: model.gameplay.spawnX,
            hp: cfg.hp,
            maxHp: cfg.hp,
            armor: cfg.armor,
            maxArmor: cfg.armor,
            eatingUid: -1,
            slowRemain: 0,
            slowFactor: 1,
            jumped: false,
            hitFlash: 0,
            alive: true,
        };
        model.enemies.push(enemy);
        model.spawned += 1;
        return enemy;
    }

    /** 每帧推进 */
    static update(model: BattleModel, dt: number): void {
        for (const enemy of model.enemies) {
            if (!enemy.alive) continue;

            if (enemy.hitFlash > 0) enemy.hitFlash -= dt;
            if (enemy.slowRemain > 0) {
                enemy.slowRemain -= dt;
                if (enemy.slowRemain <= 0) enemy.slowFactor = 1;
            }

            const timeScale = enemy.slowRemain > 0 ? enemy.slowFactor : 1;
            const block = this.findBlocker(model, enemy);

            if (block != null) {
                // 跳跃 / 掘地：仅越过第一个阻挡
                if ((enemy.cfg.jump === true || enemy.cfg.bypassWall === true) && !enemy.jumped) {
                    enemy.jumped = true;
                    enemy.x = block.col - 0.55;
                    enemy.eatingUid = -1;
                    continue;
                }

                enemy.eatingUid = block.uid;
                Combat.damageUnit(model, block, enemy.cfg.eat * timeScale * dt);
                continue;
            }

            enemy.eatingUid = -1;
            enemy.x -= enemy.cfg.speed * timeScale * dt;
        }
    }

    /** 查找当前啃咬目标：敌军前端进入某个单位格子即算接触 */
    private static findBlocker(model: BattleModel, enemy: IEnemyInst): IUnitInst | null {
        const front = enemy.x - 0.32;
        const col = model.grid.colAt(front);
        if (col < 0) return null;
        return model.unitAt(enemy.row, col);
    }
}
