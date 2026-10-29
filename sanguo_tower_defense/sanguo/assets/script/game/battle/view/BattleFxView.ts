import { _decorator, Color, Component, Graphics, Node, Prefab, Sprite, UIOpacity, UITransform, Vec3, instantiate, tween } from 'cc';
import type { BattleModel } from '../logic/BattleModel';
import type { IBattleFx } from '../logic/Actor';
import { ViewKit } from '../../common/ui/ViewKit';

const { ccclass } = _decorator;

/** 与 BattleViewComp 一致的格子尺寸（世界像素） */
const CELL_W = 96;
const CELL_H = 84;
const BOARD_W = CELL_W * 9;
const BOARD_H = CELL_H * 5;

/** 预制体原生尺寸：actor_bullet 圆点 12px、fx_burst 环 100px（半径 50） */
const DOT_PX = 12;
const RING_RADIUS_PX = 50;

/** 走 Graphics 矢量层逐帧绘制的特效（其余走预制体 + 缓动） */
const VECTOR_KINDS = ['sweep', 'wave', 'cast', 'trail', 'bowdraw', 'graincart', 'bagua', 'shout', 'slash', 'arc'];

/**
 * 战斗特效层（预制体 + 缓动 + Graphics 矢量绘制，对应原 三国武将志.html 的 canvas 特效）。
 *
 * 逻辑层把特效事件推入 model.battleFx（生成队列）；本组件每帧 drain 队列：
 * - 粒子 / 爆发 / 光环类（impact/muzzle/shard/burst/castaura/shockwave/line/fire/die）实例化预制体并 tween；
 * - 几何 / 轨迹类（sweep/wave/cast/bowdraw/graincart/bagua/shout/slash/trail）进入 active 列表，
 *   由一张 Graphics 逐帧重绘并随寿命淡出。坐标换算与 BattleViewComp.px/py 完全一致。
 *
 * 注意：所有补间统一使用 scale: Vec3 / position: Vec3 / opacity 写法，
 * 切勿使用 scaleX/scaleY/x/y 这类独立属性补间，否则会触发 TweenAction 的 null keys 崩溃。
 */
@ccclass('BattleFxView')
export class BattleFxView extends Component {
    private prefabs: Partial<Record<string, Prefab>> = {};
    private layer: Node | null = null;

    /** 矢量层（单张 Graphics，逐帧重绘） */
    private g: Graphics | null = null;
    /** 正在播放的矢量特效 */
    private active: IBattleFx[] = [];

    init(prefabs: Partial<Record<string, Prefab>>, layer: Node | null): void {
        this.prefabs = prefabs;
        this.layer = layer;
        this.ensureGraphics();
    }

    /** 每帧消费逻辑层生成的特效事件（生成队列，消费即清空） */
    sync(model: BattleModel, dt = 0): void {
        const list = model.battleFx;
        if (list.length > 0) {
            for (const fx of list) {
                if (VECTOR_KINDS.indexOf(fx.kind) >= 0) this.active.push(fx);
                else this.spawn(fx);
            }
            list.length = 0;
        }

        if (dt > 0 && this.active.length > 0) {
            for (const fx of this.active) fx.life -= dt;
            this.active = this.active.filter((fx) => fx.life > 0);
        }

        this.ensureGraphics();
        if (this.active.length > 0) this.draw();
        else if (this.g != null) this.g.clear();
    }

    //#region 坐标换算
    private WX(gx: number): number {
        return -BOARD_W / 2 + gx * CELL_W;
    }

    private WY(gy: number): number {
        return BOARD_H / 2 - gy * CELL_H;
    }
    //#endregion

    //#region 矢量层
    private ensureGraphics(): void {
        if (this.layer == null) return;
        if (this.g != null && this.g.node.isValid) return;
        const node = new Node('fx_vector');
        node.layer = this.layer.layer;
        node.parent = this.layer;
        node.setPosition(0, 0, 0);
        const ui = node.addComponent(UITransform);
        ui.setContentSize(BOARD_W, BOARD_H);
        node.addComponent(Graphics);
        this.g = node.getComponent(Graphics);
    }

    private col(hex: string, p: number): Color {
        return ViewKit.color(hex, Math.max(0, Math.min(255, Math.floor(255 * p))));
    }

