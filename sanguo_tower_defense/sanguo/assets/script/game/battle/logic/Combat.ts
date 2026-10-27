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

        let remain = amount;
        if (enemy.armor > 0) {
            const absorbed = Math.min(enemy.armor, remain);
            enemy.armor -= absorbed;
            remain -= absorbed;
        }
        if (remain > 0) {
            enemy.hp -= remain;
        }
        enemy.hitFlash = 0.08;

        model.addEffect({ kind: 'damage', row: enemy.row, x: enemy.x, value: Math.round(amount), color });

        if (enemy.hp <= 0 && enemy.alive) {
            enemy.alive = false;
            model.kills += 1;
        }
    }

    /** 对单位造成伤害（敌军啃咬） */
    static damageUnit(model: BattleModel, unit: IUnitInst, amount: number): void {
        if (!unit.alive) return;
        unit.hp -= amount;
        unit.hitFlash = 0.08;
        if (unit.hp <= 0) {
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
