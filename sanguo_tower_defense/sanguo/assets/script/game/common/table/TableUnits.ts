import type { IUnitConfig } from './ITable';
import { TableBase } from './TableBase';

/** 武将 / 器械配置表 */
class TableUnitsImpl extends TableBase<IUnitConfig> {
    protected readonly tableName = 'units';
}

export const TableUnits = new TableUnitsImpl();
