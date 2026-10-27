import { _decorator, Node, Prefab, Sprite, SpriteFrame, UIOpacity, Vec3, instantiate } from 'cc';
import { GameComponent } from 'db://oops-framework/module/common/GameComponent';
import { oops } from 'db://oops-framework/core/Oops';
import { UIID } from '../../common/config/GameUIConfig';
import { ViewKit } from '../../common/ui/ViewKit';
import { PopupState } from '../../common/model/PopupState';
import { TableUnits } from '../../common/table/TableUnits';
import { Battle } from '../Battle';

const { ccclass } = _decorator;

interface HeroStar {
    node: Node;
    angle: number;
    rr: number;
    sp: number;
    ph: number;
    size: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : (v > 1 ? 1 : v));
const easeOutCubic = (p: number): number => 1 - Math.pow(1 - p, 3);

/** 设计尺寸（战场为 1280×720，取短边 720 作为光晕基准） */
const DESIGN_MIN = 720;
const CARD_W = 210;
const CARD_H = 300;
const CARD_Y = 36;

/**
 * 获得武将演出
 *
 * 逐帧复刻参考稿 DrawGetHero 的时间轴与比例：
 *   黑幕淡入 0.45s → 光芒 0.18~0.93s → 卡牌弹出 0.28~0.90s
 *   → 卡面扫光 0.85~1.55s → 文字浮现 1.05~1.60s → 1.4s 后可轻触继续
 * 所有元素都来自 get_hero.prefab / get_hero_star.prefab，这里只改位置、缩放与透明度。
 */
@ccclass('GetHeroViewComp')
export class GetHeroViewComp extends GameComponent {
    private t = 0;
    private canClose = false;
    private unitId = '';

    private readonly ops = new Map<string, UIOpacity | null>();
    private readonly rayOps: UIOpacity[] = [];
    private readonly rayNodes: Node[] = [];
    private readonly stars: HeroStar[] = [];

    private glow: Node | null = null;
    private glowInner: Node | null = null;
    private rays: Node | null = null;
    private starRoot: Node | null = null;
    private card: Node | null = null;
    private titleNode: Node | null = null;
    private nameNode: Node | null = null;
    private talentNode: Node | null = null;
    private hintNode: Node | null = null;

    protected onLoad(): void {
        this.unitId = PopupState.getHeroUnitId();
        const cfg = TableUnits.get(this.unitId);
        if (cfg == null) {
            oops.gui.remove(UIID.GetHero);
            return;
        }

        const node = this.node;
        ViewKit.text(node, 'card/tag', cfg.tag);
        ViewKit.text(node, 'card/card_name', ViewKit.lang(cfg.nameKey));
        ViewKit.text(node, 'title', ViewKit.lang('get_hero_title'));
        ViewKit.text(node, 'name', ViewKit.lang(cfg.nameKey));
        ViewKit.text(node, 'talent', cfg.talent != null
            ? ViewKit.lang('get_hero_talent', cfg.talent.name)
            : '');
        ViewKit.text(node, 'hint', ViewKit.lang('get_hero_hint'));

        // 卡面常驻可见（只做缩放弹出），避免透明度链路异常导致整卡不可见
        const cardOpacity = ViewKit.get(node, 'card')?.getComponent(UIOpacity) ?? null;
        if (cardOpacity != null) cardOpacity.opacity = 255;
        ViewKit.visible(node, 'card/chip', false);
        ViewKit.visible(node, 'card/tag', false);

        this.glow = ViewKit.get(node, 'glow');
        this.glowInner = ViewKit.get(node, 'glow_inner');
        this.rays = ViewKit.get(node, 'rays');
        this.starRoot = ViewKit.get(node, 'star_root');
        this.card = ViewKit.get(node, 'card');
        this.titleNode = ViewKit.get(node, 'title');
        this.nameNode = ViewKit.get(node, 'name');
        this.talentNode = ViewKit.get(node, 'talent');
        this.hintNode = ViewKit.get(node, 'hint');

        // 画像兜底必须在节点引用就绪后执行（ensurePortrait 依赖 this.card，
        // 之前放在赋值前导致每次都在 card == null 处直接返回）
        void this.ensurePortrait(cfg);

        // 光芒：7 根贯通长条（镜像后共 14 道），整体由容器旋转
        for (let i = 0; i < 7; i++) {
            const ray = ViewKit.get(node, `rays/r${i}`);
            if (ray == null) continue;
            ray.angle = (i * 360) / 7;
            this.rayNodes.push(ray);
            const opacity = ray.getComponent(UIOpacity);
            if (opacity != null) this.rayOps.push(opacity);
        }

        void this.spawnStars();

        // 初始缩放
        if (this.card != null) this.card.setScale(0.42, 0.42, 1);
        if (this.rays != null) this.rays.angle = 0;

        ViewKit.click(ViewKit.get(node, 'dim'), () => this.close());

    }

