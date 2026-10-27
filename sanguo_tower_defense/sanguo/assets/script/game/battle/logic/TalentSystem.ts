import type { ITalentConfig } from '../../common/table/ITable';
import type { IEnemyInst, IUnitInst } from './Actor';
import type { BattleModel } from './BattleModel';
import { Combat } from './Combat';

/**
 * 武将天赋系统
 *
 * 与参考稿 game-config.js 的 talent 字段一一对应：
 * 施法型（caster）按 cd 自动施放；射击 / 产粮 / 阻挡类天赋是其普攻与被动本身，
 * 由 UnitSystem 的常规行为实现，本系统只处理"到点触发"的天赋。
 */
export class TalentSystem {
    /** 主动施放类天赋 id */
    private static readonly CASTABLE: string[] = [
        'roar',      // 张飞·咆哮
        'bagua',     // 诸葛亮·八卦阵
        'immolate',  // 黄盖·苦肉烈焰
        'burnRow',   // 陆逊·火烧连营
        'crush',     // 许褚·虎痴力劈
        'devour',    // 甘宁·锦帆吞噬
        'sweep',     // 张辽·威震逍遥津
        'thunder',   // 司马懿·鹰视狼顾
        'rally',     // 曹操·奸雄
        'luoshui',   // 甄姬·洛神
        'ambush',    // 姜维·伏兵
        'fury',      // 董卓·暴虐
    ];

    static isCastable(id: string): boolean {
        return this.CASTABLE.indexOf(id) >= 0;
    }

    /**
     * 每帧驱动：先结算增益计时，再按冷却施放天赋
     * 所有单位都会走这里（光环 / 增益需要为每个单位计时）
     */
    static update(model: BattleModel, unit: IUnitInst, dt: number): void {
        if (unit.atkBuffTimer > 0) {
            unit.atkBuffTimer -= dt;
            if (unit.atkBuffTimer <= 0) unit.atkBuffMul = 1;
        }
        if (unit.drTimer > 0) {
            unit.drTimer -= dt;
            if (unit.drTimer <= 0) unit.drMul = 1;
        }

        const talent = unit.cfg.talent;
        if (talent == null || !this.isCastable(talent.id)) return;

        // 咀嚼 / 施法硬直期间不施放
        if (unit.chewTimer > 0) {
            unit.chewTimer -= dt;
            return;
        }

        unit.talentTimer -= dt;
        if (unit.talentTimer > 0) return;

        const success = this.cast(model, unit, talent);
        unit.talentTimer = success ? Math.max(0.5, talent.cd) : 0.3;
    }

    /** 执行一次天赋，返回是否成功（无目标时失败，短间隔重试） */
    private static cast(model: BattleModel, unit: IUnitInst, talent: ITalentConfig): boolean {
        const center = model.grid.colCenter(unit.col);

        switch (talent.id) {
            case 'roar':
                return this.roar(model, unit, talent, center);
            case 'bagua':
                return this.bagua(model, unit, talent, center);
            case 'immolate':
                // 自爆类：范围内无敌人时不自焚，等下一轮
                if (!this.hasEnemyNear(model, unit, center, talent.radius ?? 1.2, 1)) return false;
                Combat.explode(model, unit.row, center, talent.radius ?? 1.2, talent.damage ?? 1800, 1);
                Combat.removeUnit(model, unit);
                return true;
            case 'burnRow':
                if (!this.hasEnemyNear(model, unit, 4.5, 6, 0)) return false;
                Combat.rowClear(model, unit.row, talent.damage ?? 1800);
                Combat.removeUnit(model, unit);
                return true;
            case 'crush':
                return this.crush(model, unit, talent, center);
            case 'devour':
                return this.devour(model, unit, talent, center);
            case 'sweep':
                return this.sweep(model, unit, talent);
            case 'thunder':
                return this.thunder(model, unit, talent);
            case 'rally':
                this.rally(model, talent);
                return true;
            case 'luoshui':
                this.luoshui(model, talent);
                return true;
            case 'ambush':
                return this.ambush(model, unit, talent, center);
            case 'fury':
                if (!this.hasEnemyNear(model, unit, center, talent.radius ?? 1.5, 1)) return false;
                Combat.explode(model, unit.row, center, talent.radius ?? 1.5, talent.damage ?? 1800, 1);
                Combat.removeUnit(model, unit);
                return true;
            default:
                return false;
        }
    }

    /** 张飞·咆哮：正前方两格内的敌军被击退并受伤 */
    private static roar(model: BattleModel, unit: IUnitInst, talent: ITalentConfig, center: number): boolean {
        const reach = 2.6;
        let hit = false;
        for (const enemy of model.enemies) {
            if (!enemy.alive || enemy.row !== unit.row) continue;
            const gap = enemy.x - center;
            if (gap < -0.2 || gap > reach) continue;
            Combat.damageEnemy(model, enemy, talent.damage ?? 20, '#E8CF95');
            enemy.x = Math.min(model.gameplay.spawnX, enemy.x + (talent.knock ?? 1.25));
            hit = true;
        }
        if (!hit) return false;
        model.addEffect({ kind: 'explosion', row: unit.row, x: center + 1, radius: reach });
        return true;
    }

