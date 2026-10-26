import type { IEnemyConfig } from './ITable';
import { TableBase } from './TableBase';

/** 敌军配置表 */
class TableEnemiesImpl extends TableBase<IEnemyConfig> {
    protected readonly tableName = 'enemies';
}

export const TableEnemies = new TableEnemiesImpl();