    /**
     * 保证卡面上一定有「阵营色底 + 武将画像」
     *
     * 三层兜底：
     * 1. 预制体里的 portrait 节点直接用；
     * 2. 找不到就实例化 hero_portrait 预制体补建；
     * 3. SpriteFrame 为空时按资源路径重新加载，仍失败则回退为色块卡面（绝不出现全黑卡）。
     */
    private async ensurePortrait(cfg: { id: string; color: string }): Promise<void> {
        const card = this.card;
        if (card == null) return;

        let sprite = ViewKit.sprite(card, 'portrait');
        let backdrop = ViewKit.get(card, 'backdrop');

        if (sprite == null) {
            const holder = await ViewKit.instantiatePrefab('gui/battle/hero_portrait', card);
            if (holder != null && card.isValid) {
                // 必须叠在深色内底之上，否则会被 inner 盖住
                const innerIndex = card.children.findIndex((child) => child.name === 'inner');
                holder.setSiblingIndex(innerIndex >= 0 ? innerIndex + 1 : 1);
                sprite = ViewKit.sprite(holder, 'portrait');
                backdrop = ViewKit.get(holder, 'backdrop');
            }
        }

        if (backdrop != null) {
            // 画像本身是近黑剪影 → 垫浅色纸底（保留 28% 阵营色作区分）
            const bg = backdrop.getComponent(Sprite);
            if (bg != null) bg.color = ViewKit.color(this.lighten(cfg.color, 0.72));
        }

        if (sprite == null) {
            console.warn('[三国塔防] 未找到武将画像节点，请重新执行 node tools/ui-gen.mjs');
            return;
        }

        if (sprite.spriteFrame == null) {
            try {
                const frame = await oops.res.load('game/texture/portrait_default/spriteFrame', SpriteFrame);
                if (frame != null) sprite.spriteFrame = frame;
            }
            catch (e) {
                console.warn('[三国塔防] 默认画像加载失败', e);
            }
        }

        const ok = sprite.spriteFrame != null;
        sprite.node.active = ok;
        if (!ok) {
            ViewKit.visible(card, 'chip', true);
            ViewKit.visible(card, 'tag', true);
            console.warn('[三国塔防] 默认画像不可用，已回退为色块卡面');
        }
    }

    /** 颜色向白色提亮 */
    private lighten(hex: string, ratio: number): string {
        const matched = /^#?([0-9a-fA-F]{6})$/.exec(hex ?? '');
        if (matched == null) return '#C08A4A';
        const value = parseInt(matched[1], 16);
        const mix = (c: number): number => Math.round(c + (255 - c) * ratio);
        const to2 = (v: number): string => v.toString(16).padStart(2, '0');
        return `#${to2(mix((value >> 16) & 255))}${to2(mix((value >> 8) & 255))}${to2(mix(value & 255))}`;
    }

    /** 星屑：预制体只加载一次，再批量实例化 58 枚，逐帧按参考公式飘散 */
    private async spawnStars(): Promise<void> {
        const root = this.starRoot;
        if (root == null) return;

        let prefab: Prefab | null = null;
        try {
            prefab = await oops.res.load('gui/battle/get_hero_star', Prefab);
        }
        catch (e) {
            console.warn('[三国塔防] 星屑预制体加载失败', e);
            return;
        }
        if (prefab == null || !root.isValid) return;

        for (let i = 0; i < 58; i++) {
            const node = instantiate(prefab);
            node.parent = root;
            this.stars.push({
                node,
                angle: Math.random() * Math.PI * 2,
                rr: Math.random(),
                sp: 0.35 + Math.random() * 0.9,
                ph: Math.random() * Math.PI * 2,
                size: 1 + Math.random() * 2.4,
            });
        }
    }

    protected update(dt: number): void {
        if (this.unitId === '') return;
        this.t += dt;
        this.render();
    }

