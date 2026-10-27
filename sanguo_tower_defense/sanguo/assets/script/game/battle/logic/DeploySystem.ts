import type { IUnitConfig } from '../../common/table/ITable';
import { UnitKind } from '../../common/table/ITable';
import { TableUnits } from '../../common/table/TableUnits';
import { PlayerModel } from '../../common/model/PlayerModel';
import type { IUnitInst } from './Actor';
import type { BattleModel } from './BattleModel';

/** 部署结果 */
export enum DeployResult {
    Ok,
    /** 无此单位配置 */
    UnknownUnit,
    /** 格子非法或已被占用 */
    InvalidCell,
    /** 军粮不足 */
    NoFood,
    /** 卡片冷却中 */
    Cooling,
}

/** 布阵系统：卡片冷却、放置校验、部署与撤退 */
export class DeploySystem {
    /** 当前实际价格（同名再上阵按比例涨价） */
    static priceOf(model: BattleModel, unitId: string): number {
        const cfg = TableUnits.get(unitId);
        if (cfg == null) return 0;
        const times = model.deployCounts.get(unitId) ?? 0;
        const mul = 1 + model.gameplay.repeatCostMul * times;
        return Math.round(cfg.cost * mul);
    }

    /** 卡片是否可用（军粮 + 冷却） */
    static isCardReady(model: BattleModel, unitId: string): boolean {
        const cfg = TableUnits.get(unitId);
        if (cfg == null) return false;
        if (model.food < this.priceOf(model, unitId)) return false;
        const cd = model.cooldowns.get(unitId);
        return cd == null || cd <= 0;
    }

    /** 冷却剩余比例 0~1（1 表示刚进入冷却） */
    static cooldownRatio(model: BattleModel, unitId: string): number {
        const cfg = TableUnits.get(unitId);
        const remain = model.cooldowns.get(unitId) ?? 0;
        if (cfg == null || cfg.cooldown <= 0) return remain > 0 ? 1 : 0;
        return Math.min(1, Math.max(0, remain / cfg.cooldown));
    }

    /** 校验能否部署 */
    static check(model: BattleModel, unitId: string, row: number, col: number): DeployResult {
        const cfg = TableUnits.get(unitId);
        if (cfg == null) return DeployResult.UnknownUnit;
        if (!model.grid.isFree(row, col) || model.grid.isBlocked(row, col)) return DeployResult.InvalidCell;
        if (model.food < this.priceOf(model, unitId)) return DeployResult.NoFood;
        const cd = model.cooldowns.get(unitId);
        if (cd != null && cd > 0) return DeployResult.Cooling;
        return DeployResult.Ok;
    }

    /** 正常部署（消耗军粮并进入冷却） */
    static deploy(model: BattleModel, unitId: string, row: number, col: number): IUnitInst | null {
        const result = this.check(model, unitId, row, col);
        if (result !== DeployResult.Ok) return null;

        const cfg = TableUnits.get(unitId)!;
        const price = this.priceOf(model, unitId);
        if (!model.consumeFood(price)) return null;

        // 装备的冷却缩减只在部署时结算
        const stats = PlayerModel.inst.statsOf(unitId);
        model.cooldowns.set(unitId, Math.max(0.5, cfg.cooldown - stats.cdReduce));
        model.deployCounts.set(unitId, (model.deployCounts.get(unitId) ?? 0) + 1);

        const unit = this.create(model, cfg, row, col, price);
        model.recomputeBonds();
        return unit;
    }

    /** 免费预置（关卡开局布阵，不计军粮与冷却） */
    static placeFree(model: BattleModel, unitId: string, row: number, col: number): IUnitInst | null {
        const cfg = TableUnits.get(unitId);
        if (cfg == null || !model.grid.isFree(row, col) || model.grid.isBlocked(row, col)) return null;
        const unit = this.create(model, cfg, row, col, 0);
        model.recomputeBonds();
        return unit;
    }

    /** 撤退令：移除单位并返还 60% 实付粮草 */
    static retreat(model: BattleModel, unitUid: number): boolean {
        const unit = model.findUnit(unitUid);
        if (unit == null) return false;
        unit.alive = false;
        model.grid.release(unit.row, unit.col);

        const refund = Math.floor(unit.paid * model.gameplay.refundRate);
        if (refund > 0) model.addFood(refund);

        model.recomputeBonds();
        return true;
    }

    /** 冷却推进 */
    static update(model: BattleModel, dt: number): void {
        model.cooldowns.forEach((value, key) => {
            if (value <= 0) return;
            const next = value - dt;
            if (next <= 0) model.cooldowns.set(key, 0);
            else model.cooldowns.set(key, next);
        });
    }

    private static create(model: BattleModel, cfg: IUnitConfig, row: number, col: number, paid: number): IUnitInst {
        const stats = PlayerModel.inst.statsOf(cfg.id);
        const maxHp = Math.round(cfg.hp * (1 + model.bondHp + stats.hpPct));
        const unit: IUnitInst = {
            uid: model.nextUid(),
            cfgId: cfg.id,
            cfg,
            row,
            col,
            hp: maxHp,
            maxHp,
            attackTimer: cfg.kind === UnitKind.Mine ? 0 : 0.35,
            produceTimer: cfg.produce != null ? cfg.produce.interval * 0.7 : 0,
            fuseTimer: cfg.kind === UnitKind.Bomber || cfg.kind === UnitKind.RowClear ? (cfg.fuse ?? 0.9) : 0,
            armTimer: cfg.kind === UnitKind.Mine ? (cfg.armTime ?? 12) : 0,
            auraAtk: 0,
            auraSpeed: 0,
            hitFlash: 0,
            talentTimer: cfg.talent != null && cfg.talent.cd > 0 ? cfg.talent.cd * 0.6 : 0,
            atkBuffMul: 1,
            atkBuffTimer: 0,
            drMul: 1,
            drTimer: 0,
            chewTimer: 0,
            revived: false,
            paid,
            equipAtk: stats.atkPct,
            equipAspd: stats.aspd,
            equipCrit: stats.critPct,
            alive: true,
        };
        model.units.push(unit);
        model.grid.occupy(row, col, unit.uid);
        return unit;
    }
}
