import type { IProjectileConfig } from './ITable';
import { TableBase } from './TableBase';

/** 弹道配置表 */
class TableProjectilesImpl extends TableBase<IProjectileConfig> {
    protected readonly tableName = 'projectiles';
}

export const TableProjectiles = new TableProjectilesImpl();
