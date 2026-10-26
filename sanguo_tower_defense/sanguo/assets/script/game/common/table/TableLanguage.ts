
import { JsonUtil } from 'db://oops-framework/core/utils/JsonUtil';

export class TableLanguage {
    private static TableName = 'Language';

    static get(id: string): ITableLanguage {
        const table = JsonUtil.get(TableLanguage.TableName);
        return table[id] as ITableLanguage;
    }
}

export interface ITableLanguage {
    /** 简体中文 */
    zh: string;
    /** 英文 */
    en: string;
}