    private draw(): void {
        const g = this.g;
        if (g == null || !g.node.isValid) return;
        // 保持矢量层在所有演员之上
        const parent = g.node.parent;
        if (parent != null) g.node.setSiblingIndex(parent.children.length - 1);

        g.clear();
        for (const fx of this.active) {
            const p = Math.max(0, Math.min(1, fx.life / Math.max(0.001, fx.max)));
            const cx = this.WX(fx.x);
            const cy = this.WY(fx.y);
            switch (fx.kind) {
                case 'slash':
                case 'sweep':
                    this.drawArc(g, cx, cy, (fx.r ?? 1.2) * CELL_W, fx.span ?? Math.PI, fx.ang ?? 0, fx.color, p);
                    break;
                case 'wave':
                case 'cast':
                case 'trail':
                    this.drawLine(g, cx, cy, this.WX(fx.x2 ?? fx.x), this.WY(fx.y2 ?? fx.y), fx.color, p, fx.kind === 'cast');
                    break;
                case 'bowdraw':
                    this.drawBow(g, cx, cy, fx.ang ?? 0, fx.color, p);
                    break;
                case 'graincart':
                    this.drawCart(g, cx, cy, this.WX(fx.x2 ?? fx.x), this.WY(fx.y2 ?? fx.y), fx.color, p);
                    break;
                case 'bagua':
                    this.drawBagua(g, cx, cy, (fx.r ?? 1.5) * CELL_W, fx.color, p, fx.max - fx.life);
                    break;
                case 'shout':
                    this.drawShout(g, cx, cy, (fx.r ?? 1.4) * CELL_W, fx.color, p);
                    break;
                default:
                    break;
            }
        }
    }

    /** 刀光 / 挥击弧 */
    private drawArc(g: Graphics, cx: number, cy: number, r: number, span: number, ang: number, hex: string, p: number): void {
        if (r < 1) return;
        const half = Math.max(0.15, span / 2);
        g.strokeColor = this.col(hex, p);
        g.lineWidth = 3 + 10 * p;
        g.arc(cx, cy, r, ang - half, ang + half, false);
        g.stroke();

        g.strokeColor = this.col('#ffffff', p * 0.7);
        g.lineWidth = 1.5 + 3 * p;
        g.arc(cx, cy, r * 0.84, ang - half * 0.8, ang + half * 0.8, false);
        g.stroke();
    }

    /** 直线轨迹（施法 / 气浪 / 拖尾） */
    private drawLine(g: Graphics, x1: number, y1: number, x2: number, y2: number, hex: string, p: number, head: boolean): void {
        g.strokeColor = this.col(hex, p);
        g.lineWidth = 2 + 5 * p;
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();

        if (head) {
            g.fillColor = this.col('#ffffff', p);
            g.circle(x2, y2, 3 + 5 * p);
            g.fill();
        }
    }

