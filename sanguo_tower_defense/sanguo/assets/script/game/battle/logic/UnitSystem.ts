import type { IUnitConfig } from '../../common/table/ITable';
import { UnitKind } from '../../common/table/ITable';
import type { IEnemyInst, IUnitInst } from './Actor';
import type { BattleModel } from './BattleModel';
import { Combat } from './Combat';
import { EconomySystem } from './EconomySystem';
import { ProjectileSystem } from './ProjectileSystem';
import { TalentSystem } from './TalentSystem';

/**
 * 武将系统
 *
 * 按配置的 kind 分发行为：
 * producer 产出军粮 / shooter 直线射击 / wall 纯阻挡 / bomber 范围爆炸
 * rowclear 整行清场 / support 同排光环 / mine 陷阱 / lobber 抛射溅射
 */
export class UnitSystem {
    static update(model: BattleModel, dt: number): void {
        this.applyAura(model);

        for (const unit of model.units) {
            if (!unit.alive) continue;
            if (unit.hitFlash > 0) unit.hitFlash -= dt;

            // 天赋与增益统一计时（含 buff 衰减）
            TalentSystem.update(model, unit, dt);

            const cfg = unit.cfg;
            switch (cfg.kind) {
                case UnitKind.Producer:
                    this.updateProducer(model, unit, dt);
                    break;
                case UnitKind.Shooter:
                case UnitKind.Lobber:
                    this.updateShooter(model, unit, dt);
                    break;
                case UnitKind.Bomber:
                case UnitKind.RowClear:
                    this.updateFuse(model, unit, dt);
                    break;
                case UnitKind.Mine:
                    this.updateMine(model, unit, dt);
                    break;
                case UnitKind.Wall:
                case UnitKind.Support:
                    break;
                case UnitKind.Caster:
                    // 只施放天赋，不做普攻
                    break;
                default:
                    break;
            }
        }
    }

    /** 光环：为同排单位提供攻击力与攻速加成（保留扩展位，当前阵容未使用） */
    private static applyAura(model: BattleModel): void {
        for (const unit of model.units) {
            unit.auraAtk = 0;
            unit.auraSpeed = 0;
        }

        for (const support of model.units) {
            if (!support.alive || support.cfg.kind !== UnitKind.Support) continue;
            const atkBonus = support.cfg.auraAtk ?? 0;
            const speedBonus = support.cfg.auraSpeed ?? 0;
            for (const target of model.units) {
                if (!target.alive || target === support) continue;
                if (target.row !== support.row) continue;
                target.auraAtk += atkBonus;
                target.auraSpeed += speedBonus;
            }
        }
    }

    private static updateProducer(model: BattleModel, unit: IUnitInst, dt: number): void {
        const produce = unit.cfg.produce;
        if (produce == null) return;

        unit.produceTimer -= dt;
        if (unit.produceTimer > 0) return;

        unit.produceTimer = Math.max(1, produce.interval);
        EconomySystem.spawnDrop(model, model.grid.colCenter(unit.col), unit.row + 0.5, produce.value);
        model.addEffect({ kind: 'food', row: unit.row, x: model.grid.colCenter(unit.col), value: produce.value });
    }

    private static updateShooter(model: BattleModel, unit: IUnitInst, dt: number): void {
        const cfg = unit.cfg;
        const interval = Math.max(0.2, (cfg.interval ?? 1.4) / (1 + unit.auraSpeed + model.bondAspd + unit.equipAspd));

        unit.attackTimer -= dt;
        if (unit.attackTimer > 0) return;

        // 三排武将（床弩/太史慈/司马懿）对每排各自索敌，各自出一发
        const span = cfg.rows ?? 1;
        const lanes = span >= 3 ? [unit.row - 1, unit.row, unit.row + 1] : [unit.row];

        let fired = false;
        // 攻击力 = 基础 × 光环 × 增伤 buff × 羁缘 × 装备
        const damage = (cfg.atk ?? 0) * (1 + unit.auraAtk + model.bondAtk + unit.equipAtk) * unit.atkBuffMul;
        const volley = Math.max(1, cfg.volley ?? 1);
        const projectile = cfg.projectile ?? 'arrow';
        const pierce = cfg.pierce === true;

        for (const lane of lanes) {
            if (lane < 0 || lane >= model.grid.rows) continue;
            const target = this.findTarget(model, unit, lane);
            if (target == null) continue;

            if (cfg.kind === UnitKind.Lobber) {
                ProjectileSystem.spawnArc(model, lane, model.grid.colCenter(unit.col), target.x, projectile, damage);
                fired = true;
                continue;
            }

            for (let i = 0; i < volley; i++) {
                // 暴击按每发独立判定（装备提供）
                const crit = unit.equipCrit > 0 && Math.random() < unit.equipCrit;
                const startX = model.grid.colCenter(unit.col) + 0.35 - i * 0.22;
                ProjectileSystem.spawnLine(
                    model, lane, startX, projectile, crit ? damage * 1.5 : damage,
                    cfg.slowFactor ?? 0, cfg.slowDuration ?? 0, pierce, crit,
                );
            }
            fired = true;
        }

        if (!fired) {
            // 没有目标时保持短轮询，避免每次都要等满攻击间隔
            unit.attackTimer = 0.1;
            return;
        }

        unit.attackTimer = interval;
        model.addEffect({ kind: 'shoot', row: unit.row, x: model.grid.colCenter(unit.col) });
    }

    /** 找到指定行攻击范围内最靠左（最靠前）的敌军 */
    private static findTarget(model: BattleModel, unit: IUnitInst, lane: number): IEnemyInst | null {
        const rows = [lane];
        const minX = model.grid.colCenter(unit.col) + 0.1;
        let target: IEnemyInst | null = null;

        for (const enemy of model.enemies) {
            if (!enemy.alive) continue;
            if (rows.indexOf(enemy.row) < 0) continue;
            if (enemy.x < minX) continue;
            if (target == null || enemy.x < target.x) target = enemy;
        }
        return target;
    }

    private static updateFuse(model: BattleModel, unit: IUnitInst, dt: number): void {
        unit.fuseTimer -= dt;
        if (unit.fuseTimer > 0) return;

        const cfg: IUnitConfig = unit.cfg;
        const damage = cfg.damage ?? 1800;

        if (cfg.kind === UnitKind.Bomber) {
            Combat.explode(model, unit.row, model.grid.colCenter(unit.col), cfg.radius ?? 1.2, damage, 1);
        }
        else {
            Combat.rowClear(model, unit.row, damage);
        }
        Combat.removeUnit(model, unit);
    }

    private static updateMine(model: BattleModel, unit: IUnitInst, dt: number): void {
        if (unit.armTimer > 0) {
            unit.armTimer -= dt;
            return;
        }

        // 蓄势完成后，同格出现敌军即引爆
        const center = model.grid.colCenter(unit.col);
        for (const enemy of model.enemies) {
            if (!enemy.alive || enemy.row !== unit.row) continue;
            if (Math.abs(enemy.x - center) > 0.52) continue;
            Combat.explode(model, unit.row, center, unit.cfg.radius ?? 0.55, unit.cfg.damage ?? 1800, 0);
            Combat.removeUnit(model, unit);
            return;
        }
    }
}
