import type { IProjectileConfig } from '../../common/table/ITable';
import { ProjectileKind } from '../../common/table/ITable';
import { TableProjectiles } from '../../common/table/TableProjectiles';
import type { IEnemyInst, IProjectileInst } from './Actor';
import type { BattleModel } from './BattleModel';
import { Combat } from './Combat';

/** 弹道系统：直线命中、抛射溅射、寒冰减速 */
export class ProjectileSystem {
    static spawnLine(
        model: BattleModel,
        row: number,
        x: number,
        projectileId: string,
        damage: number,
        slow: number,
        slowDuration: number,
        pierce = false,
        crit = false,
    ): void {
        const cfg = this.getConfig(projectileId);
        const inst: IProjectileInst = {
            uid: model.nextUid(),
            cfg,
            row,
            x,
            targetX: 0,
            progress: 0,
            startX: x,
            duration: 0,
            damage,
            slow,
            slowDuration,
            pierce,
            hitUids: [],
            crit,
            alive: true,
        };
        model.projectiles.push(inst);
    }

    static spawnArc(
        model: BattleModel,
        row: number,
        startX: number,
        targetX: number,
        projectileId: string,
        damage: number,
    ): void {
        const cfg = this.getConfig(projectileId);
        const distance = Math.max(0.5, Math.abs(targetX - startX));
        const inst: IProjectileInst = {
            uid: model.nextUid(),
            cfg,
            row,
            x: startX,
            targetX,
            progress: 0,
            startX,
            duration: distance / cfg.speed,
            damage,
            slow: 0,
            slowDuration: 0,
            pierce: false,
            hitUids: [],
            crit: false,
            alive: true,
        };
        model.projectiles.push(inst);
    }

    /** 敌方远程：仅表现弹道（伤害已在 EnemySystem 即时结算），朝左飞 */
    static spawnEnemyVisual(
        model: BattleModel,
        row: number,
        startX: number,
        targetX: number,
        color: string,
        arc = false,
    ): void {
        const cfg: IProjectileConfig = {
            id: '__enemy',
            kind: arc ? ProjectileKind.Arc : ProjectileKind.Line,
            speed: 7,
            color,
            width: arc ? 9 : 5,
            visual: arc ? 'stone' : 'arrow',
            tail: !arc,
        };
        const distance = Math.max(0.5, Math.abs(targetX - startX));
        const inst: IProjectileInst = {
            uid: model.nextUid(),
            cfg,
            row,
            x: startX,
            targetX,
            progress: 0,
            startX,
            duration: distance / Math.max(0.5, cfg.speed),
            damage: 0,
            slow: 0,
            slowDuration: 0,
            pierce: false,
            hitUids: [],
            crit: false,
            hostile: true,
            alive: true,
        };
        model.projectiles.push(inst);
    }

    static update(model: BattleModel, dt: number): void {
        for (const p of model.projectiles) {
            if (!p.alive) continue;

            // 敌方弹道：只做位移表现，不做命中结算
            if (p.hostile === true) {
                if (p.cfg.kind === ProjectileKind.Arc) {
                    p.progress += dt / Math.max(0.15, p.duration);
                    if (p.progress >= 1) {
                        p.alive = false;
                        continue;
                    }
                    p.x = p.startX + (p.targetX - p.startX) * p.progress;
                }
                else {
                    p.x -= p.cfg.speed * dt;
                    if (p.x <= p.targetX - 0.1) p.alive = false;
                }
                continue;
            }

            if (p.cfg.kind === ProjectileKind.Arc) {
                p.progress += dt / Math.max(0.15, p.duration);
                if (p.progress >= 1) {
                    p.progress = 1;
                    p.alive = false;
                    const radius = p.cfg.splash ?? 0.6;
                    Combat.explode(model, p.row, p.targetX, radius, p.damage, 0);
                    continue;
                }
                p.x = p.startX + (p.targetX - p.startX) * p.progress;
                continue;
            }

            p.x += p.cfg.speed * dt;
            const hit = this.findHit(model, p);
            if (hit != null) {
                Combat.damageEnemy(model, hit, p.damage, p.crit ? '#FF7A5A' : p.cfg.color);
                if (p.slow > 0) {
                    hit.slowRemain = Math.max(hit.slowRemain, p.slowDuration);
                    hit.slowFactor = Math.max(0.15, 1 - p.slow);
                }

                if (p.pierce) {
                    // 贯穿弹：记录已命中目标后继续前飞（马岱回旋镖）
                    p.hitUids.push(hit.uid);
                }
                else {
                    p.alive = false;
                    continue;
                }
            }
            if (p.x > model.gameplay.spawnX + 1) p.alive = false;
        }
    }

    /** 命中最靠左的接触敌军 */
    private static findHit(model: BattleModel, p: IProjectileInst): IEnemyInst | null {
        let hit: IEnemyInst | null = null;
        for (const enemy of model.enemies) {
            if (!enemy.alive || enemy.row !== p.row) continue;
            if (p.hitUids.indexOf(enemy.uid) >= 0) continue;
            if (Math.abs(enemy.x - p.x) > 0.34) continue;
            if (hit == null || enemy.x < hit.x) hit = enemy;
        }
        return hit;
    }

    private static getConfig(id: string): IProjectileConfig {
        const cfg = TableProjectiles.get(id);
        if (cfg != null) return cfg;
        console.warn(`[三国塔防] 弹道 ${id} 不存在，使用兜底配置`);
        return {
            id,
            kind: ProjectileKind.Line,
            speed: 6,
            color: '#F2E6D0',
            width: 5,
            splash: 0,
        };
    }
}
