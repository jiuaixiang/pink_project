import type { IWaveConfig } from './ITable';
import { TableBase } from './TableBase';

/** 波次配置表 */
class TableWavesImpl extends TableBase<IWaveConfig> {
    protected readonly tableName = 'waves';

    /** 按关卡配置中的顺序取出波次，并过滤缺失项 */
    getByLevel(waveIds: string[]): IWaveConfig[] {
        const list: IWaveConfig[] = [];
        for (const id of waveIds) {
            const wave = this.get(id);
            if (wave == null) {
                console.warn(`[三国塔防] 关卡引用了不存在的波次：${id}`);
                continue;
            }
            list.push(wave);
        }
        // 按时间升序，配置书写顺序不影响实际出兵
        list.sort((a, b) => a.at - b.at);
        return list;
    }

    /** 波次总兵力（用于进度条与结算展示） */
    countEnemies(wave: IWaveConfig): number {
        let total = 0;
        for (const group of wave.groups) {
            total += Math.max(0, group.count);
        }
        return total;
    }
}

export const TableWaves = new TableWavesImpl();
