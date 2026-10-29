import type { EventKeyboard, EventTouch } from 'cc';
import { _decorator, EventMouse, Graphics, Input, Label, Node, Prefab, Sprite, UIOpacity, UITransform, Vec3, input, instantiate, tween } from 'cc';
import { GameDebugConfig } from '../../common/config/GameDebugConfig';
import { oops } from 'db://oops-framework/core/Oops';
import { GameComponent } from 'db://oops-framework/module/common/GameComponent';
import { UIID } from '../../common/config/GameUIConfig';
import { PlayerModel } from '../../common/model/PlayerModel';
import { PopupState } from '../../common/model/PopupState';
import { SettingsModel } from '../../common/model/SettingsModel';
import { TableUnits } from '../../common/table/TableUnits';
import { AudioPath, AudioService } from '../../common/ui/AudioService';
import { ViewKit } from '../../common/ui/ViewKit';
import type { Battle } from '../Battle';
import type { BattleModel } from '../logic/BattleModel';
import { Combat } from '../logic/Combat';
import { DeploySystem, DeployResult } from '../logic/DeploySystem';
import { EconomySystem } from '../logic/EconomySystem';
import { WaveSystem } from '../logic/WaveSystem';
import { BattleFxView } from './BattleFxView';
import { ProjectilePainter } from './ProjectilePainter';
import { TerrainPainter } from './TerrainPainter';
import { UnitCardPainter } from './UnitCardPainter';
import { WallPainter } from './WallPainter';

const { ccclass } = _decorator;

/** 与预制体一致的格子尺寸 */
const CELL_W = 96;
const CELL_H = 84;
const BOARD_W = CELL_W * 9;
const BOARD_H = CELL_H * 5;

type ActorKind = 'unit' | 'enemy' | 'bullet' | 'food';

interface ICardRef {
    unitId: string;
    node: Node;
    bg: Sprite | null;
    frame: Node | null;
    mask: Node | null;
    maskText: Label | null;
    cost: Label | null;
    lastRatio: number;
}

interface ICellRef {
    row: number;
    col: number;
    bg: Sprite | null;
    hl: Node | null;
}

/**
 * 战斗界面
 *
 * 所有界面元素来自 gui/battle/battle.prefab 与各演员预制体，
 * 本类只负责：驱动逻辑 tick、同步节点位置/颜色/数值、处理输入
 */
@ccclass('BattleViewComp')
export class BattleViewComp extends GameComponent {
    private battle: Battle | null = null;
    private model: BattleModel | null = null;

    private board: Node | null = null;
    private actorsLayer: Node | null = null;
    private battleFxView: BattleFxView | null = null;
    private inputNode: Node | null = null;
    private cardsLayer: Node | null = null;

    private foodLabel: Label | null = null;
    private killsLabel: Label | null = null;
    private levelLabel: Label | null = null;
    private waveLabel: Label | null = null;
    private remainLabel: Label | null = null;
    private waveFill: Node | null = null;
    private gateFill: Node | null = null;
    private gateValue: Label | null = null;
    private hintLabel: Label | null = null;
    private lastGate = -1;
    private speedLabel: Label | null = null;
    private pauseLabel: Label | null = null;
    private retreatLabel: Label | null = null;
    private cancelLabel: Label | null = null;

    private nextWaveLabel: Label | null = null;
    private bondTag: Label | null = null;
    private waveFlagLayer: Node | null = null;
    private fogNode: Node | null = null;
    private wallSprite: Sprite | null = null;
    private muteLabel: Label | null = null;

    private banner: Node | null = null;
    private bannerText: Label | null = null;
    private guide: Node | null = null;
    private guideText: Label | null = null;
    private debugPanel: Node | null = null;

    private cells: ICellRef[] = [];
    private cards: ICardRef[] = [];
    private mowers: Map<number, Node> = new Map();
    private pools: Record<ActorKind, Node[]> = { unit: [], enemy: [], bullet: [], food: [] };
    private unitViews: Map<number, Node> = new Map();
    private enemyViews: Map<number, Node> = new Map();
    private bulletViews: Map<number, Node> = new Map();
    private dropViews: Map<number, Node> = new Map();
    private seen: Set<number> = new Set();
    private prefabs: Partial<Record<ActorKind | 'card' | 'float' | 'burst' | 'flag', Prefab>> = {};

    private selectedUnit = '';
    private retreatMode = false;
    private hoverRow = -1;
    private hoverCol = -1;
    private lastProgress = -1;
    private resultShown = false;
    private gridVisible = true;
    private floatCount = 0;

    private guideStep = -1;
    /** 已授将到第几波（1=已授鲁肃，2=已授小乔） */
    private guideGranted = 0;

    /** 长按详情用：当前按住的卡与抑制点击标记 */
    private longPressUnit = '';
    private suppressClick = false;

    //#region 生命周期
    protected onLoad(): void {
        this.bindStaticNodes();
        this.bindButtons();
        this.bindBoardInput();
        this.layoutBoard();

        if (GameDebugConfig.enabled) {
            input.on(Input.EventType.KEY_DOWN, this.onDebugKeyDown, this);
            this.bindDebugPanel();
        }
        else if (this.debugPanel != null) {
            this.debugPanel.active = false;
        }
    }

    /** 由 Battle 在预制体挂载后调用 */
    init(battle: Battle, model: BattleModel): void {
        this.battle = battle;
        this.model = model;

        this.buildMowers();
        this.applyLevelVisuals(model);
        this.refreshHud(true);
        this.refreshHint();
        this.setupGuide();
        AudioService.playMusic(AudioPath.Battle);

        // 教学关首次进入播放开场剧情（通关前每次都播，通关后不再打扰）
        if (model.level.guide === true && !PlayerModel.inst.isCleared(1)) {
            this.battle?.pause();
            // 序章结束接「获得武将·丁奉」演出
            PopupState.openStory('tutorial', () => this.playGetHero('dingfeng'));
        }

        void this.loadPrefabsThenCards();
    }

    /** 关闭前调用，清空引用与对象池 */
    teardown(): void {
        if (GameDebugConfig.enabled) input.off(Input.EventType.KEY_DOWN, this.onDebugKeyDown, this);
        this.unscheduleAllCallbacks();

        this.unitViews.clear();
        this.enemyViews.clear();
        this.bulletViews.clear();
        this.dropViews.clear();
        this.cards.length = 0;
        this.model = null;
        this.battle = null;
    }

    protected onDestroy(): void {
        if (GameDebugConfig.enabled) input.off(Input.EventType.KEY_DOWN, this.onDebugKeyDown, this);
        super.onDestroy();
    }

