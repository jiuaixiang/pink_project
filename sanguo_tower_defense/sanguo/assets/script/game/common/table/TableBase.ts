import { JsonUtil } from 'db://oops-framework/core/utils/JsonUtil';

/**
 * 配置表基类
 *
 * 说明：
 * 1、JsonUtil 在 InitialViewComp 阶段以目录方式整体加载，这里只做惰性解析
 * 2、配置缺失时只告警一次，不抛异常，保证无配置表时游戏仍可进入并提示
 */
export abstract class TableBase<T extends { id: string }> {
    protected abstract readonly tableName: string;

    private map: Map<string, T> = new Map();
    private loaded = false;
    private warned = false;

    /** 惰性加载配置表 */
    protected ensure(): void {
        if (this.loaded) return;
        this.loaded = true;

        const raw = JsonUtil.get(this.tableName);
        if (!Array.isArray(raw)) {
            this.warnMissing();
            return;
        }

        for (const item of raw as T[]) {
            if (item == null || typeof item.id !== 'string' || item.id === '') {
                console.warn(`[三国塔防] 配置表 ${this.tableName} 存在缺少 id 的条目，已跳过`);
                continue;
            }
            this.map.set(item.id, item);
        }
    }

    private warnMissing() {
        if (this.warned) return;
        this.warned = true;
        console.warn(`[三国塔防] 配置表 ${this.tableName} 未加载或格式错误（应为 JSON 数组），请检查 assets/bundle/config/game/${this.tableName}.json`);
    }

    /** 按 id 取配置 */
    get(id: string): T | null {
        this.ensure();
        const item = this.map.get(id);
        return item == null ? null : item;
    }

    /** 取配置，缺失时返回兜底对象（避免链式取值崩溃） */
    getOr(id: string, fallback: T): T {
        return this.get(id) ?? fallback;
    }

    /** 是否存在 */
    has(id: string): boolean {
        this.ensure();
        return this.map.has(id);
    }

    /** 全部配置 */
    all(): T[] {
        this.ensure();
        return Array.from(this.map.values());
    }

    /** 全部 id */
    ids(): string[] {
        this.ensure();
        return Array.from(this.map.keys());
    }

    /** 清空缓存（热重载配置时使用） */
    clear(): void {
        this.map.clear();
        this.loaded = false;
    }
}
