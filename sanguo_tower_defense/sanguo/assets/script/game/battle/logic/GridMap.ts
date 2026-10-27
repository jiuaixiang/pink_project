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

    constructor(rows: number, cols: number) {
        this.rows = rows;
        this.cols = cols;
        this.cells = new Array(rows * cols).fill(0);
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

    /** 清空占用表 */
    clear(): void {
        this.cells.fill(0);
    }
}
