import { JsonUtil } from 'db://oops-framework/core/utils/JsonUtil';

/** 进度与解锁配置（enemyUnlock / debut / poolIds / endlessUnlocks） */
interface IProgressionData {
    enemyUnlock: Record<string, string[]>;
    debut: Record<string, number>;
    poolIds: string[];
    endlessUnlocks: Record<string, string>;
}

class TableProgressionImpl {
    private cache: IProgressionData | null = null;

    private load(): IProgressionData {
        if (this.cache != null) return this.cache;

        const raw = JsonUtil.get('progression') as IProgressionData | null;
        this.cache = {
            enemyUnlock: raw?.enemyUnlock ?? {},
            debut: raw?.debut ?? {},
            poolIds: raw?.poolIds ?? [],
            endlessUnlocks: raw?.endlessUnlocks ?? {},
        };
        return this.cache;
    }

    /** 某关首次出现的敌兵 */
    unlockedAt(levelId: number): string[] {
        return this.load().enemyUnlock[String(levelId)] ?? [];
    }

    /** 敌兵首次登场的关卡（0 表示未配置） */
    debutLevel(enemyId: string): number {
        return this.load().debut[enemyId] ?? 0;
    }

    /** 过关模式 15 名武将的解锁顺序 */
    poolIds(): string[] {
        return this.load().poolIds.slice();
    }

    /** 无尽模式波数里程碑解锁的武将 */
    endlessUnlocks(): Record<string, string> {
        return { ...this.load().endlessUnlocks };
    }

    /** 无尽模式：到达该波数解锁的武将 */
    endlessUnlockAt(wave: number): string | null {
        return this.load().endlessUnlocks[String(wave)] ?? null;
    }

    clear(): void {
        this.cache = null;
    }
}

export const TableProgression = new TableProgressionImpl();
