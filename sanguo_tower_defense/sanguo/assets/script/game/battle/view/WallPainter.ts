import { Graphics, Node, UITransform } from 'cc';
import { ViewKit } from '../../common/ui/ViewKit';

const WALL_W = 104;
const WALL_H = 420;

/**
 * 城墙 / 滚木绘制器（Graphics 程序化，对齐历史 drawCityWall / drawLog）
 *
 * 城墙：石砌灰缝 + 垛口 + 中央城门 + 门板 + 随损伤蔓延的裂纹。
 * 滚木：竖立圆木柱身 + 铁箍 + 顶部年轮，挂在每行 mower 节点上。
 * 均按签名/一次性缓存，避免每帧重复绘制。
 */
export class WallPainter {
    private static layerOf(node: Node, name: string): Graphics | null {
        let child = node.getChildByName(name);
        if (child == null) {
            child = new Node(name);
            child.layer = node.layer;
            child.parent = node;
        }
        if (child.getComponent(UITransform) == null) child.addComponent(UITransform);
        let g = child.getComponent(Graphics);
        if (g == null) g = child.addComponent(Graphics);
        child.setPosition(0, 0, 0);
        return g;
    }

    /** 绘制城墙。dmg: 0=完好，1=告破 */
    static paintWall(wall: Node | null, dmg: number): void {
        if (wall == null || !wall.isValid) return;
        const bucket = Math.max(0, Math.min(5, Math.floor(dmg * 5 + 0.5)));
        const holder = wall as unknown as { __wallBucket?: number };
        if (holder.__wallBucket === bucket) return;
        holder.__wallBucket = bucket;

        const g = this.layerOf(wall, 'wall_art');
        if (g == null) return;
        g.clear();

        const hw = WALL_W / 2;
        const hh = WALL_H / 2;
        const broken = dmg > 0.65;

        // ① 墙身底色（左暗右亮的近似渐变）
        g.fillColor = ViewKit.color(broken ? '#2c1c0e' : '#46301a');
        g.rect(-hw, -hh, WALL_W, WALL_H);
        g.fill();
        g.fillColor = ViewKit.color(broken ? '#553b19' : '#8a6029', 150);
        g.rect(hw * 0.1, -hh, hw * 0.9, WALL_H);
        g.fill();

        // ② 石砌灰缝：横缝 + 错缝竖缝
        g.strokeColor = ViewKit.color('#180c03', 140);
        g.lineWidth = 1;
        for (let y = -hh; y < hh; y += 16) {
            g.moveTo(-hw, y);
            g.lineTo(hw * 0.36, y);
        }
        g.stroke();
        for (let i = 0; ; i++) {
            const y = -hh + i * 16;
            if (y >= hh) break;
            const off = i % 2 === 0 ? 9 : 0;
            for (let x = -hw + off; x < hw * 0.36; x += 18) {
                g.moveTo(x, y);
                g.lineTo(x, y + 16);
            }
        }
        g.stroke();

        // ③ 垛口（迎敌面右缘）
        for (let y = -hh; y < hh; y += 18) {
            g.fillColor = ViewKit.color(broken ? '#5e4420' : '#9c7038');
            g.rect(hw * 0.42, y, 14, 12);
            g.fill();
            g.fillColor = ViewKit.color('#000000', 80);
            g.rect(hw * 0.42, y + 12, 14, 6);
            g.fill();
            g.fillColor = ViewKit.color('#FFE0AA', 70);
            g.rect(hw * 0.42, y, 1.6, 12);
            g.fill();
        }

        // ④ 中央城门
        const gateH = 168;
        const gy0 = -gateH / 2;
        g.fillColor = ViewKit.color('#160c04');
        g.rect(-hw, gy0 - 7, WALL_W, gateH + 14);
        g.fill();
        g.fillColor = ViewKit.color(dmg > 0.55 ? '#6a3f1a' : '#8a5624');
        g.rect(-hw, gy0, WALL_W, gateH);
        g.fill();
        g.strokeColor = ViewKit.color('#160a03', 170);
        g.lineWidth = 1.2;
        for (let i = 1; i < 6; i++) {
            if (i === 3) continue;
            const y = gy0 + (i * gateH) / 6;
            g.moveTo(-hw, y);
            g.lineTo(hw, y);
        }
        g.stroke();
        // 中央门缝（两扇对开）
        g.strokeColor = ViewKit.color('#140902', 190);
        g.lineWidth = 2;
        g.moveTo(-hw, gy0 + gateH / 2);
        g.lineTo(hw, gy0 + gateH / 2);
        g.stroke();
        // 门楼上下石砌
        g.fillColor = ViewKit.color(broken ? '#5e4420' : '#9c7038');
        g.rect(-hw, gy0 - 7, WALL_W, 7);
        g.fill();
        g.rect(-hw, gy0 + gateH, WALL_W, 7);
        g.fill();

        // ⑤ 墙体裂纹（随损伤蔓延）
        const cracks = Math.floor(dmg * 6);
        if (cracks > 0) {
            g.strokeColor = ViewKit.color('#070301', 210);
            g.lineWidth = 1.6;
            for (let i = 0; i < cracks; i++) {
                let cx = hw * 0.3;
                let cy = -hh + 20 + ((i * 53) % (WALL_H - 40));
                g.moveTo(cx, cy);
                for (let k = 0; k < 4; k++) {
                    cx -= 6;
                    cy += (((i * 7 + k * 3) % 11) - 5) * 2.4;
                    g.lineTo(cx, cy);
                }
            }
            g.stroke();
        }
    }

    /** 绘制一根滚木 */
    static paintLog(node: Node | null): void {
        if (node == null || !node.isValid) return;
        const holder = node as unknown as { __logPainted?: boolean };
        if (holder.__logPainted) return;
        holder.__logPainted = true;

        const g = this.layerOf(node, 'log_art');
        if (g == null) return;
        g.clear();

        const hw = 24;
        const hl = 32;

        // 柱身
        g.fillColor = ViewKit.color('#8a5c30');
        g.roundRect(-hw, -hl, hw * 2, hl * 2, hw);
        g.fill();
        // 圆柱侧光（左亮右暗）
        g.fillColor = ViewKit.color('#FFE2AA', 55);
        g.rect(-hw, -hl, hw, hl * 2);
        g.fill();
        g.fillColor = ViewKit.color('#28140A', 70);
        g.rect(0, -hl, hw, hl * 2);
        g.fill();
        // 竖纹
        g.strokeColor = ViewKit.color('#46280E', 120);
        g.lineWidth = 1.2;
        for (const ox of [-6, 0, 6]) {
            g.moveTo(ox, -hl + 4);
            g.lineTo(ox, hl - 4);
        }
        g.stroke();
        // 两道铁箍
        g.fillColor = ViewKit.color('#6A6A72');
        g.rect(-hw, -hl + 13, hw * 2, 3);
        g.fill();
        g.rect(-hw, -hl + 25, hw * 2, 3);
        g.fill();
        g.fillColor = ViewKit.color('#FFFFFF', 55);
        g.rect(-hw, -hl + 13, hw * 2, 1);
        g.fill();
        g.rect(-hw, -hl + 25, hw * 2, 1);
        g.fill();
        // 顶部年轮
        g.fillColor = ViewKit.color('#A8743C');
        g.ellipse(0, -hl, hw, 9);
        g.fill();
        g.strokeColor = ViewKit.color('#46280E', 150);
        g.lineWidth = 1;
        g.ellipse(0, -hl, hw * 0.45, 4);
        g.stroke();
        g.ellipse(0, -hl, hw * 0.72, 6.5);
        g.stroke();
    }
}
