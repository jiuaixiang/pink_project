import type { IEnemyConfig } from '../../common/table/ITable';
import { TableEnemies } from '../../common/table/TableEnemies';
import type { IEnemyInst, IUnitInst } from './Actor';
import type { BattleModel } from './BattleModel';
import { BattleFx } from './BattleFx';
import { Combat } from './Combat';
import { ProjectileSystem } from './ProjectileSystem';

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

        // 斥候空降：从场内中段出现，而非右侧入场
        const sky = cfg.sky === true;
        const spawnRow = sky ? Math.floor(Math.random() * model.grid.rows) : row;
        const spawnX = sky ? 4 + Math.random() * 4 : model.gameplay.spawnX;

        const enemy: IEnemyInst = {
            uid: model.nextUid(),
            cfgId: cfg.id,
            cfg,
            row: spawnRow,
            x: spawnX,
            // 教学关敌军生命系数（参考稿 tutEnemyHp=0.6）
            hp: Math.max(1, Math.round(cfg.hp * (model.level.guide === true ? (model.gameplay.tutEnemyHp ?? 0.6) : 1))),
            maxHp: Math.max(1, Math.round(cfg.hp * (model.level.guide === true ? (model.gameplay.tutEnemyHp ?? 0.6) : 1))),
            armor: cfg.armor,
            maxArmor: cfg.armor,
            eatingUid: -1,
            slowRemain: 0,
            slowFactor: 1,
            jumped: false,
            stunTimer: 0,
            digLayers: 0,
            digTimer: 3,
            shootTimer: 1,
            hesitated: false,
            charged: false,
            hitFlash: 0,
            alive: true,
        };
        model.enemies.push(enemy);
        model.spawned += 1;
        return enemy;
    }

    /** 每帧推进 */
    static update(model: BattleModel, dt: number): void {
        // 清理过期的场域减速
        if (model.slowFields.length > 0) {
            for (let i = model.slowFields.length - 1; i >= 0; i--) {
                if (model.slowFields[i].until <= model.time) model.slowFields.splice(i, 1);
            }
        }

        // 连击窗口
        if (model.comboTimer > 0) {
            model.comboTimer -= dt;
            if (model.comboTimer <= 0) model.comboCount = 0;
        }
        if (model.gateInvuln > 0) model.gateInvuln -= dt;

        for (const enemy of model.enemies) {
            if (!enemy.alive) continue;

            if (enemy.hitFlash > 0) enemy.hitFlash -= dt;
            if (enemy.slowRemain > 0) {
                enemy.slowRemain -= dt;
                if (enemy.slowRemain <= 0) enemy.slowFactor = 1;
            }

            // 眩晕：姜维伏兵 / 义兵怯战
            if (enemy.stunTimer > 0) {
                enemy.stunTimer -= dt;
                continue;
            }

            // 场域减速：诸葛亮八卦阵
            for (const field of model.slowFields) {
                if (enemy.row !== field.row) continue;
                if (Math.abs(enemy.x - field.x) > field.radius) continue;
                enemy.slowFactor = Math.min(enemy.slowFactor, field.slowFactor);
                enemy.slowRemain = Math.max(enemy.slowRemain, 0.2);
            }

            const timeScale = enemy.slowRemain > 0 ? enemy.slowFactor : 1;
            const block = this.findBlocker(model, enemy);

            if (block != null) {
                // 跳跃 / 掘地：跃过首个阻挡，落地践踏
                if ((enemy.cfg.jump === true || enemy.cfg.bypassWall === true) && !enemy.jumped) {
                    enemy.jumped = true;
                    enemy.x = block.col - 0.55;
                    enemy.eatingUid = -1;

                    const stomp = enemy.cfg.stomp ?? 0;
                    if (stomp > 0) {
                        Combat.damageUnit(model, block, stomp, enemy);
                        model.addEffect({ kind: 'damage', row: block.row, x: model.grid.colCenter(block.col), value: stomp, color: '#FFB35A' });
                    }
                    continue;
                }

                enemy.eatingUid = block.uid;

                // 冲锋：跃越后的首次攻击为一次性重击
                const charge = enemy.cfg.charge ?? 0;
                if (charge > 0 && !enemy.charged) {
                    enemy.charged = true;
                    Combat.damageUnit(model, block, charge, enemy);
                    model.addEffect({ kind: 'damage', row: block.row, x: model.grid.colCenter(block.col), value: charge, color: '#FF7A5A' });
                    continue;
                }

                Combat.damageUnit(model, block, enemy.cfg.eat * timeScale * dt, enemy);
                continue;
            }

            enemy.eatingUid = -1;

            // 工程兵挖壕：无阻挡时每 3 秒加固一层（最多 3 层）
            if (enemy.cfg.dig === true && enemy.digLayers < 3) {
                enemy.digTimer -= dt;
                if (enemy.digTimer <= 0) {
                    enemy.digLayers += 1;
                    enemy.digTimer = 3;
                }
            }

            // 弓箭兵抛射：推进到距城 range 格停驻
            const lob = enemy.cfg.lob;
            if (lob != null && enemy.x <= (lob.range ?? 4)) {
                this.fireAtFrontUnit(model, enemy, lob.damage, lob.interval, lob.volley ?? 1, dt);
                continue;
            }

            // 行进射击：弩兵 / 乌桓骑射
            const shoot = enemy.cfg.shoot;
            if (shoot != null) {
                this.fireAtFrontUnit(model, enemy, shoot.damage, shoot.interval, shoot.volley ?? 1, dt, false);
            }

            enemy.x -= enemy.cfg.speed * timeScale * dt;
        }
    }

    /** 对最靠城门（最左）的武将发动远程攻击 */
    private static fireAtFrontUnit(
        model: BattleModel,
        enemy: IEnemyInst,
        damage: number,
        interval: number,
        volley: number,
        dt: number,
        stopMove = true,
    ): void {
        enemy.shootTimer -= dt;

        const target = this.frontUnit(model, enemy.row);
        if (target == null) {
            // 没有目标时抛射手原地等待
            if (stopMove) enemy.shootTimer = Math.min(enemy.shootTimer, 0.3);
            return;
        }

        if (enemy.shootTimer > 0) return;
        enemy.shootTimer = Math.max(0.4, interval);

        const total = damage * Math.max(1, volley);
        Combat.damageUnit(model, target, total, enemy);
        model.addEffect({
            kind: 'damage',
            row: target.row,
            x: model.grid.colCenter(target.col),
            value: Math.round(total),
            color: '#C0392B',
        });

        // 可见弹道 + 枪口特效：抛射走弧线抛石，行进射击走直线箭矢
        const isArc = enemy.cfg.lob != null;
        const startX = enemy.x - 0.2;
        const tx = model.grid.colCenter(target.col);
        ProjectileSystem.spawnEnemyVisual(model, enemy.row, startX, tx, isArc ? '#B9A98E' : '#F2E6D0', isArc);
        BattleFx.muzzle(model, startX, enemy.row, isArc ? '#B9A98E' : '#F2E6D0', Math.PI);
    }

    /** 本行最靠城门（最左列）的存活武将 */
    private static frontUnit(model: BattleModel, row: number): IUnitInst | null {
        let target: IUnitInst | null = null;
        for (const unit of model.units) {
            if (!unit.alive || unit.row !== row) continue;
            if (target == null || unit.col < target.col) target = unit;
        }
        return target;
    }

    /** 查找当前啃咬目标：敌军前端进入某个单位格子即算接触 */
    private static findBlocker(model: BattleModel, enemy: IEnemyInst): IUnitInst | null {
        const front = enemy.x - 0.32;
        const col = model.grid.colAt(front);
        if (col < 0) return null;
        return model.unitAt(enemy.row, col);
    }
}
