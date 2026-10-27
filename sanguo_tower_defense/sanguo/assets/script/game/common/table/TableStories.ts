import type { IStoryConfig } from './ITable';
import { TableBase } from './TableBase';

/** 剧情表 */
class TableStoriesImpl extends TableBase<IStoryConfig> {
    protected readonly tableName: string = 'stories';

    /** 取指定剧情段 */
    story(id: string): IStoryConfig | null {
        return this.get(id);
    }
}

export const TableStories = new TableStoriesImpl();
