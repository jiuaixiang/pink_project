import { Graphics, Node, UITransform } from 'cc';
import { ViewKit } from '../../common/ui/ViewKit';
import type { ILevelTerrain } from '../../common/table/ITable';

const CELL_W = 96;
const CELL_H = 84;
const BOARD_W = CELL_W * 9;
const BOARD_H = CELL_H * 5;

/**
 * 地形绘制器（Graphics 程序化）
 *
 * 在封死行（高山 / 河流）上绘制手绘级纹样：雪顶三角山、波浪河流。
 * 挂在与演员同一坐标空间的层上（siblingIndex=0 置于底部），不遮挡可部署格。
 */
export class TerrainPainter {
    static paint(layer: Node | null, terrain: ILevelTerrain | undefined, cols: number): void {
        if (layer == null || !layer.isValid) return;

        let child = layer.getChildByName('terrain_art');
        if (child == null) {
            child = new Node('terrain_art');
            child.layer = layer.layer;
            child.parent = layer;
        }
        if (child.getComponent(UITransform) == null) child.addComponent(UITransform);
        let g = child.getComponent(Graphics);
        if (g == null) g = child.addComponent(Graphics);
        child.setPosition(0, 0, 0);
        child.setSiblingIndex(0);

        g.clear();
        const wx = (gx: number): number => -BOARD_W / 2 + gx * CELL_W;
        const wy = (gy: number): number => BOARD_H / 2 - gy * CELL_H;

        for (const row of terrain?.mountain ?? []) this.drawMountain(g, wx, wy, row, cols);
        for (const row of terrain?.river ?? []) this.drawRiver(g, wx, wy, row, cols);
    }

    private static drawMountain(g: Graphics, wx: (g: number) => number, wy: (g: number) => number, row: number, cols: number): void {
        const cy = wy(row + 0.5);
        const top = cy + CELL_H / 2;
        const base = cy - CELL_H / 2;
        for (let c = 0; c < cols; c++) {
            const cx = wx(c + 0.5);
            // 岩基（峰顶正好贴本行上边，不越界压到上一行）
            g.fillColor = ViewKit.color('#736454', 235);
            g.moveTo(cx - CELL_W * 0.48, base);
            g.lineTo(cx, top);
            g.lineTo(cx + CELL_W * 0.48, base);
            g.close();
            g.fill();
            // 雪顶
            g.fillColor = ViewKit.color('#E9E9EC', 230);
            g.moveTo(cx - CELL_W * 0.17, top - CELL_H * 0.14);
            g.lineTo(cx, top);
            g.lineTo(cx + CELL_W * 0.17, top - CELL_H * 0.14);
            g.close();
            g.fill();
        }
    }

    private static drawRiver(g: Graphics, wx: (g: number) => number, wy: (g: number) => number, row: number, cols: number): void {
        const cy = wy(row + 0.5);
        const top = cy + CELL_H / 2;
        const base = cy - CELL_H / 2;
        g.fillColor = ViewKit.color('#1E3A4A', 235);
        g.rect(wx(0), base, CELL_W * cols, CELL_H);
        g.fill();

        // 波纹
        g.strokeColor = ViewKit.color('#5C93AE', 220);
        g.lineWidth = 1.6;
        for (let k = 0; k < 3; k++) {
            const y = top - (k + 1) * (CELL_H / 4);
            for (let c = 0; c < cols; c++) {
                const x0 = wx(c);
                g.moveTo(x0 + 6, y);
                g.bezierCurveTo(x0 + CELL_W * 0.28, y + 3, x0 + CELL_W * 0.6, y - 3, x0 + CELL_W - 6, y);
            }
        }
        g.stroke();
    }
}
