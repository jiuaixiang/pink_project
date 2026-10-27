import type { IBondConfig } from './ITable';
import { TableBase } from './TableBase';

/** 羁缘表：满足成员组合即生效 */
class TableBondsImpl extends TableBase<IBondConfig> {
    protected readonly tableName: string = 'bonds';

    /** 依据场上已部署的武将 id 计算生效的羁缘 */
    getActive(deployedIds: string[]): IBondConfig[] {
        const result: IBondConfig[] = [];
        const set = new Set(deployedIds);
        for (const bond of this.all()) {
            if (bond.members.length === 0) continue;
            if (bond.members.every((id) => set.has(id))) result.push(bond);
        }
        return result;
    }
}

export const TableBonds = new TableBondsImpl();
