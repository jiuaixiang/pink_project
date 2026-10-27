/**
 * 选将（出战阵容）状态
 *
 * 关卡选择 → 选将 → 战斗：本局卡组取这里的记录；
 * 重开 / 暂停重开沿用同一套阵容，回到关卡选择后可重新选将。
 */
export class DraftModel {
    private static pendingLevel = 0;
    private static levelId = 0;
    private static units: string[] = [];

    /** 打开选将界面前记录目标关卡 */
    static setPending(levelId: number): void {
        this.pendingLevel = levelId;
    }

    /** 选将界面读取目标关卡 */
    static getPending(): number {
        return this.pendingLevel;
    }

    /** 记录本局阵容 */
    static setDeck(levelId: number, units: string[]): void {
        this.levelId = levelId;
        this.units = units.slice();
    }

    /** 取本局阵容（无记录返回 null，由关卡默认卡组兜底） */
    static getDeck(levelId: number): string[] | null {
        if (this.levelId !== levelId || this.units.length === 0) return null;
        return this.units.slice();
    }
}