    /** 弓手拉弓 */
    private drawBow(g: Graphics, cx: number, cy: number, ang: number, hex: string, p: number): void {
        g.strokeColor = this.col(hex, p);
        g.lineWidth = 2.5;
        g.arc(cx, cy, CELL_W * 0.32, ang - 1.15, ang + 1.15, false);
        g.stroke();

        g.strokeColor = this.col('#ffffff', p * 0.6);
        g.lineWidth = 1;
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(ang) * CELL_W * 0.9, cy + Math.sin(ang) * CELL_W * 0.9);
        g.stroke();
    }

    /** 粮车（自产粮将驶向城门）：本行左行 → 纵向到城门中心 → 穿门入城，入墙淡出 */
    private drawCart(g: Graphics, x1: number, y1: number, x2: number, y2: number, hex: string, p: number): void {
        const t = 1 - p;                       // 0→1 行进进度
        const wp: Array<[number, number]> = [
            [x1, y1],
            [x2, y1],
            [x2, y2],
            [x2 - 14, y2],
        ];
        let total = 0;
        const cum = [0];
        for (let i = 1; i < wp.length; i++) {
            total += Math.hypot(wp[i][0] - wp[i - 1][0], wp[i][1] - wp[i - 1][1]);
            cum.push(total);
        }
        const travelled = t * total;
        let cx = wp[0][0];
        let cy = wp[0][1];
        let dx = -1;
        let dy = 0;
        for (let i = 1; i < wp.length; i++) {
            if (travelled <= cum[i] || i === wp.length - 1) {
                const seg = cum[i] - cum[i - 1];
                const f = seg > 0 ? (travelled - cum[i - 1]) / seg : 0;
                cx = wp[i - 1][0] + (wp[i][0] - wp[i - 1][0]) * f;
                cy = wp[i - 1][1] + (wp[i][1] - wp[i - 1][1]) * f;
                dx = wp[i][0] - wp[i - 1][0];
                dy = wp[i][1] - wp[i - 1][1];
                break;
            }
        }

        // 只在战场内沿右侧绘制（穿门后藏到墙后）
        if (cx < -BOARD_W / 2 - 2) return;
        const fade = Math.max(0, Math.min(1, (1 - t) / 0.22)) * Math.min(1, p * 4);
        if (fade <= 0.01) return;

        // 车斗
        g.fillColor = this.col(hex, 0.85 * fade);
        g.rect(cx - 13, cy - 8, 26, 16);
        g.fill();
        g.fillColor = this.col('#6e4420', 0.9 * fade);
        g.rect(cx - 13, cy + 5, 26, 3);
        g.fill();
        // 粮袋
        g.fillColor = this.col('#e8c24a', fade);
        g.rect(cx - 11, cy + 8, 22, 13);
        g.fill();
        g.fillColor = this.col('#f4d877', fade);
        g.rect(cx - 7, cy + 9, 14, 4);
        g.fill();
        // 车辕（朝行进方向）
        const dl = Math.hypot(dx, dy) || 1;
        g.strokeColor = this.col('#6e4420', fade);
        g.lineWidth = 2.4;
        g.moveTo(cx, cy);
        g.lineTo(cx + (dx / dl) * 18, cy + (dy / dl) * 18);
        g.stroke();
        // 车轮（旋转辐条）
        const spin = t * 9;
        for (const wx of [-9, 9]) {
            const wxx = cx + wx;
            const wyy = cy - 9;
            g.fillColor = this.col('#3a2a18', fade);
            g.circle(wxx, wyy, 5.5);
            g.fill();
            g.fillColor = this.col('#caa24a', fade);
            g.circle(wxx, wyy, 2);
            g.fill();
            g.strokeColor = this.col('#caa24a', fade);
            g.lineWidth = 1.4;
            for (const a of [spin, spin + Math.PI / 2]) {
                g.moveTo(wxx - 4.5 * Math.cos(a), wyy - 4.5 * Math.sin(a));
                g.lineTo(wxx + 4.5 * Math.cos(a), wyy + 4.5 * Math.sin(a));
            }
            g.stroke();
        }
        // 旗
        g.fillColor = this.col('#6e4420', fade);
        g.rect(cx + 6, cy + 18, 1.6, 14);
        g.fill();
        g.fillColor = this.col('#d8483a', fade);
        g.rect(cx + 7.6, cy + 18, 9, 7);
        g.fill();
    }

    /** 八卦阵（外圈 + 内接八边形 + 卦爻） */
    private drawBagua(g: Graphics, cx: number, cy: number, r: number, hex: string, p: number, age: number): void {
        if (r < 1) return;
        const alpha = Math.min(1, p * 1.6);
        g.strokeColor = this.col(hex, alpha);
        g.lineWidth = Math.max(1, r * 0.03);
        g.circle(cx, cy, r);
        g.stroke();

        const rot = -Math.PI / 2 + age * 0.6;
        for (let i = 0; i <= 8; i++) {
            const a = rot + i * (Math.PI / 4);
            const x = cx + Math.cos(a) * r * 0.92;
            const y = cy + Math.sin(a) * r * 0.92;
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
        }
        g.stroke();

        g.lineWidth = Math.max(1, r * 0.05);
        for (let i = 0; i < 8; i++) {
            const a = rot + i * (Math.PI / 4);
            for (let k = 0; k < 3; k++) {
                const rr = r * (0.55 + k * 0.1);
                const x = cx + Math.cos(a) * rr;
                const y = cy + Math.sin(a) * rr;
                const nx = Math.cos(a + Math.PI / 2) * r * 0.09;
                const ny = Math.sin(a + Math.PI / 2) * r * 0.09;
                g.moveTo(x - nx, y - ny);
                g.lineTo(x + nx, y + ny);
            }
        }
        g.stroke();
    }

    /** 全体增益喊声 / 光波 */
    private drawShout(g: Graphics, cx: number, cy: number, r: number, hex: string, p: number): void {
        const k = 1 - p;
        g.strokeColor = this.col(hex, p);
        g.lineWidth = 2 + 5 * p;
        g.circle(cx, cy, r * (0.35 + k * 0.9));
        g.stroke();

        g.strokeColor = this.col('#ffffff', p * 0.6);
        g.lineWidth = 1.5;
        g.circle(cx, cy, r * (0.2 + k * 0.6));
        g.stroke();
    }
    //#endregion

    //#region 预制体实例
    private mkDot(x: number, y: number, color: string): Node | null {
        const prefab = this.prefabs['bullet'];
        if (prefab == null || this.layer == null) return null;
        const node = instantiate(prefab);
        if (!node.isValid) return null;
        node.parent = this.layer;
        node.setPosition(x, y, 0);
        const dot = node.getChildByName('dot');
        if (dot != null) ViewKit.tint(dot.getComponent(Sprite), color);
        return node;
    }

    private mkRing(x: number, y: number, color: string): Node | null {
        const prefab = this.prefabs['burst'];
        if (prefab == null || this.layer == null) return null;
        const node = instantiate(prefab);
        if (!node.isValid) return null;
        node.parent = this.layer;
        node.setPosition(x, y, 0);
        const ring = node.getChildByName('ring');
        if (ring != null) ViewKit.tint(ring.getComponent(Sprite), color);
        return node;
    }
    //#endregion

    //#region 事件分发（预制体特效）
    private spawn(fx: IBattleFx): void {
        const x = this.WX(fx.x);
        const y = this.WY(fx.y);
        switch (fx.kind) {
            case 'impact': this.impact(x, y, fx); break;
            case 'muzzle': this.muzzle(x, y, fx); break;
            case 'shard': this.shard(x, y, fx); break;
            case 'burst': this.ring(x, y, fx.r ?? 1, fx.color, 1); break;
            case 'castaura': this.castaura(x, y, fx); break;
            case 'shockwave': this.shockwave(x, y, fx); break;
            case 'line': this.beam(x, y, fx); break;
            case 'fire': this.ring(x, y, fx.r ?? 1, fx.color, 1.2); break;
            case 'die': this.die(x, y, fx); break;
            default: break;
        }
    }

    /** 命中冲击：环扩散 + 中心亮点 */
    private impact(x: number, y: number, fx: IBattleFx): void {
        const R = (fx.r ?? 0.5) * CELL_W * 1.5;
        const ring = this.mkRing(x, y, fx.color);
        if (ring != null && ring.isValid) {
            const s0 = (R * 0.4) / RING_RADIUS_PX;
            const s1 = R / RING_RADIUS_PX;
            const dur = fx.max || 0.3;
            ring.setScale(s0, s0, 1);
            const ui = ring.getComponent(UIOpacity);
            if (ui != null) ui.opacity = 255;
            tween(ring)
                .to(dur * 0.4, { scale: new Vec3(s1, s1, 1) })
                .to(dur * 0.6, { scale: new Vec3(0, 0, 1) })
                .call(() => { if (ring.isValid) ring.destroy(); })
                .start();
            if (ui != null) tween(ui).to(dur, { opacity: 0 }).start();
        }
        const core = this.mkDot(x, y, '#ffffff');
        if (core != null && core.isValid) {
            const cs = Math.max(0.2, (R * 0.25) / DOT_PX);
            core.setScale(cs, cs, 1);
            const dur = fx.max || 0.3;
            tween(core)
                .to(dur, { scale: new Vec3(0, 0, 1) })
                .call(() => { if (core.isValid) core.destroy(); })
                .start();
        }
    }

    /** 枪口闪光 */
    private muzzle(x: number, y: number, fx: IBattleFx): void {
        const node = this.mkDot(x, y, fx.color);
        if (node == null || !node.isValid) return;
        const dur = fx.max || 0.14;
        node.setScale(0.4, 0.4, 1);
        tween(node)
            .to(dur * 0.4, { scale: new Vec3(1.4, 1.4, 1) })
            .to(dur * 0.6, { scale: new Vec3(0, 0, 1) })
            .call(() => { if (node.isValid) node.destroy(); })
            .start();
    }

    /** 命中飞溅碎片 */
    private shard(x: number, y: number, fx: IBattleFx): void {
        const node = this.mkDot(x, y, fx.color);
        if (node == null || !node.isValid) return;
        const vx = (fx.vx ?? 0) * CELL_W;
        const vy = (fx.vy ?? 0) * CELL_H;
        const dur = fx.max || 0.6;
        const cs = (fx.size ?? 4) / DOT_PX;
        node.setScale(cs, cs, 1);
        tween(node)
            .to(dur, {
                position: new Vec3(x + vx, y + vy, 0),
                scale: new Vec3(0, 0, 1),
                angle: ((fx.rot ?? 0) + (fx.vrot ?? 0) * dur) * 57.2958,
            })
            .call(() => { if (node.isValid) node.destroy(); })
            .start();
    }

    /** 爆发 / 火环：环扩散并淡出 */
    private ring(x: number, y: number, r: number, color: string, grow: number): void {
        const node = this.mkRing(x, y, color);
        if (node == null || !node.isValid) return;
        const dur = 0.5;
        const s1 = (r * CELL_W) / RING_RADIUS_PX;
        const s0 = s1 * 0.3;
        node.setScale(s0, s0, 1);
        const ui = node.getComponent(UIOpacity);
        if (ui != null) ui.opacity = 255;
        tween(node)
            .to(dur * 0.4 * grow, { scale: new Vec3(s1, s1, 1) })
            .to(dur * 0.6, { scale: new Vec3(0, 0, 1) })
            .call(() => { if (node.isValid) node.destroy(); })
            .start();
        if (ui != null) tween(ui).to(dur, { opacity: 0 }).start();
    }

    /** 聚能环（法师施法）：双同心环 */
    private castaura(x: number, y: number, fx: IBattleFx): void {
        const dur = fx.max || 0.42;
        const R = (fx.r ?? 0.7) * CELL_W;
        for (let k = 0; k < 2; k++) {
            const node = this.mkRing(x, y, fx.color);
            if (node == null || !node.isValid) continue;
            const s1 = (R * (0.7 + k * 0.3)) / RING_RADIUS_PX;
            const s0 = (R * 0.3) / RING_RADIUS_PX;
            const d = dur * (k === 0 ? 1 : 0.8);
            node.setScale(s0, s0, 1);
            const ui = node.getComponent(UIOpacity);
            if (ui != null) ui.opacity = 200;
            tween(node)
                .to(dur * 0.4, { scale: new Vec3(s1, s1, 1) })
                .to(dur * 0.6, { scale: new Vec3(0, 0, 1) })
                .call(() => { if (node.isValid) node.destroy(); })
                .start();
            if (ui != null) tween(ui).to(d, { opacity: 0 }).start();
        }
    }

    /** 咆哮音波（张飞）：横向拉伸的环向右推进 */
    private shockwave(x: number, y: number, fx: IBattleFx): void {
        const dur = fx.max || 0.95;
        const travel = (fx.travel ?? 2.8) * CELL_W;
        const N = 5;
        for (let k = 0; k < N; k++) {
            const node = this.mkRing(x, y, '#a070ff');
            if (node == null || !node.isValid) continue;
            const sxE = (CELL_H * 0.55) / RING_RADIUS_PX;
            const syE = (CELL_H * 0.2) / RING_RADIUS_PX;
            node.setScale(sxE, syE, 1);
            const delay = k * 0.06;
            const ui = node.getComponent(UIOpacity);
            if (ui != null) ui.opacity = 200;
            tween(node)
                .delay(delay)
                .to((dur - delay) * 0.7, { position: new Vec3(x + travel, y, 0), scale: new Vec3(sxE * 2.2, syE * 1.4, 1) })
                .to((dur - delay) * 0.3, { scale: new Vec3(0, 0, 1) })
                .call(() => { if (node.isValid) node.destroy(); })
                .start();
            if (ui != null) tween(ui).delay(delay).to(dur - delay, { opacity: 0 }).start();
        }
    }

    /** 火柱 / 光柱（黄盖/陆逊/烈焰）：横向拉伸的发光条 */
    private beam(x: number, y: number, fx: IBattleFx): void {
        const node = this.mkDot(x, y, fx.color);
        if (node == null || !node.isValid) return;
        const len = (fx.w ?? 4) * CELL_W;
        const dur = fx.max || 0.4;
        const left = (fx.ang ?? 0) > Math.PI / 2;
        node.setPosition(left ? x - len / 2 : x + len / 2, y, 0);
        node.setScale(0.1, 0.5, 1);
        tween(node)
            .to(dur * 0.3, { scale: new Vec3(len / DOT_PX, 0.5, 1) })
            .to(dur * 0.7, { scale: new Vec3(0, 0, 1) })
            .call(() => { if (node.isValid) node.destroy(); })
            .start();
    }

    /** 死亡烟雾 */
    private die(x: number, y: number, fx: IBattleFx): void {
        const node = this.mkRing(x, y, '#ff7a4a');
        if (node == null || !node.isValid) return;
        const dur = fx.max || 0.4;
        const s1 = (0.6 * CELL_W) / RING_RADIUS_PX;
        node.setScale(s1 * 0.4, s1 * 0.4, 1);
        const ui = node.getComponent(UIOpacity);
        if (ui != null) ui.opacity = 200;
        tween(node)
            .to(dur * 0.4, { scale: new Vec3(s1, s1, 1) })
            .to(dur * 0.6, { scale: new Vec3(0, 0, 1) })
            .call(() => { if (node.isValid) node.destroy(); })
            .start();
        if (ui != null) tween(ui).to(dur, { opacity: 0 }).start();
    }
    //#endregion
}