    protected update(dt: number): void {
        const battle = this.battle;
        const model = this.model;
        if (battle == null || model == null) return;

        battle.tick(dt);

        this.syncUnits(model);
        this.syncEnemies(model);
        this.syncProjectiles(model);
        this.syncDrops(model);
        this.drainEffects(model);
        this.battleFxView?.sync(model, dt);

        this.refreshHud(false);
        this.refreshCards(model);
        this.checkFinish(battle, model);
    }
    //#endregion

    //#region 静态节点绑定
    private bindStaticNodes(): void {
        const root = this.node;
        this.board = ViewKit.get(root, 'board');
        this.actorsLayer = ViewKit.get(root, 'board/actors');
        this.inputNode = ViewKit.get(root, 'board/input');
        this.cardsLayer = ViewKit.get(root, 'cards');

        this.foodLabel = ViewKit.label(root, 'stats_panel/food_value');
        this.killsLabel = ViewKit.label(root, 'stats_panel/kills_value');
        this.levelLabel = ViewKit.label(root, 'topbar/level_name');
        this.waveLabel = ViewKit.label(root, 'topbar/wave_text');
        this.remainLabel = ViewKit.label(root, 'topbar/remain_text');
        this.waveFill = ViewKit.get(root, 'topbar/wave_fill');
        this.gateFill = ViewKit.get(root, 'topbar/gate_fill');
        this.gateValue = ViewKit.label(root, 'topbar/gate_value');
        this.hintLabel = ViewKit.label(root, 'hint');
        this.speedLabel = ViewKit.label(root, 'btn_speed/label');
        this.pauseLabel = ViewKit.label(root, 'btn_pause/label');
        this.retreatLabel = ViewKit.label(root, 'btn_retreat/label');
        this.cancelLabel = ViewKit.label(root, 'btn_cancel/label');

        this.nextWaveLabel = ViewKit.label(root, 'topbar/next_wave');
        this.bondTag = ViewKit.label(root, 'bond_tag');
        this.waveFlagLayer = ViewKit.get(root, 'topbar/wave_flags');
        this.fogNode = ViewKit.get(root, 'fog');
        this.wallSprite = ViewKit.sprite(root, 'board/wall');
        this.muteLabel = ViewKit.label(root, 'btn_mute/label');

        this.banner = ViewKit.get(root, 'banner');
        this.bannerText = ViewKit.label(root, 'banner/text');
        this.guide = ViewKit.get(root, 'guide');
        this.guideText = ViewKit.label(root, 'guide/text');
        this.debugPanel = ViewKit.get(root, 'debug');

                                                ViewKit.text(root, 'btn_speed/label', `×${this.battle == null ? 1 : this.battle.speed}`);
                
        this.cells.length = 0;
        const field = ViewKit.get(root, 'board/field');
        if (field != null) {
            for (let row = 0; row < 5; row++) {
                for (let col = 0; col < 9; col++) {
                    const cell = field.getChildByName(`cell_${row}_${col}`);
                    if (cell == null) continue;
                    this.cells.push({
                        row,
                        col,
                        bg: cell.getChildByName('bg')?.getComponent(Sprite) ?? null,
                        hl: cell.getChildByName('hl'),
                    });
                }
            }
        }

        // 战斗特效层（子弹 / 命中 / 技能特效由 BattleFxView 用预制体 + 缓动生成）
        this.battleFxView = this.node.addComponent(BattleFxView);
    }

    private bindButtons(): void {
        const root = this.node;
        ViewKit.click(ViewKit.get(root, 'btn_pause'), () => this.onPause());
        ViewKit.click(ViewKit.get(root, 'btn_speed'), () => this.onSpeed());
        ViewKit.click(ViewKit.get(root, 'btn_mute'), () => this.onMute());
        ViewKit.click(ViewKit.get(root, 'btn_help'), () => {
            this.battle?.pause();
            oops.gui.open(UIID.Help);
        });
        ViewKit.click(ViewKit.get(root, 'topbar/btn_strat'), () => {
            this.battle?.pause();
            oops.gui.open(UIID.Strat);
        });
        ViewKit.click(ViewKit.get(root, 'btn_retreat'), () => this.onRetreatMode());
        ViewKit.click(ViewKit.get(root, 'btn_cancel'), () => this.clearSelection());
    }