    /** 诸葛亮·八卦阵：对最近的敌军布下 3×3 减速场 */
    private static bagua(model: BattleModel, unit: IUnitInst, talent: ITalentConfig, center: number): boolean {
        const target = this.nearestAhead(model, unit, center, 99);
        if (target == null) return false;

        const radius = talent.radius ?? 1.5;
        model.addSlowField(unit.row, target.x, radius, talent.duration ?? 3, 1 - (talent.slow ?? 0.5));
        // 立即生效，不等下一帧
        for (const enemy of model.enemies) {
            if (!enemy.alive || enemy.row !== unit.row) continue;
            if (Math.abs(enemy.x - target.x) > radius) continue;
            enemy.slowRemain = Math.max(enemy.slowRemain, talent.duration ?? 3);
            enemy.slowFactor = Math.min(enemy.slowFactor, 1 - (talent.slow ?? 0.5));
        }
        model.addEffect({ kind: 'explosion', row: unit.row, x: target.x, radius });
        return true;
    }

    /** 许褚·虎痴力劈：扑杀近敌后自毁 */
    private static crush(model: BattleModel, unit: IUnitInst, talent: ITalentConfig, center: number): boolean {
        const target = this.nearestAhead(model, unit, center, 1.3);
        if (target == null) return false;

        Combat.damageEnemy(model, target, talent.damage ?? 2000, '#D9A441');
        model.addEffect({ kind: 'explosion', row: unit.row, x: target.x, radius: 0.6 });
        Combat.removeUnit(model, unit);
        return true;
    }

    /** 甘宁·锦帆吞噬：重创近敌后进入长时咀嚼 */
    private static devour(model: BattleModel, unit: IUnitInst, talent: ITalentConfig, center: number): boolean {
        const target = this.nearestAhead(model, unit, center, 1.3);
        if (target == null) return false;

        Combat.damageEnemy(model, target, talent.damage ?? 2200, '#C0392B');
        unit.chewTimer = Math.max(4, talent.cd);
        model.addEffect({ kind: 'explosion', row: unit.row, x: target.x, radius: 0.5 });
        return true;
    }

    /** 张辽·威震逍遥津：全场受创并减速 */
    private static sweep(model: BattleModel, unit: IUnitInst, talent: ITalentConfig): boolean {
        if (model.enemies.length === 0) return false;

        for (const enemy of model.enemies) {
            if (!enemy.alive) continue;
            Combat.damageEnemy(model, enemy, talent.damage ?? 25, '#7FB4D8');
            enemy.slowRemain = Math.max(enemy.slowRemain, talent.slowT ?? 3);
            enemy.slowFactor = Math.min(enemy.slowFactor, 1 - (talent.slow ?? 0.5));
        }
        model.addEffect({ kind: 'explosion', row: unit.row, x: 4.5, radius: 5 });
        return true;
    }

    /** 司马懿·鹰视狼顾：本行与上下两行一并受创 */
    private static thunder(model: BattleModel, unit: IUnitInst, talent: ITalentConfig): boolean {
        let hit = false;
        for (const enemy of model.enemies) {
            if (!enemy.alive) continue;
            if (Math.abs(enemy.row - unit.row) > 1) continue;
            Combat.damageEnemy(model, enemy, talent.damage ?? 25, '#9FB8FF');
            hit = true;
        }
        if (hit) model.addEffect({ kind: 'explosion', row: unit.row, x: 4.5, radius: 5 });
        return hit;
    }

    /** 曹操·奸雄：全军攻击 +25%（6 秒） */
    private static rally(model: BattleModel, talent: ITalentConfig): void {
        const buff = 1 + (talent.atkBuff ?? 0.25);
        for (const ally of model.units) {
            if (!ally.alive) continue;
            ally.atkBuffMul = Math.max(ally.atkBuffMul, buff);
            ally.atkBuffTimer = Math.max(ally.atkBuffTimer, talent.duration ?? 6);
        }
        model.addEffect({ kind: 'shout', row: 0, x: 4.5 });
    }

    /** 甄姬·洛神：全军回血 15% 并获得 20% 减伤（5 秒） */
    private static luoshui(model: BattleModel, talent: ITalentConfig): void {
        for (const ally of model.units) {
            if (!ally.alive) continue;
            ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * (talent.heal ?? 0.15));
            ally.drMul = Math.min(ally.drMul, 1 - (talent.dr ?? 0.2));
            ally.drTimer = Math.max(ally.drTimer, talent.duration ?? 5);
        }
        model.addEffect({ kind: 'shout', row: 0, x: 4.5 });
    }

    /** 姜维·伏兵：最前之敌踏入埋伏圈即受创并眩晕 */
    private static ambush(model: BattleModel, unit: IUnitInst, talent: ITalentConfig, center: number): boolean {
        const target = this.nearestAhead(model, unit, center, 99);
        if (target == null) return false;

        Combat.damageEnemy(model, target, talent.damage ?? 1800, '#5B8F5B');
        target.stunTimer = Math.max(target.stunTimer, talent.stun ?? 2.5);
        model.addEffect({ kind: 'explosion', row: unit.row, x: target.x, radius: 0.55 });
        return true;
    }

    /** 范围内是否有敌人（自爆类天赋的前置判断） */
    private static hasEnemyNear(model: BattleModel, unit: IUnitInst, center: number, radius: number, rowsSpan: number): boolean {
        for (const enemy of model.enemies) {
            if (!enemy.alive) continue;
            if (Math.abs(enemy.row - unit.row) > rowsSpan) continue;
            if (Math.abs(enemy.x - center) > radius) continue;
            return true;
        }
        return false;
    }

    /** 本行前方最近的敌军 */
    private static nearestAhead(model: BattleModel, unit: IUnitInst, center: number, reach: number): IEnemyInst | null {
        let target: IEnemyInst | null = null;
        for (const enemy of model.enemies) {
            if (!enemy.alive || enemy.row !== unit.row) continue;
            const gap = enemy.x - center;
            if (gap < -0.2 || gap > reach) continue;
            if (target == null || enemy.x < target.x) target = enemy;
        }
        return target;
    }
}
