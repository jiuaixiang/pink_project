import { JsonUtil } from 'db://oops-framework/core/utils/JsonUtil';
import type { IGameplayConfig } from './ITable';

/** 全局玩法配置（单对象表，非数组） */
class TableGameplayImpl {
    private readonly defaults: IGameplayConfig = {
        rows: 5,
        cols: 9,
        cellWidth: 96,
        cellHeight: 84,
        leftWallWidth: 110,
        topBarHeight: 96,
        bottomBarHeight: 96,
        mowerOffset: -0.7,
        spawnX: 9.4,
        dangerX: -0.05,
    };

    private cache: IGameplayConfig | null = null;

    /** 取玩法配置，缺失字段用默认值兜底 */
    get(): IGameplayConfig {
        if (this.cache != null) return this.cache;

        const raw = JsonUtil.get('gameplay');
        if (raw == null) {
            console.warn('[三国塔防] 玩法配置 gameplay.json 未加载，使用内置默认值');
            this.cache = { ...this.defaults };
            return this.cache;
        }

        const cfg: IGameplayConfig = { ...this.defaults };
        for (const key of Object.keys(this.defaults) as (keyof IGameplayConfig)[]) {
            const value = (raw as Record<string, unknown>)[key];
            if (typeof value === 'number' && Number.isFinite(value)) {
                cfg[key] = value;
            }
        }
        if (cfg.rows <= 0 || cfg.cols <= 0) {
            console.warn('[三国塔防] 玩法配置行列数非法，已回退默认值');
            cfg.rows = this.defaults.rows;
            cfg.cols = this.defaults.cols;
        }
        this.cache = cfg;
        return cfg;
    }

    clear(): void {
        this.cache = null;
    }
}

export const TableGameplay = new TableGameplayImpl();
