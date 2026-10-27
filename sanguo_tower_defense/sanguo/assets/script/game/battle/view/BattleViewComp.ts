import type { EventKeyboard, EventTouch } from 'cc';
import { _decorator, EventMouse, Input, Label, Node, Prefab, Sprite, UIOpacity, UITransform, Vec3, input, instantiate, tween } from 'cc';
import { DEBUG } from 'cc/env';
import { oops } from 'db://oops-framework/core/Oops';
import { GameComponent } from 'db://oops-framework/module/common/GameComponent';
import { UIID } from '../../common/config/GameUIConfig';
import { PlayerModel } from '../../common/model/PlayerModel';
import { TableUnits } from '../../common/table/TableUnits';
import { AudioPath, AudioService } from '../../common/ui/AudioService';
import { ViewKit } from '../../common/ui/ViewKit';
import type { Battle } from '../Battle';
import type { BattleModel } from '../logic/BattleModel';
import { Combat } from '../logic/Combat';
import { DeploySystem, DeployResult } from '../logic/DeploySystem';
import { EconomySystem } from '../logic/EconomySystem';
import { WaveSystem } from '../logic/WaveSystem';

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
    private inputNode: Node | null = null;
    private cardsLayer: Node | null = null;

    private foodLabel: Label | null = null;
    private waveLabel: Label | null = null;
    private waveFill: Node | null = null;
    private hintLabel: Label | null = null;
    private speedLabel: Label | null = null;
    private pauseLabel: Label | null = null;
    private retreatLabel: Label | null = null;
    private cancelLabel: Label | null = null;

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
    private prefabs: Partial<Record<ActorKind | 'card' | 'float' | 'burst', Prefab>> = {};

    private selectedUnit = '';
    private retreatMode = false;
    private hoverRow = -1;
    private hoverCol = -1;
    private lastProgress = -1;
    private resultShown = false;
    private gridVisible = true;
    private floatCount = 0;

    private guideStep = -1;
    private guidePlantedPeach = false;
    private guidePlantedArcher = false;

    //#region 生命周期
    protected onLoad(): void {
        this.bindStaticNodes();
        this.bindButtons();
        this.bindBoardInput();
        this.layoutBoard();

        if (DEBUG) {
            input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
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
        this.refreshHud(true);
        this.refreshHint();
        this.setupGuide();
        AudioService.playMusic(AudioPath.Battle);
        void this.loadPrefabsThenCards();
    }

    /** 关闭前调用，清空引用与对象池 */
    teardown(): void {
        if (DEBUG) input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
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
        if (DEBUG) input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
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

        this.foodLabel = ViewKit.label(root, 'food_value');
        this.waveLabel = ViewKit.label(root, 'wave_text');
        this.waveFill = ViewKit.get(root, 'wave_bar_fill');
        this.hintLabel = ViewKit.label(root, 'hint');
        this.speedLabel = ViewKit.label(root, 'btn_speed/label');
        this.pauseLabel = ViewKit.label(root, 'btn_pause/label');
        this.retreatLabel = ViewKit.label(root, 'btn_retreat/label');
        this.cancelLabel = ViewKit.label(root, 'btn_cancel/label');

        this.banner = ViewKit.get(root, 'banner');
        this.bannerText = ViewKit.label(root, 'banner/text');
        this.guide = ViewKit.get(root, 'guide');
        this.guideText = ViewKit.label(root, 'guide/text');
        this.debugPanel = ViewKit.get(root, 'debug');

        ViewKit.text(root, 'btn_pause/label', ViewKit.lang('battle_pause'));
        ViewKit.text(root, 'btn_speed/label', `×${this.battle == null ? 1 : this.battle.speed}`);
        ViewKit.text(root, 'btn_retreat/label', ViewKit.lang('battle_retreat'));
        ViewKit.text(root, 'btn_cancel/label', ViewKit.lang('battle_cancel'));

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
    }

    private bindButtons(): void {
        const root = this.node;
        ViewKit.click(ViewKit.get(root, 'btn_pause'), () => this.onPause());
        ViewKit.click(ViewKit.get(root, 'btn_speed'), () => this.onSpeed());
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

    private buildMowers(): void {
        const model = this.model;
        if (model == null) return;

        for (let row = 0; row < 5; row++) {
            const node = ViewKit.get(this.board, `mowers/mower_${row}`);
            if (node != null) node.active = false;
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
        };

        const keys = Object.keys(paths);
        const results = await Promise.all(keys.map((key) => oops.res.load(paths[key], Prefab).catch(() => null)));

        for (let i = 0; i < keys.length; i++) {
            const prefab = results[i] as Prefab | null;
            if (prefab != null) (this.prefabs as Record<string, Prefab>)[keys[i]] = prefab;
        }

        if (!this.node.isValid) return;
        this.buildCards();
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

        // 可用宽度 900（容器位于 x=-150），12 张卡时步长收窄，保证左右都不越界
        const unitIds = model.level.units.slice(0, 12);
        const step = Math.min(88, 900 / Math.max(1, unitIds.length));
        const startX = -((unitIds.length - 1) * step) / 2;

        for (let i = 0; i < unitIds.length; i++) {
            const unitId = unitIds[i];
            const cfg = TableUnits.get(unitId);
            if (cfg == null) continue;

            const node = instantiate(prefab);
            node.parent = layer;
            node.setPosition(new Vec3(startX + i * step, 0, 0));

            ViewKit.tintPath(node, 'chip', cfg.color);
            ViewKit.text(node, 'tag', cfg.tag);
            ViewKit.text(node, 'name', ViewKit.lang(cfg.nameKey));
            ViewKit.text(node, 'cost', String(cfg.cost));
            ViewKit.visible(node, 'frame', false);
            ViewKit.visible(node, 'mask', false);
            ViewKit.visible(node, 'mask_text', false);

            ViewKit.click(node, () => this.onCardClick(unitId));

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
                    if (transform != null) transform.setContentSize(92, 106 * ratio);
                }
                if (card.maskText != null) {
                    card.maskText.node.active = ratio > 0.001;
                    if (ratio > 0.001) card.maskText.string = String(Math.ceil(ratio * cfg.cooldown));
                }
            }

            const ready = DeploySystem.isCardReady(model, card.unitId);
            if (card.bg != null) card.bg.color = ViewKit.color(ready ? '#FFFFFF' : '#8C8C8C');
            if (card.cost != null) card.cost.color = ViewKit.color(model.food >= cfg.cost ? '#D9C08C' : '#C0392B');
            if (card.frame != null) card.frame.active = this.selectedUnit === card.unitId;
        }
    }
    //#endregion

    //#region 输入与布阵
    private onCardClick(unitId: string): void {
        const model = this.model;
        if (model == null) return;

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
        const result = DeploySystem.deploy(model, unitId, cell.row, cell.col);
        if (result !== DeployResult.Ok) {
            oops.gui.toast(ViewKit.lang(this.deployFailKey(result)));
            return;
        }

        AudioService.playEffect(AudioPath.Plant);
        this.onPlanted(unitId);
        this.selectedUnit = '';
        this.refreshHint();
        this.updateHoverCell(-1, -1);
    }

    private deployFailKey(result: DeployResult): string {
        if (result === DeployResult.NoFood) return 'battle_not_enough_food';
        if (result === DeployResult.Cooling) return 'battle_cooling';
        return 'battle_hint_invalid';
    }

    private onPlanted(unitId: string): void {
        if (this.guideStep === 1 && unitId === 'peach') {
            this.guidePlantedPeach = true;
            this.setGuideStep(2, ViewKit.lang('guide_plant_archer'));
        }
        else if (this.guideStep === 2 && unitId === 'archer') {
            this.guidePlantedArcher = true;
            this.setGuideStep(3, ViewKit.lang('guide_ready'));
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
        if (row === this.hoverRow && col === this.hoverCol) return;
        this.hoverRow = row;
        this.hoverCol = col;

        for (const cell of this.cells) {
            if (cell.hl == null) continue;
            cell.hl.active = cell.row === row && cell.col === col;
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
        if (this.guideStep === 0) {
            this.setGuideStep(1, ViewKit.lang('guide_plant_peach'));
        }
    }

    private refreshHint(): void {
        let text = ViewKit.lang('battle_hint_select');
        if (this.retreatMode) text = ViewKit.lang('battle_hint_retreat');
        else if (this.selectedUnit !== '') text = ViewKit.lang('battle_hint_place');
        ViewKit.setText(this.hintLabel, text);

        if (this.retreatLabel != null) {
            this.retreatLabel.color = ViewKit.color(this.retreatMode ? '#D9A441' : '#F2E6D0');
        }
    }
    //#endregion

    //#region HUD
    private refreshHud(force: boolean): void {
        const model = this.model;
        if (model == null) return;

        ViewKit.setText(this.foodLabel, String(Math.floor(model.food)));

        const total = model.waves.length;
        const wave = model.waveNumber;
        ViewKit.setText(this.waveLabel, total === 0 ? ViewKit.lang('battle_wave_idle') : ViewKit.lang('battle_wave', wave, total));

        const progress = model.progress;
        if (force || Math.abs(progress - this.lastProgress) > 0.005) {
            this.lastProgress = progress;
            ViewKit.setBar(this.node, 'wave_bar_fill', progress);
        }

        if (this.speedLabel != null) ViewKit.setText(this.speedLabel, `×${this.battle == null ? 1 : this.battle.speed}`);
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

            const chip = node.getChildByName('chip')?.getComponent(Sprite) ?? null;
            ViewKit.tint(chip, unit.hitFlash > 0 ? '#FFFFFF' : unit.cfg.color, 240);
            ViewKit.text(node, 'tag', unit.cfg.tag);

            const hpRatio = unit.hp / unit.maxHp;
            ViewKit.visible(node, 'hp', hpRatio < 0.999);
            if (hpRatio < 0.999) ViewKit.setBar(node, 'hp/fill', hpRatio);
        }

        this.unitViews.forEach((node, uid) => {
            if (this.seen.has(uid)) return;
            this.release('unit', node);
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

            const chip = node.getChildByName('chip')?.getComponent(Sprite) ?? null;
            const slowed = enemy.slowRemain > 0;
            ViewKit.tint(chip, enemy.hitFlash > 0 ? '#FFFFFF' : (slowed ? '#7FB4D8' : enemy.cfg.color), 245);
            ViewKit.text(node, 'tag', enemy.cfg.tag);

            ViewKit.setBar(node, 'hp/fill', enemy.hp / enemy.maxHp);
            const hasArmor = enemy.maxArmor > 0;
            ViewKit.visible(node, 'hp/armor', hasArmor && enemy.armor > 0);
            if (hasArmor && enemy.armor > 0) ViewKit.setBar(node, 'hp/armor', enemy.armor / enemy.maxArmor);
        }

        this.enemyViews.forEach((node, uid) => {
            if (this.seen.has(uid)) return;
            this.release('enemy', node);
            this.enemyViews.delete(uid);
        });
    }

    private syncProjectiles(model: BattleModel): void {
        const layer = this.actorsLayer;
        if (layer == null) return;

        this.seen.clear();
        for (const p of model.projectiles) {
            if (!p.alive) continue;
            this.seen.add(p.uid);

            let node = this.bulletViews.get(p.uid);
            if (node == null) {
                const created = this.acquire('bullet');
                if (created == null) continue;
                node = created;
                this.bulletViews.set(p.uid, node);
            }

            // 抛射表现：用纵向弧线抬高，命中判定的纵向仍以行为准
            let y = p.row + 0.5;
            if (p.duration > 0) {
                const lift = Math.sin(Math.PI * Math.min(1, p.progress)) * 0.9;
                y -= lift;
            }
            node.active = true;
            node.setPosition(new Vec3(this.px(p.x), this.py(y), 0));

            const dot = node.getChildByName('dot')?.getComponent(Sprite) ?? null;
            ViewKit.tint(dot, p.cfg.color);
            const width = p.cfg.width ?? 5;
            ViewKit.resize(node.getChildByName('dot'), width * 2, width);
        }

        this.bulletViews.forEach((node, uid) => {
            if (this.seen.has(uid)) return;
            this.release('bullet', node);
            this.bulletViews.delete(uid);
        });
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
            this.release('food', node);
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

    private release(kind: ActorKind, node: Node): void {
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
                    break;
                case 'food':
                    this.spawnFloat(x, y + 20, `+${effect.value ?? 0}`, '#D9A441');
                    break;
                case 'explosion':
                    this.spawnBurst(x, y, (effect.radius ?? 1) * CELL_W);
                    break;
                case 'mower':
                    this.playMower(effect.row);
                    break;
                case 'bigwave':
                    this.playBigWave();
                    break;
                case 'breach':
                    ViewKit.setText(this.hintLabel, ViewKit.lang('battle_breach'));
                    break;
                default:
                    break;
            }
        }
        model.effects.length = 0;
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
    private setupGuide(): void {
        const model = this.model;
        if (model == null) return;
        if (model.level.guide !== true || PlayerModel.inst.guideDone) {
            if (this.guide != null) this.guide.active = false;
            return;
        }
        this.guideStep = 0;
        this.guidePlantedPeach = false;
        this.guidePlantedArcher = false;
        ViewKit.visible(this.node, 'guide', true);
        ViewKit.setText(this.guideText, ViewKit.lang('guide_collect'));
    }

    private setGuideStep(step: number, text: string): void {
        this.guideStep = step;
        ViewKit.visible(this.node, 'guide', true);
        ViewKit.setText(this.guideText, text);
    }

    private updateGuide(): void {
        const model = this.model;
        if (this.guideStep < 0 || model == null) return;
        if (this.guideStep < 3) return;

        // 第一波出兵后即视为引导完成
        if (!this.guidePlantedArcher || model.waveCursor === 0) return;

        this.guideStep = 4;
        ViewKit.visible(this.node, 'guide', false);
        PlayerModel.inst.setGuideDone();
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

    private onKeyDown(event: EventKeyboard): void {
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