    private render(): void {
        const t = this.t;
        const pDim = clamp01(t / 0.45);
        const pRay = clamp01((t - 0.18) / 0.75);
        const pCard = clamp01((t - 0.28) / 0.62);
        const pTxt = clamp01((t - 1.05) / 0.55);
        const pSweep = clamp01((t - 0.85) / 0.7);

        // ① 黑幕
        this.setOpacity('dim', 246 * pDim);

        // ② 双层金色背光（外层暖橙扩散 / 内芯奶白金）
        const glowR = DESIGN_MIN * (0.55 + 0.35 * pRay);
        this.setOpacity('glow', 0.62 * pRay * 255);
        this.setOpacity('glow_inner', 0.30 * pRay * 255);
        if (this.glow != null) {
            const k = glowR / 460;
            this.glow.setScale(k, k, 1);
        }
        if (this.glowInner != null) {
            const k = glowR / 340;
            this.glowInner.setScale(k, k, 1);
        }

        // ③ 旋转光芒
        if (this.rays != null) {
            // 只旋转容器；长度在每根光芒的本地 Y 轴上缩放，避免非等比缩放造成剪切
            this.rays.angle = (t * 0.55 * 180) / Math.PI;
        }
        const lenK = (glowR * 0.95) / 260;
        for (const ray of this.rayNodes) ray.setScale(1, lenK, 1);
        this.setOpacity('rays', 255);
        for (let i = 0; i < this.rayOps.length; i++) {
            const alpha = (0.10 + 0.10 * Math.sin(t * 2 + i)) * (0.35 + pRay * 0.65);
            this.rayOps[i].opacity = Math.max(0, Math.min(255, alpha * 255 * 1.9));
        }

        // ④ 星屑
        this.setOpacity('star_root', 255);
        for (const star of this.stars) {
            if (!star.node.isValid) continue;
            const rr = (star.rr + t * star.sp * 0.11) % 1;
            const dist = rr * glowR * 1.15;
            const x = Math.cos(star.angle) * dist;
            const y = Math.sin(star.angle) * dist * 0.86;
            star.node.setPosition(new Vec3(x, y, 0));

            const alpha = (0.35 + 0.65 * Math.abs(Math.sin(t * 3 + star.ph))) * (1 - rr) * pRay;
            const opacity = star.node.getComponent(UIOpacity);
            if (opacity != null) opacity.opacity = Math.max(0, Math.min(255, alpha * 255));

            const s = (star.size * (1 - rr * 0.5)) / 4;
            star.node.setScale(s, s, 1);
            star.node.angle = (star.angle * 180) / Math.PI;
        }

        // ⑤ 金卡：弹性弹出 + 白闪 + 扫光
        const sc = 0.42 + 0.58 * easeOutCubic(pCard);
        const pop = 1 + 0.10 * Math.sin(Math.PI * Math.min(1, pCard * 1.15)) * (1 - pCard);
        if (this.card != null) {
            this.card.setScale(sc * pop, sc * pop, 1);
            this.card.setPosition(new Vec3(0, CARD_Y, 0));
        }
        // 卡面常驻可见（缩放负责弹出感），避免透明度链路异常导致整卡不可见
        this.setOpacity('card', 255);

        const flash = clamp01(1 - Math.abs(pCard - 0.55) / 0.28);
        this.setOpacity('card/flash', flash * 0.85 * 255);

        const sweepOpacity = pSweep > 0 && pSweep < 1 ? Math.sin(Math.PI * pSweep) * 200 : 0;
        this.setOpacity('card/sweep', sweepOpacity);
        const sweep = ViewKit.get(this.node, 'card/sweep');
        if (sweep != null) {
            sweep.angle = -20;
            // 在卡面内从左扫到右（无 Mask 裁切，收窄行程避免扫到卡外）
            sweep.setPosition(new Vec3(-CARD_W * 0.55 + pSweep * (CARD_W * 1.1), 0, 0));
        }

        // ⑥ 文字：获得武将 / 名号 / 天赋
        // 预制体带示例文本（编辑器可见），运行时在各自时间轴前强制透明
        const ea = easeOutCubic(pTxt);
        const dy = (1 - ea) * 12;
        this.setOpacity('title', ea * 255);
        this.setOpacity('name', ea * 255);
        this.setOpacity('talent', ea * 255);
        if (this.titleNode != null) this.titleNode.setPosition(new Vec3(0, 246 - dy, 0));
        if (this.nameNode != null) this.nameNode.setPosition(new Vec3(0, -165 - dy, 0));
        if (this.talentNode != null) this.talentNode.setPosition(new Vec3(0, -204 - dy, 0));

        // ⑦ 轻触继续（呼吸）
        const pulse = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.6));
        this.setOpacity('hint', t > 1.4 ? pulse * 255 : 0);
        if (this.hintNode != null) this.hintNode.setPosition(new Vec3(0, -296, 0));

        if (!this.canClose && t > 0.4) this.canClose = true;
    }

    private setOpacity(path: string, value: number): void {
        let opacity = this.ops.get(path);
        if (opacity === undefined || opacity === null) {
            const node = ViewKit.get(this.node, path);
            opacity = node != null ? node.getComponent(UIOpacity) : null;
            // 预制体若缺少 UIOpacity（旧版本），运行时补一个，避免整层永远停在 0
            if (opacity == null && node != null) opacity = node.addComponent(UIOpacity);
            this.ops.set(path, opacity);
        }
        if (opacity != null) opacity.opacity = Math.max(0, Math.min(255, Math.round(value)));
    }

    private close(): void {
        if (!this.canClose) return;

        const done = PopupState.takeHeroDone();
        oops.gui.remove(UIID.GetHero);
        Battle.current?.resume();
        done?.();
    }
}
