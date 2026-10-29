/**
 * 战场网格
 *
 * 坐标约定：
 * 1、行 0 在最上方，列 0 在最左侧（靠近城墙）
 * 2、横向单位"格"，0 为第 0 列左边界，cols 为战场右边界
 * 3、纵向以"行"为单位，row + 0.5 为行中心
 */
export class GridMap {
    readonly rows: number;
    readonly cols: number;
    /** 占用表，索引 = row * cols + col，值为单位 uid，0 表示空 */
    private cells: number[];
    /** 不可部署格（高山 / 激流 / 墓碑） */
    private blocked: boolean[];

    constructor(rows: number, cols: number) {
        this.rows = rows;
        this.cols = cols;
        this.cells = new Array(rows * cols).fill(0);
        this.blocked = new Array(rows * cols).fill(false);
    }

    /** 标记不可部署格 */
    block(row: number, col: number): void {
        if (!this.isInside(row, col)) return;
        this.blocked[row * this.cols + col] = true;
    }

    isBlocked(row: number, col: number): boolean {
        if (!this.isInside(row, col)) return true;
        return this.blocked[row * this.cols + col];
    }

    isInside(row: number, col: number): boolean {
        return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
    }

    isFree(row: number, col: number): boolean {
        if (!this.isInside(row, col)) return false;
        return this.cells[row * this.cols + col] === 0;
    }

    occupy(row: number, col: number, uid: number): void {
        if (!this.isInside(row, col)) return;
        this.cells[row * this.cols + col] = uid;
    }

    release(row: number, col: number): void {
        if (!this.isInside(row, col)) return;
        this.cells[row * this.cols + col] = 0;
    }

    getUid(row: number, col: number): number {
        if (!this.isInside(row, col)) return 0;
        return this.cells[row * this.cols + col];
    }

    /** 横向坐标落在哪一列 */
    colAt(x: number): number {
        return Math.floor(x);
    }

    /** 列中心横坐标 */
    colCenter(col: number): number {
        return col + 0.5;
    }

    /** 清空占用表（不改动不可部署格） */
    clear(): void {
        this.cells.fill(0);
    }

    /**
     * 敌军可通行的行（走廊）。
     * 仅当该行左端（城门列）与右端（出生列）都未被地形封堵时才算通行走廊，
     * 这样高山 / 激流整行封死的行不会成为敌军出生点（避免「从其它道路进攻」）。
     */
    lanes(): number[] {
        const result: number[] = [];
        for (let row = 0; row < this.rows; row++) {
            if (!this.isBlocked(row, 0) && !this.isBlocked(row, this.cols - 1)) {
                result.push(row);
            }
        }
        return result;
    }
}