    private bindBoardInput(): void {
        const node = this.inputNode;
        if (node == null) return;

        node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            this.updateHover(event);
        });
        node.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
            this.updateHover(event);
        });
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            this.onBoardTouchEnd(event);
        });
        node.on(Node.EventType.MOUSE_UP, (event: EventMouse) => {
            // 右键取消当前选择
            if (event.getButton() === EventMouse.BUTTON_RIGHT) this.clearSelection();
        });
    }

    private layoutBoard(): void {
        const board = this.board;
        if (board == null) return;

        // 设计分辨率采用 SHOW_ALL，逻辑可视区恒为 1280x720，
        // 预制体本身即按该尺寸排版，因此战场保持 1:1，避免真机上因可视尺寸差异缩放错位
        board.setScale(1, 1, 1);
    }

    /** 关卡视觉：浓雾遮蔽、地形禁放格、城墙初始色 */
    private applyLevelVisuals(model: BattleModel): void {
        if (this.fogNode != null) this.fogNode.active = model.level.fog === true;

        const terrain = model.level.terrain;
        for (const cell of this.cells) {
            if (!model.grid.isBlocked(cell.row, cell.col)) continue;
            if (cell.bg != null) {
                const mountain = terrain?.mountain?.indexOf(cell.row) >= 0;
                const river = terrain?.river?.indexOf(cell.row) >= 0;
                cell.bg.color = ViewKit.color(mountain ? '#4A3B2E' : river ? '#1E3A4A' : '#0F0B08');
            }
            if (cell.hl != null) cell.hl.active = false;
        }

        // 雪顶高山 / 河流纹样（演员层底部）
        TerrainPainter.paint(this.actorsLayer, terrain, model.grid.cols);

        this.tintWall(model);
    }

    /** 城墙随城门耐久变色并切换破损分档 */
    private tintWall(model: BattleModel): void {
        if (this.wallSprite == null) return;
        const ratio = model.gateMax > 0 ? Math.max(0, model.gateHp) / model.gateMax : 0;

        if (ratio > 0.6) this.wallSprite.color = ViewKit.color('#5A3A28');
        else if (ratio > 0.2) this.wallSprite.color = ViewKit.color('#6B4A2A');
        else this.wallSprite.color = ViewKit.color('#7A2E22');

        // 分档：完好 → 1 道裂 → 2 道 → 3 道 + 火光
        ViewKit.visible(this.board, 'wall_crack_1', ratio <= 0.6);
        ViewKit.visible(this.board, 'wall_crack_2', ratio <= 0.4);
        ViewKit.visible(this.board, 'wall_crack_3', ratio <= 0.2);
        ViewKit.visible(this.board, 'wall_fire', ratio <= 0.2);

        // 砖墙 / 垛口 / 城门 / 裂纹（按损伤分档重绘）
        WallPainter.paintWall(ViewKit.get(this.board, 'wall'), 1 - ratio);
    }

    /** 城墙受击晃动（只位移预制体节点） */
    private shakeWall(): void {
        const wall = ViewKit.get(this.board, 'wall');
        if (wall == null) return;
        const x = wall.position.x;
        tween(wall)
            .to(0.04, { position: new Vec3(x + 6, wall.position.y, 0) })
            .to(0.05, { position: new Vec3(x - 5, wall.position.y, 0) })
            .to(0.04, { position: new Vec3(x, wall.position.y, 0) })
            .start();
    }

    /** 分级屏震（对整个战场做短促位移；重叠时忽略，避免抖动累积） */
    private shakeActive = false;

    private screenShake(amp: number): void {
        const board = this.board;
        if (board == null || !board.isValid || this.shakeActive) return;
        const strength = Math.max(1, Math.min(14, amp));
        this.shakeActive = true;
        const bx = board.position.x;
        const by = board.position.y;
        tween(board)
            .to(0.04, { position: new Vec3(bx + strength, by + strength * 0.4, 0) })
            .to(0.05, { position: new Vec3(bx - strength * 0.8, by - strength * 0.3, 0) })
            .to(0.04, { position: new Vec3(bx, by, 0) })
            .call(() => { this.shakeActive = false; })
            .start();
    }

    /** 技能名播报：施法者上方弹出「天赋 · 技能名」 */
    private announceSkill(effect: { name?: string; color?: string }, x: number, y: number): void {
        const name = effect.name ?? '';
        if (name === '') return;
        this.spawnFloat(x, y - 42, `天赋 · ${name}`, effect.color ?? '#F4D98A');
    }

    /** 出手 / 受击的缩放反馈（仅对已有演员节点做 tween） */
    private punch(node: Node | null): void {
        if (node == null || !node.isValid) return;
        tween(node)
            .to(0.06, { scale: new Vec3(1.12, 1.12, 1) })
            .to(0.08, { scale: new Vec3(1, 1, 1) })
            .start();
    }

    private buildMowers(): void {
        const model = this.model;
        if (model == null) return;

        for (let row = 0; row < 5; row++) {
            const node = ViewKit.get(this.board, `mowers/mower_${row}`);
            if (node == null) continue;
            node.active = false;
            WallPainter.paintLog(node);
        }
        for (const mower of model.mowers) {
            const node = ViewKit.get(this.board, `mowers/mower_${mower.row}`);
            if (node == null) continue;
            node.active = true;
            node.setPosition(new Vec3(this.px(mower.x), this.py(mower.row + 0.5), 0));
            this.mowers.set(mower.row, node);
        }
    }
    //#endregion

    //#region 资源加载与卡片
    private async loadPrefabsThenCards(): Promise<void> {
        const paths: Record<string, string> = {
            unit: 'gui/battle/actor_unit',
            enemy: 'gui/battle/actor_enemy',
            bullet: 'gui/battle/actor_bullet',
            food: 'gui/battle/actor_food',
            card: 'gui/battle/card',
            float: 'gui/battle/float_text',
            burst: 'gui/battle/fx_burst',
            flag: 'gui/battle/wave_flag',
        };

        const keys = Object.keys(paths);
        const results = await Promise.all(keys.map((key) => oops.res.load(paths[key], Prefab).catch(() => null)));

        for (let i = 0; i < keys.length; i++) {
            const prefab = results[i] as Prefab | null;
            if (prefab != null) (this.prefabs as Record<string, Prefab>)[keys[i]] = prefab;
        }

        if (!this.node.isValid) return;
        this.buildCards();
        this.buildWaveFlags();

        // 战斗特效层需要子弹/爆发预制体，资源就绪后初始化
        this.battleFxView?.init(this.prefabs, this.actorsLayer);
    }

    /** 生成波次旗标（大波红旗） */
    private buildWaveFlags(): void {
        const model = this.model;
        const layer = this.waveFlagLayer;
        const prefab = this.prefabs.flag;
        if (model == null || layer == null || prefab == null || model.level.endless === true) return;

        const width = 210;
        for (const flag of model.waveFlags) {
            const node = instantiate(prefab);
            node.parent = layer;
            node.setPosition(new Vec3(-width / 2 + width * flag.progress, 0, 0));
            const bar = node.getChildByName('bar');
            if (bar != null) {
                ViewKit.resize(bar, flag.big ? 3 : 2, flag.big ? 21 : 18);
                ViewKit.tint(bar.getComponent(Sprite), flag.big ? '#E0503A' : '#CAA84A');
            }
        }
    }

    private buildCards(): void {
        const model = this.model;
        const layer = this.cardsLayer;
        const prefab = this.prefabs.card;
        if (model == null || layer == null || prefab == null) return;

        layer.children.slice().forEach((child) => {
            child.removeFromParent();
            child.destroy();
        });
        this.cards.length = 0;

        // 左侧栏竖排卡槽：两列 × 最多六行，12 张卡刚好铺满
        const unitIds = model.deck.slice(0, 12);

        for (let i = 0; i < unitIds.length; i++) {
            const unitId = unitIds[i];
            const cfg = TableUnits.get(unitId);
            if (cfg == null) continue;

            const col = i % 2;
            const row = Math.floor(i / 2);

            const node = instantiate(prefab);
            node.parent = layer;
            node.setPosition(new Vec3(col === 0 ? -51 : 51, 180 - row * 72, 0));

            ViewKit.tintPath(node, 'chip', cfg.color);
            ViewKit.text(node, 'tag', cfg.tag);
            ViewKit.text(node, 'name', ViewKit.lang(cfg.nameKey));
            ViewKit.text(node, 'cost', String(cfg.cost));
            ViewKit.visible(node, 'frame', false);
            ViewKit.visible(node, 'mask', false);
            ViewKit.visible(node, 'mask_text', false);

            ViewKit.click(node, () => this.onCardClick(unitId));
            this.bindLongPress(node, unitId);

            this.cards.push({
                unitId,
                node,
                bg: node.getChildByName('bg')?.getComponent(Sprite) ?? null,
                frame: node.getChildByName('frame'),
                mask: node.getChildByName('mask'),
                maskText: node.getChildByName('mask_text')?.getComponent(Label) ?? null,
                cost: node.getChildByName('cost')?.getComponent(Label) ?? null,
                lastRatio: -1,
            });
        }
    }

    private refreshCards(model: BattleModel): void {
        for (const card of this.cards) {
            const cfg = TableUnits.get(card.unitId);
            if (cfg == null) continue;

            const ratio = DeploySystem.cooldownRatio(model, card.unitId);
            if (Math.abs(ratio - card.lastRatio) > 0.001) {
                card.lastRatio = ratio;
                if (card.mask != null) {
                    card.mask.active = ratio > 0.001;
                    const transform = card.mask.getComponent(UITransform);
                    if (transform != null) transform.setContentSize(96, 68 * ratio);
                }
                if (card.maskText != null) {
                    card.maskText.node.active = ratio > 0.001;
                    if (ratio > 0.001) card.maskText.string = String(Math.ceil(ratio * cfg.cooldown));
                }
            }

            const price = DeploySystem.priceOf(model, card.unitId);
            const ready = DeploySystem.isCardReady(model, card.unitId);
            if (card.bg != null) card.bg.color = ViewKit.color(ready ? '#FFFFFF' : '#8C8C8C');
            if (card.cost != null) {
                ViewKit.setText(card.cost, String(price));
                card.cost.color = ViewKit.color(model.food >= price ? '#D9C08C' : '#C0392B');
            }
            if (card.frame != null) card.frame.active = this.selectedUnit === card.unitId;

            // 引导期：只高亮当前步骤指定的武将，其余压暗（守波步全部压暗）
            if (this.guideStep >= 2) {
                const allowed = this.guideAllowed();
                const isAllowed = allowed !== '' && card.unitId === allowed;
                if (card.bg != null) card.bg.color = ViewKit.color(isAllowed ? '#FFFFFF' : '#5E5E5E');
                if (card.frame != null) card.frame.active = isAllowed;
            }
        }
    }
    //#endregion

    //#region 输入与布阵
    /** 长按卡片查看详情（0.45 秒） */
    private bindLongPress(node: Node, unitId: string): void {
        node.on(Node.EventType.TOUCH_START, () => {
            this.longPressUnit = unitId;
            this.scheduleOnce(() => {
                if (this.longPressUnit !== unitId) return;
                this.longPressUnit = '';
                this.suppressClick = true;
                this.battle?.pause();
                PopupState.openUnitDetail(unitId);
            }, 0.45);
        });

        const cancel = () => {
            if (this.longPressUnit === unitId) this.longPressUnit = '';
        };
        node.on(Node.EventType.TOUCH_END, cancel);
        node.on(Node.EventType.TOUCH_CANCEL, cancel);
    }

    private onCardClick(unitId: string): void {
        if (this.suppressClick) {
            this.suppressClick = false;
            return;
        }

        const model = this.model;
        if (model == null) return;

        // 引导期只允许当前步骤指定的武将
        if (this.guideStep >= 2) {
            const allow = this.guideAllowed();
            if (unitId !== allow) {
                const allowCfg = allow !== '' ? TableUnits.get(allow) : null;
                oops.gui.toast(allowCfg != null
                    ? ViewKit.lang('guide_lock_one', ViewKit.lang(allowCfg.nameKey))
                    : ViewKit.lang('guide_lock_none'));
                return;
            }
        }

        if (DeploySystem.isCardReady(model, unitId)) {
            this.selectedUnit = this.selectedUnit === unitId ? '' : unitId;
            this.retreatMode = false;
        }
        else {
            const cooling = DeploySystem.cooldownRatio(model, unitId) > 0;
            oops.gui.toast(ViewKit.lang(cooling ? 'battle_cooling' : 'battle_not_enough_food'));
        }
        this.refreshHint();
    }

    private onRetreatMode(): void {
        this.retreatMode = !this.retreatMode;
        this.selectedUnit = '';
        this.refreshHint();
    }

    private clearSelection(): void {
        this.selectedUnit = '';
        this.retreatMode = false;
        this.refreshHint();
        this.updateHoverCell(-1, -1);
    }

    private onBoardTouchEnd(event: EventTouch): void {
        const model = this.model;
        if (model == null || model.over) return;

        // 优先拾取军粮
        if (this.tryCollect(event)) return;

        const cell = this.pickCell(event);
        if (cell == null) return;

        if (this.retreatMode) {
            const unit = model.unitAt(cell.row, cell.col);
            if (unit != null) {
                DeploySystem.retreat(model, unit.uid);
                this.refreshHint();
            }
            return;
        }

        if (this.selectedUnit === '') return;

        const unitId = this.selectedUnit;
        // deploy 返回部署出的单位实例，失败返回 null（不要与 DeployResult 枚举比较）
        const unit = DeploySystem.deploy(model, unitId, cell.row, cell.col);
        if (unit == null) {
            const reason = DeploySystem.check(model, unitId, cell.row, cell.col);
            if (reason === DeployResult.NoFood) {
                ViewKit.setText(this.hintLabel, ViewKit.lang('battle_not_enough_food'));
                this.scheduleOnce(() => { if (this.node.isValid) this.refreshHint(); }, 1.2);
            }
            else if (reason === DeployResult.Cooling) {
                ViewKit.setText(this.hintLabel, ViewKit.lang('battle_cooling'));
                this.scheduleOnce(() => { if (this.node.isValid) this.refreshHint(); }, 1.2);
            }
            else {
                // 禁放格（InvalidCell）已用常亮高亮标出，点击不打扰
                this.refreshHint();
            }
            return;
        }

        AudioService.playEffect(AudioPath.Plant);
        this.onPlanted(unitId);
        this.selectedUnit = '';
        this.refreshHint();
        this.updateHoverCell(-1, -1);
    }

    private onPlanted(unitId: string): void {
        if (this.guideStep < 2) return;

        // 每步只认一名武将，放下即推进到「守波」步
        if (this.guideStep === 2 && unitId === 'dingfeng') {
            if (this.model != null) this.model.wavesHeld = false;   // 放下第一枚将才开波
            this.setGuideStep(3, 'guide_step3');
            return;
        }
        if (this.guideStep === 4 && unitId === 'lusu') {
            this.setGuideStep(5, 'guide_step5');
            return;
        }
        if (this.guideStep === 6 && unitId === 'xiaoqiao') {
            this.setGuideStep(7, 'guide_step7');
        }
    }

    private pickCell(event: EventTouch): { row: number; col: number } | null {
        const node = this.inputNode;
        if (node == null) return null;
        const transform = node.getComponent(UITransform);
        if (transform == null) return null;

        const ui = event.getUILocation();
        const local = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
        const col = Math.floor((local.x + BOARD_W / 2) / CELL_W);
        const row = Math.floor((BOARD_H / 2 - local.y) / CELL_H);
        if (row < 0 || row > 4 || col < 0 || col > 8) return null;
        return { row, col };
    }

    private updateHover(event: EventTouch): void {
        const cell = this.pickCell(event);
        if (cell == null) {
            this.updateHoverCell(-1, -1);
            return;
        }
        this.updateHoverCell(cell.row, cell.col);
    }

    private updateHoverCell(row: number, col: number): void {
        this.hoverRow = row;
        this.hoverCol = col;
        this.applyCellHighlight();
    }

    /**
     * 格子高亮：
     * - 未选卡：仅悬停格微亮（提示可点击区域）
     * - 选中卡：所有可部署格常亮（淡金），悬停格高亮金——禁放行不再需要玩家试错
     */
    private applyCellHighlight(): void {
        const model = this.model;
        const placing = this.selectedUnit !== '' && !this.retreatMode;
        for (const cell of this.cells) {
            if (cell.hl == null) continue;
            const blocked = model != null && model.grid.isBlocked(cell.row, cell.col);
            const hover = cell.row === this.hoverRow && cell.col === this.hoverCol;

            if (placing && model != null) {
                const deployable = !blocked && model.grid.isFree(cell.row, cell.col);
                cell.hl.active = deployable;
                const hlSprite = cell.hl.getComponent(Sprite);
                if (hlSprite != null) ViewKit.tint(hlSprite, hover ? '#FFE9A8' : '#C9AE6A');
            }
            else {
                cell.hl.active = !blocked && hover;
                const hlSprite = cell.hl.getComponent(Sprite);
                if (hlSprite != null) ViewKit.tint(hlSprite, '#FFFFFF');
            }
        }
    }

    /** 点击位置附近是否有军粮 */
    private tryCollect(event: EventTouch): boolean {
        const model = this.model;
        const node = this.inputNode;
        if (model == null || node == null) return false;

        const transform = node.getComponent(UITransform);
        if (transform == null) return false;
        const ui = event.getUILocation();
        const local = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));

        for (const drop of model.drops) {
            if (!drop.alive) continue;
            const dx = this.px(drop.x) - local.x;
            const dy = this.py(drop.y) - local.y;
            if (dx * dx + dy * dy <= 46 * 46) {
                EconomySystem.collect(model, drop.uid);
                AudioService.playEffect(AudioPath.Collect);
                this.onCollected();
                return true;
            }
        }
        return false;
    }

    private onCollected(): void {
        // 引导中的拾取无额外推进，仅保留钩子便于后续扩展
    }

    private refreshHint(): void {
        let text = ViewKit.lang('battle_hint_select');
        if (this.retreatMode) text = ViewKit.lang('battle_hint_retreat');
        else if (this.selectedUnit !== '') text = ViewKit.lang('battle_hint_place');
        ViewKit.setText(this.hintLabel, text);

        if (this.retreatLabel != null) {
            this.retreatLabel.color = ViewKit.color(this.retreatMode ? '#D9A441' : '#F2E6D0');
        }

        this.applyCellHighlight();
    }
    //#endregion

    //#region HUD
    private refreshHud(force: boolean): void {
        const model = this.model;
        if (model == null) return;

        ViewKit.setText(this.foodLabel, String(Math.floor(model.food)));
        ViewKit.setText(this.killsLabel, String(model.kills));
        ViewKit.setText(this.levelLabel, ViewKit.lang(model.level.nameKey));

        if (model.level.endless === true) {
            ViewKit.setText(this.waveLabel, ViewKit.lang('battle_endless_wave', model.endlessWave));
            ViewKit.setText(this.remainLabel, '');
        }
        else {
            const total = model.waves.length;
            const wave = model.waveNumber;
            ViewKit.setText(this.waveLabel, total === 0 ? ViewKit.lang('battle_wave_idle') : ViewKit.lang('battle_wave', wave, total));
            ViewKit.setText(this.remainLabel, ViewKit.lang('battle_remain', model.remainEnemies));
        }

        const progress = model.progress;
        if (force || Math.abs(progress - this.lastProgress) > 0.005) {
            this.lastProgress = progress;
            ViewKit.setBar(this.node, 'topbar/wave_fill', progress);
        }

        const gate = Math.max(0, model.gateHp);
        if (force || gate !== this.lastGate) {
            this.lastGate = gate;
            ViewKit.setBar(this.node, 'topbar/gate_fill', model.gateMax > 0 ? gate / model.gateMax : 0);
            ViewKit.setText(this.gateValue, `${gate}/${model.gateMax}`);
            if (this.gateValue != null) {
                this.gateValue.color = ViewKit.color(gate <= 2 ? '#FF7A5A' : '#F4D98A');
            }
        }

        // 下一波倒计时（无尽模式显示下一波）
        let countdown = -1;
        if (model.level.endless === true) {
            countdown = model.endlessTimer;
        }
        else {
            const next = WaveSystem.nextWaveTime(model);
            if (next > 0) countdown = Math.max(0, next - model.time);
        }
        ViewKit.setText(this.nextWaveLabel, countdown >= 0 ? ViewKit.lang('battle_next_wave', Math.ceil(countdown)) : '');

        // 羁缘角标
        const bondCount = model.activeBonds.length;
        if (this.bondTag != null) {
            this.bondTag.node.active = bondCount > 0;
            if (bondCount > 0) this.bondTag.string = ViewKit.lang('battle_bond', bondCount);
        }

        this.tintWall(model);

        if (this.speedLabel != null) ViewKit.setText(this.speedLabel, `×${this.battle == null ? 1 : this.battle.speed}`);
    }

    /** 静音开关（音效） */
    private onMute(): void {
        const settings = SettingsModel.inst;
        const next = !settings.sfx;
        settings.setSfx(next);
        if (this.muteLabel != null) this.muteLabel.color = ViewKit.color(next ? '#3A2408' : '#8A6A4A');
        oops.gui.toast(ViewKit.lang(next ? 'battle_mute_on' : 'battle_mute_off'));
    }

    private onPause(): void {
        const battle = this.battle;
        if (battle == null || battle.isOver) return;
        battle.pause();
        oops.gui.open(UIID.Pause, { data: { levelId: battle.levelId } });
    }

    private onSpeed(): void {
        const battle = this.battle;
        if (battle == null) return;
        battle.setSpeed(battle.speed >= 2 ? 1 : 2);
        if (this.speedLabel != null) this.speedLabel.string = `×${battle.speed}`;
    }
    //#endregion

    //#region 演员同步
    private syncUnits(model: BattleModel): void {
        const layer = this.actorsLayer;
        if (layer == null) return;

        this.seen.clear();
        for (const unit of model.units) {
            if (!unit.alive) continue;
            this.seen.add(unit.uid);

            let node = this.unitViews.get(unit.uid);
            if (node == null) {
                const created = this.acquire('unit');
                if (created == null) continue;
                node = created;
                this.unitViews.set(unit.uid, node);
                node.name = `unit_${unit.uid}`;
            }

            node.active = true;
            node.setPosition(new Vec3(this.px(unit.col + 0.5), this.py(unit.row + 0.5), 0));
            this.punchOnHurt(node, unit.hp);

            const chip = node.getChildByName('chip')?.getComponent(Sprite) ?? null;
            ViewKit.tint(chip, unit.hitFlash > 0 ? '#FFFFFF' : unit.cfg.color, 240);
            ViewKit.text(node, 'tag', unit.cfg.tag);

            // 程序化卡片装饰（渐变 / 高光 / 描边）
            const unitChipNode = node.getChildByName('chip');
            const unitCardSize = unitChipNode?.getComponent(UITransform)?.contentSize.width ?? 56;
            UnitCardPainter.paint(node, unit.cfg.color, unitCardSize, {});

            const hpRatio = unit.hp / unit.maxHp;
            ViewKit.visible(node, 'hp', hpRatio < 0.999);
            if (hpRatio < 0.999) ViewKit.setBar(node, 'hp/fill', hpRatio);
        }

        this.unitViews.forEach((node, uid) => {
            if (this.seen.has(uid)) return;
            this.recycleActor('unit', node);
            this.unitViews.delete(uid);
        });
    }

    private syncEnemies(model: BattleModel): void {
        const layer = this.actorsLayer;
        if (layer == null) return;

        this.seen.clear();
        for (const enemy of model.enemies) {
            if (!enemy.alive) continue;
            this.seen.add(enemy.uid);

            let node = this.enemyViews.get(enemy.uid);
            if (node == null) {
                const created = this.acquire('enemy');
                if (created == null) continue;
                node = created;
                this.enemyViews.set(enemy.uid, node);
                node.name = `enemy_${enemy.uid}`;
            }

            node.active = true;
            node.setPosition(new Vec3(this.px(enemy.x), this.py(enemy.row + 0.5), 0));

            const scale = enemy.cfg.size ?? 1;
            node.setScale(scale, scale, 1);

            // 受击反馈放在 chip 子节点上，避免与体型缩放互相覆盖
            const holder = node as unknown as { __lastHp?: number };
            if (holder.__lastHp != null && enemy.hp < holder.__lastHp - 0.5) {
                const chip = node.getChildByName('chip');
                if (chip != null) this.punch(chip);
            }
            holder.__lastHp = enemy.hp;

            const chip = node.getChildByName('chip')?.getComponent(Sprite) ?? null;
            const slowed = enemy.slowRemain > 0;
            ViewKit.tint(chip, enemy.hitFlash > 0 ? '#FFFFFF' : (slowed ? '#7FB4D8' : enemy.cfg.color), 245);
            ViewKit.text(node, 'tag', enemy.cfg.tag);

            // 整卡状态表现（霜冻 / 眩晕 / 中毒）
            const enemyChipNode = node.getChildByName('chip');
            const enemyCardSize = enemyChipNode?.getComponent(UITransform)?.contentSize.width ?? 52;
            UnitCardPainter.paint(node, enemy.cfg.color, enemyCardSize, {
                slow: slowed,
                stun: enemy.stunTimer > 0,
            });

            ViewKit.setBar(node, 'hp/fill', enemy.hp / enemy.maxHp);
            const hasArmor = enemy.maxArmor > 0;
            ViewKit.visible(node, 'hp/armor', hasArmor && enemy.armor > 0);
            if (hasArmor && enemy.armor > 0) ViewKit.setBar(node, 'hp/armor', enemy.armor / enemy.maxArmor);
        }

        this.enemyViews.forEach((node, uid) => {
            if (this.seen.has(uid)) return;
            this.recycleActor('enemy', node);
            this.enemyViews.delete(uid);
        });
    }

    private syncProjectiles(model: BattleModel): void {
        const layer = this.actorsLayer;
        if (layer == null) return;

        // 弹道统一由 Graphics 矢量层绘制（arrow / knife / boomerang / stone 真实形态）
        this.ensureProjectileGraphics();
        const g = this.projectileG;
        if (g == null) return;
        if (g.node.parent != null) g.node.setSiblingIndex(g.node.parent.children.length - 1);
        ProjectilePainter.draw(g, model, (v) => this.px(v), (v) => this.py(v));
    }

    /** 弹道矢量层（位于演员层之上） */
    private projectileG: Graphics | null = null;

    private ensureProjectileGraphics(): void {
        const layer = this.actorsLayer;
        if (layer == null) return;
        if (this.projectileG != null && this.projectileG.node.isValid) return;
        const node = new Node('proj_art');
        node.layer = layer.layer;
        node.parent = layer;
        node.setPosition(0, 0, 0);
        const ui = node.addComponent(UITransform);
        ui.setContentSize(BOARD_W, BOARD_H);
        node.addComponent(Graphics);
        this.projectileG = node.getComponent(Graphics);
    }

    private syncDrops(model: BattleModel): void {
        const layer = this.actorsLayer;
        if (layer == null) return;

        this.seen.clear();
        for (const drop of model.drops) {
            if (!drop.alive) continue;
            this.seen.add(drop.uid);

            let node = this.dropViews.get(drop.uid);
            if (node == null) {
                const created = this.acquire('food');
                if (created == null) continue;
                node = created;
                this.dropViews.set(drop.uid, node);
            }

            node.active = true;
            node.setPosition(new Vec3(this.px(drop.x), this.py(drop.y), 0));

            const pulse = 1 + 0.06 * Math.sin((drop.age + drop.uid) * 5);
            node.setScale(pulse, pulse, 1);

            // 即将消失时闪烁提示
            const opacity = node.getComponent(UIOpacity);
            if (opacity != null) {
                opacity.opacity = drop.life < 3
                    ? Math.floor(120 + 135 * Math.abs(Math.sin(drop.life * 6)))
                    : 255;
            }
        }

        this.dropViews.forEach((node, uid) => {
            if (this.seen.has(uid)) return;
            this.recycleActor('food', node);
            this.dropViews.delete(uid);
        });
    }

    private acquire(kind: ActorKind): Node | null {
        const pool = this.pools[kind];
        if (pool.length > 0) {
            const node = pool.pop()!;
            node.active = true;
            node.setScale(1, 1, 1);
            const opacity = node.getComponent(UIOpacity);
            if (opacity != null) opacity.opacity = 255;
            node.parent = this.actorsLayer;
            return node;
        }
        const prefab = this.prefabs[kind];
        if (prefab == null) return null;
        const node = instantiate(prefab);
        node.parent = this.actorsLayer;
        return node;
    }

    private recycleActor(kind: ActorKind, node: Node): void {
        if (node == null || !node.isValid) return;
        node.active = false;
        node.removeFromParent();
        const pool = this.pools[kind];
        if (pool.length < 80) pool.push(node);
        else node.destroy();
    }

    private px(x: number): number {
        return -BOARD_W / 2 + x * CELL_W;
    }

    private py(y: number): number {
        return BOARD_H / 2 - y * CELL_H;
    }
    //#endregion

    //#region 表现事件
    private drainEffects(model: BattleModel): void {
        if (model.effects.length === 0) return;

        for (const effect of model.effects) {
            const x = this.px(effect.x);
            const y = this.py(effect.y ?? effect.row + 0.5);

            switch (effect.kind) {
                case 'damage':
                    this.spawnFloat(x + 10, y + 24, `-${effect.value ?? 0}`, effect.color ?? '#F2E6D0');
                    this.playThrottled('hit', AudioPath.Hit, 80);
                    break;
                case 'food':
                    this.spawnFloat(x, y + 20, `粮草+${effect.value ?? 0}`, '#D9A441');
                    break;
                case 'explosion':
                    this.spawnBurst(x, y, (effect.radius ?? 1) * CELL_W);
                    break;
                case 'mower':
                    this.playMower(effect.row);
                    break;
                case 'bigwave':
                    this.playBigWave();
                    AudioService.playEffect(AudioPath.Wave);
                    break;
                case 'breach':
                    ViewKit.setText(this.hintLabel, ViewKit.lang('battle_breach'));
                    break;
                case 'gate':
                    ViewKit.setText(this.hintLabel, ViewKit.lang('battle_gate_hit'));
                    this.shakeWall();
                    break;
                case 'shoot':
                    this.punchAtRow(effect.row, x);
                    this.playThrottled('shoot', AudioPath.Shoot, 70);
                    break;
                case 'die':
                    this.playThrottled('die', AudioPath.Die, 90);
                    break;
                case 'skill':
                    this.announceSkill(effect, x, y);
                    break;
                case 'shout':
                    this.screenShake(3);
                    break;
                case 'shake':
                    this.screenShake(effect.amp ?? 5);
                    break;
                default:
                    break;
            }
        }
        model.effects.length = 0;
    }

    /** 战斗内音效节流（避免齐射时叠成噪音） */
    private readonly sfxAt: Record<string, number> = {};

    private playThrottled(key: string, path: string, gapMs: number): void {
        const now = Date.now();
        if (now - (this.sfxAt[key] ?? 0) < gapMs) return;
        this.sfxAt[key] = now;
        AudioService.playEffect(path);
    }

    /** 让该行该位置附近的武将做出手动作 */
    private punchAtRow(row: number, worldX: number): void {
        const y = this.py(row + 0.5);
        for (const node of this.unitViews.values()) {
            if (!node.isValid || !node.active) continue;
            if (Math.abs(node.position.x - worldX) > 60) continue;
            if (Math.abs(node.position.y - y) > 40) continue;
            this.punch(node);
            return;
        }
    }

    /** 血量下降时的受击反馈 */
    private punchOnHurt(node: Node, hp: number): void {
        const holder = node as unknown as { __lastHp?: number };
        if (holder.__lastHp != null && hp < holder.__lastHp - 0.5) this.punch(node);
        holder.__lastHp = hp;
    }

    private spawnFloat(x: number, y: number, text: string, color: string): void {
        const prefab = this.prefabs.float;
        if (prefab == null || this.actorsLayer == null) return;
        if (this.floatCount >= 22) return;

        const node = instantiate(prefab);
        node.parent = this.actorsLayer;
        node.setPosition(new Vec3(x, y, 0));
        ViewKit.text(node, 'text', text);
        const label = node.getChildByName('text')?.getComponent(Label);
        if (label != null) label.color = ViewKit.color(color);

        const opacity = node.getComponent(UIOpacity);
        this.floatCount += 1;
        tween(node)
            .by(0.6, { position: new Vec3(0, 46, 0) })
            .call(() => {
                this.floatCount -= 1;
                node.destroy();
            })
            .start();
        if (opacity != null) {
            tween(opacity).delay(0.2).to(0.4, { opacity: 0 }).start();
        }
    }

    private spawnBurst(x: number, y: number, size: number): void {
        const prefab = this.prefabs.burst;
        if (prefab == null || this.actorsLayer == null) return;

        const node = instantiate(prefab);
        node.parent = this.actorsLayer;
        node.setPosition(new Vec3(x, y, 0));
        node.setScale(0.4, 0.4, 1);

        const target = Math.max(0.8, size / 100);
        const opacity = node.getComponent(UIOpacity);
        tween(node).to(0.22, { scale: new Vec3(target, target, 1) }).start();
        if (opacity != null) {
            tween(opacity).to(0.24, { opacity: 0 }).call(() => node.destroy()).start();
        }
        else {
            this.scheduleOnce(() => node.destroy(), 0.3);
        }
    }

    private playMower(row: number): void {
        const node = this.mowers.get(row);
        if (node == null) return;
        node.setScale(1, 1, 1);
        tween(node)
            .to(0.35, { position: new Vec3(BOARD_W / 2 + 80, node.position.y, 0) })
            .call(() => {
                node.active = false;
            })
            .start();
    }

    private playBigWave(): void {
        const banner = this.banner;
        if (banner == null) return;
        ViewKit.setText(this.bannerText, ViewKit.lang('battle_big_wave'));
        banner.active = true;
        banner.setPosition(new Vec3(620, banner.position.y, 0));
        tween(banner)
            .to(0.22, { position: new Vec3(0, banner.position.y, 0) }, { easing: 'quadOut' })
            .delay(1.1)
            .call(() => {
                banner.active = false;
            })
            .start();
    }
    //#endregion

    //#region 新手引导
    /**
     * 参考稿新手引导（并入第 1 关，边打边教）
     *
     * 2 部署丁奉（部署前不开波）→ 3 守第 1 波
     * → 清波授鲁肃（剧情）→ 4 部署鲁肃 → 5 守第 2 波
     * → 清波授小乔（剧情）→ 6 部署小乔 → 7 顶住终波 → 通关即完成
     */
    private setupGuide(): void {
        const model = this.model;
        if (model == null) return;

        // 以「第 1 关是否通关」为准：老存档的 guideDone 不再决定是否引导
        if (model.level.guide !== true || PlayerModel.inst.isCleared(1)) {
            if (this.guide != null) this.guide.active = false;
            this.guideStep = -1;
            return;
        }

        this.guideStep = 2;
        this.guideGranted = 0;
        model.wavesHeld = true;      // 部署前暂停开波（放下第一枚将才迎战）
        this.showGuide('guide_step2');
    }

    /** 引导顶部提示带 */
    private showGuide(key: string): void {
        ViewKit.visible(this.node, 'guide', true);
        ViewKit.setText(this.guideText, ViewKit.lang(key));
    }

    private hideGuide(): void {
        if (this.guide != null) this.guide.active = false;
    }

    /** 当前引导步唯一允许部署的武将（守波步返回空 = 全部锁住） */
    private guideAllowed(): string {
        if (this.guideStep === 2) return 'dingfeng';
        if (this.guideStep === 4) return 'lusu';
        if (this.guideStep === 6) return 'xiaoqiao';
        return '';
    }

    private setGuideStep(step: number, key: string): void {
        this.guideStep = step;
        this.clearSelection();
        this.showGuide(key);
    }

    /** 授将：播剧情，剧情结束后接「获得武将」演出；武将真正加入卡组发生在演出结束时 */
    private grantGuideUnit(unitId: string, storyId: string, nextStep: number, key: string): void {
        const model = this.model;
        if (model == null) return;

        this.battle?.pause();
        PopupState.openStory(storyId, () => {
            if (!this.node.isValid) return;
            // 获得演出结束回调里再把武将加入卡槽，并推进引导步
            this.playGetHero(unitId, () => this.setGuideStep(nextStep, key));
        });
    }

    /**
     * 获得武将演出（暂停战斗）。演出关闭后才把武将加入卡组、重建卡槽，
     * 保证「左侧选将池在获得武将前为空、获得后才显示」。
     */
    private playGetHero(unitId: string, onObtained?: () => void): void {
        this.battle?.pause();
        PopupState.openGetHero(unitId, () => {
            if (!this.node.isValid) return;
            const model = this.model;
            if (model != null) {
                model.grantUnit(unitId);
                this.buildCards();
            }
            PlayerModel.inst.obtainUnit(unitId);
            this.refreshHint();
            onObtained?.();
        });
    }

    private updateGuide(): void {
        const model = this.model;
        if (model == null || this.guideStep < 2) return;

        // 部署兜底：60 秒未放将也开波（参考稿 TUT_DEPLOY_TIMEOUT）
        if (this.guideStep === 2 && model.wavesHeld && model.time > 60) {
            model.wavesHeld = false;
            this.setGuideStep(3, 'guide_step3');
            return;
        }

        if (model.over) {
            this.hideGuide();
            if (model.win) PlayerModel.inst.setGuideDone();
            return;
        }

        // 清完第 1 波 → 授鲁肃
        if (this.guideStep === 3 && this.guideGranted < 1 && model.waveCursor >= 2) {
            this.guideGranted = 1;
            this.grantGuideUnit('lusu', 'lusu', 4, 'guide_step4');
            return;
        }

        // 清完第 2 波 → 授小乔
        if (this.guideStep === 5 && this.guideGranted < 2 && model.waveCursor >= 3) {
            this.guideGranted = 2;
            this.grantGuideUnit('xiaoqiao', 'xiaoqiao', 6, 'guide_step6');
            return;
        }

        // 终波开打 → 收尾提示
        if (this.guideStep === 7 && model.waveCursor >= 3) {
            this.showGuide('guide_step7');
        }
    }
    //#endregion

    //#region 结算

    private checkFinish(battle: Battle, model: BattleModel): void {
        this.updateGuide();
        if (!model.over || this.resultShown) return;

        this.resultShown = true;
        this.clearSelection();
        this.scheduleOnce(() => {
            if (!this.node.isValid) return;
            const summary = battle.takeSummary();
            if (summary == null) return;
            AudioService.playEffect(summary.win ? AudioPath.Win : AudioPath.Lose);
            oops.gui.open(UIID.Result, { data: summary });
        }, 0.7);
    }
    //#endregion

    //#region 调试面板
    private bindDebugPanel(): void {
        const panel = this.debugPanel;
        if (panel == null) return;
        panel.active = false;

        ViewKit.click(ViewKit.get(panel, 'btn_food'), () => {
            this.model?.addFood(500);
        });
        ViewKit.click(ViewKit.get(panel, 'btn_wave'), () => {
            const model = this.model;
            if (model == null) return;
            const next = WaveSystem.nextWaveTime(model);
            if (next > 0) model.time = next;
        });
        ViewKit.click(ViewKit.get(panel, 'btn_kill'), () => {
            const model = this.model;
            if (model == null) return;
            for (const enemy of model.enemies) {
                if (enemy.alive) Combat.damageEnemy(model, enemy, 999999, '#C0392B');
            }
        });
        ViewKit.click(ViewKit.get(panel, 'btn_grid'), () => {
            this.gridVisible = !this.gridVisible;
            for (const cell of this.cells) {
                if (cell.bg == null) continue;
                const base = (cell.row + cell.col) % 2 === 0 ? '#2F4A3A' : '#274034';
                cell.bg.color = ViewKit.color(this.gridVisible ? base : '#1A2A22');
            }
        });
    }

    private onDebugKeyDown(event: EventKeyboard): void {
        const key = event.keyCode;
        // 68 = D，切换调试面板
        if (key === 68 && this.debugPanel != null) {
            this.debugPanel.active = !this.debugPanel.active;
        }
        // 27 = ESC，取消选择 / 暂停
        if (key === 27) {
            if (this.selectedUnit !== '' || this.retreatMode) this.clearSelection();
            else this.onPause();
        }
    }
    //#endregion
}
