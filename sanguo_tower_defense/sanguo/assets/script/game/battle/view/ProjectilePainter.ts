import { Graphics } from 'cc';
import { ProjectileKind } from '../../common/table/ITable';
import type { BattleModel } from '../logic/BattleModel';
import { ViewKit } from '../../common/ui/ViewKit';

/**
 * 弹道绘制器（Graphics 程序化，对齐历史 drawArrow）
 *
 * 按配置 visual 绘制：arrow 木杆箭 / knife 短刃 / boomerang 旋镖 / stone 抛石 / orb 光弹。
 * 玩家射手朝右，敌方远程朝左；回旋镖自转。
 */
export class ProjectilePainter {
    static draw(g: Graphics, model: BattleModel, px: (n: number) => number, py: (n: number) => number): void {
        g.clear();
        for (const p of model.projectiles) {
            if (!p.alive) continue;
            let gy = p.row + 0.5;
            if (p.cfg.kind === ProjectileKind.Arc) gy -= Math.sin(Math.PI * Math.min(1, p.progress)) * 0.9;

            const x = px(p.x);
            const y = py(gy);
            const ang = p.hostile === true ? Math.PI : 0;
            const visual = p.cfg.visual ?? (p.cfg.kind === ProjectileKind.Arc ? 'stone' : 'arrow');
            const col = p.cfg.color;

            if (visual === 'stone') this.stone(g, x, y, (p.cfg.width ?? 10) * 0.9, col);
            else if (visual === 'knife') this.knife(g, x, y, ang, col);
            else if (visual === 'boomerang') this.boomerang(g, x, y, model.time * (p.cfg.spin ?? 18), col);
            else if (visual === 'orb') this.orb(g, x, y, (p.cfg.width ?? 6) * 1.2, col);
            else this.arrow(g, x, y, ang, col);
        }
    }

    private static arrow(g: Graphics, x: number, y: number, ang: number, col: string): void {
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const nx = -s;
        const ny = c;
        const L = 20;
        const bx = x - c * L;
        const by = y - s * L;
        const hx = x + c * L;
        const hy = y + s * L;

        g.strokeColor = ViewKit.color('#2A1C0C', 230);
        g.lineWidth = 5;
        g.moveTo(bx, by);
        g.lineTo(hx, hy);
        g.stroke();

        g.strokeColor = ViewKit.color('#E8C98A');
        g.lineWidth = 2.6;
        g.moveTo(bx, by);
        g.lineTo(hx, hy);
        g.stroke();

        g.fillColor = ViewKit.color(col);
        g.moveTo(hx + c * 8, hy + s * 8);
        g.lineTo(hx - nx * 5, hy - ny * 5);
        g.lineTo(hx + nx * 5, hy + ny * 5);
        g.close();
        g.fill();

        g.strokeColor = ViewKit.color(col, 220);
        g.lineWidth = 1.6;
        g.moveTo(bx, by);
        g.lineTo(bx - c * 7 + nx * 4, by - s * 7 + ny * 4);
        g.moveTo(bx, by);
        g.lineTo(bx - c * 7 - nx * 4, by - s * 7 - ny * 4);
        g.stroke();
    }

    private static knife(g: Graphics, x: number, y: number, ang: number, col: string): void {
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const nx = -s;
        const ny = c;
        // 刀身
        g.fillColor = ViewKit.color(col);
        g.moveTo(x + c * 16, y + s * 16);
        g.lineTo(x - c * 4 + nx * 5, y - s * 4 + ny * 5);
        g.lineTo(x - c * 10, y - s * 10);
        g.lineTo(x - c * 4 - nx * 5, y - s * 4 - ny * 5);
        g.close();
        g.fill();
        // 刀柄
        g.strokeColor = ViewKit.color('#3A2410');
        g.lineWidth = 3;
        g.moveTo(x - c * 10, y - s * 10);
        g.lineTo(x - c * 16, y - s * 16);
        g.stroke();
    }

    private static boomerang(g: Graphics, x: number, y: number, ang: number, col: string): void {
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const nx = -s;
        const ny = c;
        const r = 16;
        g.strokeColor = ViewKit.color(col);
        g.lineWidth = 5;
        g.moveTo(x - c * r + nx * r, y - s * r + ny * r);
        g.lineTo(x, y);
        g.lineTo(x - c * r - nx * r, y - s * r - ny * r);
        g.stroke();
        g.strokeColor = ViewKit.color('#FFFFFF', 140);
        g.lineWidth = 1.6;
        g.moveTo(x - c * r + nx * r, y - s * r + ny * r);
        g.lineTo(x, y);
        g.stroke();
    }

    private static stone(g: Graphics, x: number, y: number, r: number, col: string): void {
        g.fillColor = ViewKit.color(col);
        g.circle(x, y, r);
        g.fill();
        g.strokeColor = ViewKit.color('#3A2E1E', 160);
        g.lineWidth = 1.4;
        g.circle(x, y, r);
        g.stroke();
        g.fillColor = ViewKit.color('#000000', 40);
        g.circle(x + r * 0.25, y - r * 0.2, r * 0.28);
        g.fill();
        g.circle(x - r * 0.3, y + r * 0.25, r * 0.2);
        g.fill();
    }

    private static orb(g: Graphics, x: number, y: number, r: number, col: string): void {
        g.fillColor = ViewKit.color(col, 70);
        g.circle(x, y, r * 1.8);
        g.fill();
        g.fillColor = ViewKit.color(col);
        g.circle(x, y, r);
        g.fill();
        g.fillColor = ViewKit.color('#FFFFFF', 200);
        g.circle(x, y, r * 0.4);
        g.fill();
    }
}
