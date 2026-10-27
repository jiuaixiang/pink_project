import type { IEnemyInst, IUnitInst } from './Actor';
import type { BattleModel } from './BattleModel';

/** 战斗结算公共逻辑：伤害、爆炸、清行 */
export class Combat {
    /**
     * 对敌军造成伤害
     * 护甲优先被消耗，溢出部分才伤及生命值
     */
    static damageEnemy(model: BattleModel, enemy: IEnemyInst, amount: number, color?: string): void {
        if (!enemy.alive || amount <= 0) return;

        // 受伤系数（刀盾/戟兵等）+ 工程兵挖壕减伤（最多 3 层，每层 20%）
        const mul = (enemy.cfg.dmgMul ?? 1) * (1 - Math.min(3, enemy.digLayers) * 0.2);
        let remain = amount * mul;

        if (enemy.armor > 0) {
            const absorbed = Math.min(enemy.armor, remain);
            enemy.armor -= absorbed;
            remain -= absorbed;
        }
        if (remain > 0) {
            enemy.hp -= remain;
        }
        enemy.hitFlash = 0.08;

        // 义兵怯战：首次受击停步
        if (enemy.cfg.hesitate != null && !enemy.hesitated) {
            enemy.hesitated = true;
            enemy.stunTimer = Math.max(enemy.stunTimer, enemy.cfg.hesitate);
        }

        // 反伤等极小额持续伤害不飘字，避免刷屏
        if (amount >= 1) {
            model.addEffect({ kind: 'damage', row: enemy.row, x: enemy.x, value: Math.round(amount), color });
        }

        if (enemy.hp <= 0 && enemy.alive) {
            enemy.alive = false;
            model.kills += 1;
            model.addEffect({ kind: 'die', row: enemy.row, x: enemy.x });

            // 击杀基础掉粮 + 民夫 / 辎重车劫粮
            const gold = (model.gameplay.killGold ?? 0) + (enemy.cfg.loot ?? 0);
            if (gold > 0) model.addFood(gold);

            // 连击：窗口内连杀达到阈值额外奖励
            if (model.comboTimer > 0) model.comboCount += 1;
            else model.comboCount = 1;
            model.comboTimer = model.gameplay.comboWindow;

            if (model.comboCount >= model.gameplay.comboKills) {
                model.comboCount = 0;
                model.comboTimer = 0;
                const bonus = model.gameplay.comboReward;
                model.addFood(bonus);
                model.addEffect({ kind: 'food', row: enemy.row, x: enemy.x, value: bonus });
            }
        }
    }

    /**
     * 对单位造成伤害（敌军啃咬）
     * @param attacker 攻击者，带反伤的单位（兀突骨）会按啃咬速度持续反弹伤害
     */
    static damageUnit(model: BattleModel, unit: IUnitInst, amount: number, attacker?: IEnemyInst): void {
        if (!unit.alive) return;

        // 甄姬洛神减伤
        unit.hp -= amount * unit.drMul;
        unit.hitFlash = 0.08;

        const thorns = unit.cfg.thorns ?? 0;
        if (thorns > 0 && attacker != null && attacker.alive) {
            // amount 是"每秒啃咬 × 本帧时长"，按同一比例换算反伤，避免帧率影响强度
            const bite = Math.max(1, attacker.cfg.eat);
            this.damageEnemy(model, attacker, thorns * (amount / bite), '#C0392B');
        }

        if (unit.hp <= 0) {
            // 庞统涅槃：每局一次，原地复起并烈焰反噬
            const talent = unit.cfg.talent;
            if (talent != null && talent.id === 'revive' && !unit.revived) {
                unit.revived = true;
                unit.hp = Math.max(1, unit.maxHp * (talent.heal ?? 0.5));
                model.addEffect({ kind: 'explosion', row: unit.row, x: model.grid.colCenter(unit.col), radius: 1 });
                this.explode(model, unit.row, model.grid.colCenter(unit.col), 1, 600, 1);
                return;
            }
            this.removeUnit(model, unit);
        }
    }

    /** 移除单位并释放格子 */
    static removeUnit(model: BattleModel, unit: IUnitInst): void {
        if (!unit.alive) return;
        unit.alive = false;
        model.grid.release(unit.row, unit.col);
    }

    /**
     * 范围爆炸
     * @param rowsSpan 纵向波及的行数跨度（1 表示上下各一行，0 表示只影响本行）
     */
    static explode(model: BattleModel, row: number, x: number, radius: number, damage: number, rowsSpan = 1): void {
        model.addEffect({ kind: 'explosion', row, x, radius });

        for (const enemy of model.enemies) {
            if (!enemy.alive) continue;
            if (Math.abs(enemy.row - row) > rowsSpan) continue;
            if (Math.abs(enemy.x - x) > radius) continue;
            this.damageEnemy(model, enemy, damage, '#D9A441');
        }
    }

    /** 整行清场 */
    static rowClear(model: BattleModel, row: number, damage: number): void {
        model.addEffect({ kind: 'explosion', row, x: 4.5, radius: 12 });
        for (const enemy of model.enemies) {
            if (!enemy.alive || enemy.row !== row) continue;
            this.damageEnemy(model, enemy, damage, '#C0392B');
        }
    }
}
