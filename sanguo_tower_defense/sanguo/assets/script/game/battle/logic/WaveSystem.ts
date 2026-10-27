import type { IWaveConfig } from '../../common/table/ITable';
import type { IRuntimeGroup } from './Actor';
import type { BattleModel } from './BattleModel';
import { EnemySystem } from './EnemySystem';

/**
 * 波次系统
 *
 * 1、按关卡配置的绝对时间触发波次
 * 2、每个分组独立计时出兵，行 -1 表示随机行
 * 3、大波触发时推送横幅表现事件
 */
export class WaveSystem {
    static update(model: BattleModel, dt: number): void {
        // 触发到点的波次
        while (model.waveCursor < model.waves.length && model.time >= model.waves[model.waveCursor].at) {
            const wave = model.waves[model.waveCursor];
            this.activate(model, wave);
            model.waveCursor += 1;
        }

        // 分组出兵
        for (const group of model.groups) {
            if (group.remaining <= 0) continue;

            group.timer -= dt;
            while (group.remaining > 0 && group.timer <= 0) {
                const row = group.row < 0 ? Math.floor(Math.random() * model.grid.rows) : group.row;
                EnemySystem.spawn(model, group.enemy, row);
                group.remaining -= 1;
                group.timer += Math.max(0.05, group.interval);
            }
        }
    }

    private static activate(model: BattleModel, wave: IWaveConfig): void {
        if (wave.big === true) {
            model.addEffect({ kind: 'bigwave', row: 0, x: model.grid.cols / 2 });
        }

        for (const group of wave.groups) {
            const runtime: IRuntimeGroup = {
                enemy: group.enemy,
                row: group.row,
                remaining: Math.max(0, group.count),
                interval: Math.max(0.05, group.interval),
                timer: Math.max(0, group.delay ?? 0),
            };
            model.groups.push(runtime);
        }
    }

    /** 下一波的时间（用于 HUD 预告），无则返回 -1 */
    static nextWaveTime(model: BattleModel): number {
        if (model.waveCursor >= model.waves.length) return -1;
        return model.waves[model.waveCursor].at;
    }
}
