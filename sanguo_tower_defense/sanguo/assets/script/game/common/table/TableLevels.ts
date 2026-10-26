import type { ILevelConfig } from './ITable';
import { TableBase } from './TableBase';

/** 关卡配置表 */
class TableLevelsImpl extends TableBase<ILevelConfig> {
    protected readonly tableName = 'levels';

    private sorted: ILevelConfig[] | null = null;

    /** 全部关卡（按 id 升序） */
    getSorted(): ILevelConfig[] {
        if (this.sorted == null) {
            this.sorted = this.all().slice().sort((a, b) => a.id - b.id);
        }
        return this.sorted;
    }

    /** 关卡总数 */
    get count(): number {
        return this.getSorted().length;
    }

    /** 首关 */
    getFirst(): ILevelConfig | null {
        const list = this.getSorted();
        return list.length > 0 ? list[0] : null;
    }

    /** 取指定关卡的前一关 */
    getPrev(id: number): ILevelConfig | null {
        const list = this.getSorted();
        for (let i = 0; i < list.length; i++) {
            if (list[i].id === id) return i > 0 ? list[i - 1] : null;
        }
        return null;
    }

    /** 取指定关卡的后一关 */
    getNext(id: number): ILevelConfig | null {
        const list = this.getSorted();
        for (let i = 0; i < list.length; i++) {
            if (list[i].id === id) return i < list.length - 1 ? list[i + 1] : null;
        }
        return null;
    }

    clear(): void {
        super.clear();
        this.sorted = null;
    }
}

export const TableLevels = new TableLevelsImpl();
