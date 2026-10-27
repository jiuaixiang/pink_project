import { SettingsModel } from '../../common/model/SettingsModel';
import type { IFoodDrop } from './Actor';
import type { BattleModel } from './BattleModel';

/** 军粮掉落物的存活时间（秒） */
const DROP_LIFE = 11;
/** 自动拾取延迟（秒） */
const AUTO_COLLECT_DELAY = 0.6;

/**
 * 粮草经济系统
 *
 * 1、天降军粮：按关卡配置的间隔与数量，随机落在战场内
 * 2、武将产出：桃园义士按配置周期在自身位置生成军粮
 * 3、拾取：点击拾取，或在设置中开启自动拾取（短暂延迟后自动收下）
 */
export class EconomySystem {
    static update(model: BattleModel, dt: number): void {
        // 天降军粮
        model.dropTimer -= dt;
        if (model.dropTimer <= 0) {
            model.dropTimer = Math.max(1, model.level.dropInterval);
            const x = 0.5 + Math.random() * (model.grid.cols - 1);
            const y = 0.3 + Math.random() * (model.grid.rows - 0.6);
            this.spawnDrop(model, x, y, model.level.dropValue);
        }

        // 掉落物生命周期与自动拾取
        const auto = SettingsModel.inst.autoCollect;
        for (const drop of model.drops) {
            if (!drop.alive) continue;
            drop.age += dt;
            drop.life -= dt;
            if (drop.life <= 0) {
                drop.alive = false;
                continue;
            }
            if (auto && drop.age >= AUTO_COLLECT_DELAY) {
                this.collect(model, drop.uid);
            }
        }
    }

    /** 生成军粮掉落物 */
    static spawnDrop(model: BattleModel, x: number, y: number, value: number): IFoodDrop {
        const drop: IFoodDrop = {
            uid: model.nextUid(),
            x,
            y,
            value,
            life: DROP_LIFE,
            age: 0,
            flying: false,
            alive: true,
        };
        model.drops.push(drop);
        return drop;
    }

    /** 拾取指定掉落物 */
    static collect(model: BattleModel, uid: number): boolean {
        for (const drop of model.drops) {
            if (drop.uid !== uid || !drop.alive) continue;
            drop.alive = false;
            model.addFood(drop.value);
            model.addEffect({ kind: 'food', row: 0, x: drop.x, y: drop.y, value: drop.value });
            return true;
        }
        return false;
    }

    /** 拾取全部（用于结算前或调试） */
    static collectAll(model: BattleModel): void {
        for (const drop of model.drops) {
            if (!drop.alive) continue;
            drop.alive = false;
            model.addFood(drop.value);
        }
    }
}
