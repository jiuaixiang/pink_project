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
    /** 无尽模式：按波数程序生成 */
    private static readonly TIERS: string[][] = [
        ['inf', 'tuntian', 'yibing'],
        ['inf', 'yibing', 'cav', 'gongjian'],
        ['inf', 'iron', 'shield', 'cav'],
        ['inf', 'arch', 'zhongqi', 'pole'],
        ['shanyue', 'houqi', 'iron', 'arch'],
    ];

    static update(model: BattleModel, dt: number): void {
        if (model.level.endless === true) {
            this.updateEndless(model, dt);
            return;
        }
        // 新手引导：部署前暂缓开波（参考稿「放下第一枚将才迎战」）
        if (model.wavesHeld) {
            model.waveHoldTime += dt;
            return;
        }

        // 触发到点的波次（波次时间轴按挂起时长顺延）
        while (model.waveCursor < model.waves.length && model.time - model.waveHoldTime >= model.waves[model.waveCursor].at) {
            const wave = model.waves[model.waveCursor];
            this.activate(model, wave);
            model.waveCursor += 1;
        }

        // 分组出兵
        for (const group of model.groups) {
            if (group.remaining <= 0) continue;

            group.timer -= dt;
            while (group.remaining > 0 && group.timer <= 0) {
                const row = this.pickRow(model, group.row);
                EnemySystem.spawn(model, group.enemy, row);
                group.remaining -= 1;
                group.timer += Math.max(0.05, group.interval);
            }
        }
    }

    /** 无尽模式：每 18 秒一波，每 10 波加入主将 */
    private static updateEndless(model: BattleModel, dt: number): void {
        model.endlessTimer -= dt;
        if (model.endlessTimer > 0) return;

        model.endlessWave += 1;
        model.endlessTimer = 18;
        this.activate(model, this.generateEndless(model.endlessWave));
    }

    /** 按波数生成无尽波次（随波数提升兵种与数量） */
    private static generateEndless(wave: number): IWaveConfig {
        const tierIndex = Math.min(this.TIERS.length - 1, Math.floor((wave - 1) / 3));
        const pool = this.TIERS[tierIndex];
        const count = 3 + Math.floor(wave / 2);
        const groups = [
            {
                enemy: pool[Math.floor(Math.random() * pool.length)],
                row: -1,
                count,
                interval: Math.max(1.2, 3 - wave * 0.03),
            },
        ];

        if (wave % 3 === 0) {
            groups.push({ enemy: pool[Math.floor(Math.random() * pool.length)], row: -1, count: Math.max(2, Math.floor(count / 2)), interval: 1.6 });
        }

        const big = wave % 10 === 0;
        if (big) {
            groups.push({ enemy: 'boss', row: 2, count: 1 + Math.floor(wave / 20), interval: 0.5 });
        }

        return { id: `endless_${wave}`, at: 0, big, groups };
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
        return model.waves[model.waveCursor].at + model.waveHoldTime;
    }

    /**
     * 选择出生行：指定行（>=0）直接使用；随机行（<0）只在「可通行走廊」里挑，
     * 避免敌军刷在高山 / 激流等被地形封死的「其它道路」上。
     */
    private static pickRow(model: BattleModel, row: number): number {
        if (row >= 0) return row;
        const lanes = model.grid.lanes();
        if (lanes.length > 0) return lanes[Math.floor(Math.random() * lanes.length)];
        return Math.floor(Math.random() * model.grid.rows);
    }
}
