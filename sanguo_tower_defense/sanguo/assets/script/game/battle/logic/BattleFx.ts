import type { BattleModel } from './BattleModel';
import type { IBattleFx } from './Actor';

/** 命中碎片配色（参考稿 SHARD_COLORS_*） */
const SHARD_HIT = ['#e8d7b0', '#c9b184', '#a8915f'];
const SHARD_CRIT = ['#ffd870', '#ff9a50', '#e8503a'];
const SHARD_KILL = ['#ffe9a8', '#e8b84a', '#c07a30'];

function rnd(a: number, b: number): number {
    return a + Math.random() * (b - a);
}

/**
 * 战斗特效生成器：把「子弹/命中/技能」等视觉事件推入 model.battleFx，
 * 由视图层 BattleFxView 用 Graphics 程序化绘制（坐标统一用格单位，
 * 像素尺寸的换算在视图层完成，逻辑层不感知屏幕缩放）。
 */
export const BattleFx = {
    impact(model: BattleModel, x: number, row: number, color: string, crit = false): void {
        model.addBattleFx({ kind: 'impact', x, y: row + 0.5, color, crit, life: 0.3, max: 0.3 });
    },

    muzzle(model: BattleModel, x: number, row: number, color: string, ang = 0): void {
        model.addBattleFx({ kind: 'muzzle', x, y: row + 0.5, color, ang, life: 0.14, max: 0.14 });
    },

    shards(model: BattleModel, x: number, row: number, n: number, colors: string[]): void {
        for (let i = 0; i < n; i++) {
            const a = rnd(0, Math.PI * 2);
            const sp = rnd(0.3, 1.2);
            const fx: IBattleFx = {
                kind: 'shard', x, y: row + 0.5, color: colors[i % colors.length],
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.3,
                vrot: rnd(-8, 8), rot: rnd(0, 6.28),
                size: Math.round(rnd(3, 6)), round: Math.random() < 0.4,
                grav: 2.2, life: rnd(0.45, 0.8), max: 0.8,
            };
            model.addBattleFx(fx);
        }
    },

    die(model: BattleModel, x: number, row: number): void {
        model.addBattleFx({ kind: 'die', x, y: row + 0.5, color: '#ffd8a8', life: 0.4, max: 0.4 });
        this.shards(model, x, row, 12, SHARD_KILL);
    },

    burst(model: BattleModel, x: number, row: number, r: number, color: string): void {
        model.addBattleFx({ kind: 'burst', x, y: row + 0.5, r, color, life: 0.5, max: 0.5 });
    },

    castaura(model: BattleModel, x: number, row: number, color: string, r = 0.7): void {
        model.addBattleFx({ kind: 'castaura', x, y: row + 0.5, r, color, life: 0.42, max: 0.42 });
    },

    shockwave(model: BattleModel, x: number, row: number, color: string, travel = 2.8): void {
        model.addBattleFx({ kind: 'shockwave', x, y: row + 0.5, color, travel, life: 0.95, max: 0.95 });
    },

    fire(model: BattleModel, x: number, row: number, r: number, color = '#ff6a20'): void {
        model.addBattleFx({ kind: 'fire', x, y: row + 0.5, r, color, life: 0.7, max: 0.7 });
    },

    line(model: BattleModel, x: number, row: number, len: number, color: string, left = false): void {
        model.addBattleFx({ kind: 'line', x, y: row + 0.5, w: len, color, ang: left ? Math.PI : 0, life: 0.4, max: 0.4 });
    },

    sweep(model: BattleModel, x: number, row: number, color: string, r: number, span: number, ang: number): void {
        model.addBattleFx({ kind: 'sweep', x, y: row + 0.5, color, r, span, ang, life: 0.58, max: 0.58 });
    },

    /** 施法轨迹（远程：起点 → 落点的亮线） */
    cast(model: BattleModel, x: number, row: number, color: string, tx: number, ty = row + 0.5): void {
        model.addBattleFx({ kind: 'cast', x, y: row + 0.5, color, x2: tx, y2: ty, life: 0.36, max: 0.36 });
    },

    /** 弓手拉弓蓄力 */
    bowdraw(model: BattleModel, x: number, row: number, color: string, ang = 0): void {
        model.addBattleFx({ kind: 'bowdraw', x, y: row + 0.5, color, ang, life: 0.32, max: 0.32 });
    },

    /** 近战挥出的月牙气浪 */
    wave(model: BattleModel, x: number, row: number, color: string, tx: number, ty = row + 0.5): void {
        model.addBattleFx({ kind: 'wave', x, y: row + 0.5, color, x2: tx, y2: ty, life: 0.34, max: 0.34 });
    },

    /** 刀光弧（近战起手） */
    slash(model: BattleModel, x: number, row: number, color: string, r: number, span: number, ang: number): void {
        model.addBattleFx({ kind: 'slash', x, y: row + 0.5, color, r, span, ang, life: 0.34, max: 0.34 });
    },

    /** 粮车：自产粮将驶向城门运粮 */
    graincart(model: BattleModel, x: number, row: number, color: string, tx: number, ty = row + 0.5): void {
        model.addBattleFx({ kind: 'graincart', x, y: row + 0.5, color, x2: tx, y2: ty, life: 1.8, max: 1.8 });
    },

    /** 八卦阵场地法阵 */
    bagua(model: BattleModel, x: number, row: number, color: string, r = 1.5): void {
        model.addBattleFx({ kind: 'bagua', x, y: row + 0.5, color, r, life: 5, max: 5 });
    },

    /** 全体增益喊声 / 光波 */
    shout(model: BattleModel, x: number, row: number, color: string, r = 1.4): void {
        model.addBattleFx({ kind: 'shout', x, y: row + 0.5, color, r, life: 0.6, max: 0.6 });
    },

    /** 余迹拖尾 */
    trail(model: BattleModel, x: number, row: number, color: string, tx: number, ty = row + 0.5): void {
        model.addBattleFx({ kind: 'trail', x, y: row + 0.5, color, x2: tx, y2: ty, life: 0.3, max: 0.3 });
    },

    /** 分级屏震（视图消费） */
    shake(model: BattleModel, amp = 5): void {
        model.addEffect({ kind: 'shake', row: 0, x: 0, amp });
    },
};
