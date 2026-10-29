import { Graphics, Node, UITransform } from 'cc';
import { ViewKit } from '../../common/ui/ViewKit';

/** 单位状态（用于整卡表现） */
export interface IUnitStatus {
    slow?: boolean;
    poison?: boolean;
    stun?: boolean;
    dual?: boolean;
}

/**
 * 单位卡片绘制器（Graphics 程序化）
 *
 * 在既有「阵营色块 + 单字」之上叠一层：底部暗影（伪渐变）、斜向高光、外描边，
 * 以及整卡状态表现（霜冻蓝罩、中毒绿雾、眩晕黄环）。
 * 使用签名缓存，状态不变时不重绘，避免每帧重复 Graphics 开销。
 * 有 `portrait` 字段时由调用方走图片覆盖，这里只负责程序化剪影。
 */
export class UnitCardPainter {
    private static getG(node: Node): Graphics | null {
        let child = node.getChildByName('card_art');
        if (child == null) {
            child = new Node('card_art');
            child.layer = node.layer;
            child.parent = node;
        }
        if (child.getComponent(UITransform) == null) child.addComponent(UITransform);
        let g = child.getComponent(Graphics);
        if (g == null) g = child.addComponent(Graphics);
        child.setPosition(0, 0, 0);
        return g;
    }

    static paint(node: Node, color: string, size: number, status: IUnitStatus): void {
        if (node == null || !node.isValid) return;
        const sig = `${color}|${status.slow ? 1 : 0}${status.poison ? 1 : 0}${status.stun ? 1 : 0}${status.dual ? 1 : 0}`;
        const holder = node as unknown as { __cardSig?: string };
        if (holder.__cardSig === sig) return;
        holder.__cardSig = sig;

        const g = this.getG(node);
        if (g == null) return;
        g.clear();

        const w = Math.max(24, size);
        const h = w * 1.16;

        // 底部暗影带（伪渐变）
        g.fillColor = ViewKit.color('#000000', 46);
        g.roundRect(-w / 2, -h / 2, w, h * 0.42, 6);
        g.fill();

        // 斜向高光
        g.fillColor = ViewKit.color('#ffffff', 22);
        g.moveTo(-w / 2, h / 2);
        g.lineTo(w / 2, -h / 2);
        g.lineTo(w / 2, h / 2);
        g.close();
        g.fill();

        // 外描边
        g.strokeColor = ViewKit.color('#140a04', 160);
        g.lineWidth = 2;
        g.roundRect(-w / 2, -h / 2, w, h, 7);
        g.stroke();

        // 状态：霜冻
        if (status.slow) {
            g.fillColor = ViewKit.color('#BCEAFF', 60);
            g.roundRect(-w / 2, -h / 2, w, h, 7);
            g.fill();
            g.strokeColor = ViewKit.color('#E4F7FF', 200);
            g.lineWidth = 1.6;
            g.roundRect(-w / 2, -h / 2, w, h, 7);
            g.stroke();
        }

        // 状态：中毒
        if (status.poison) {
            g.fillColor = ViewKit.color('#8AC04A', 52);
            g.roundRect(-w / 2, -h / 2, w, h, 7);
            g.fill();
        }

        // 状态：眩晕（头顶黄环）
        if (status.stun) {
            g.strokeColor = ViewKit.color('#FFD870', 220);
            g.lineWidth = 2;
            g.circle(0, h / 2 + 6, w * 0.16);
            g.stroke();
        }

        // 状态：双脉冲（攻速增益）
        if (status.dual) {
            g.strokeColor = ViewKit.color('#FFE9A8', 200);
            g.lineWidth = 1.6;
            g.circle(0, 0, w * 0.6);
            g.stroke();
        }
    }
}
