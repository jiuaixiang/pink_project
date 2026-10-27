import type { IEquipConfig } from './ITable';
import { EquipSlot } from './ITable';
import { TableBase } from './TableBase';

/** 装备表 */
class TableEquipsImpl extends TableBase<IEquipConfig> {
    protected readonly tableName: string = 'equips';

    /** 按槽位筛选 */
    bySlot(slot: EquipSlot): IEquipConfig[] {
        return this.all()
            .filter((cfg) => cfg.slot === slot)
            .sort((a, b) => a.tier - b.tier);
    }
}

export const TableEquips = new TableEquipsImpl();
