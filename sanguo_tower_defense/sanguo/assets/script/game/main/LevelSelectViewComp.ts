import { _decorator, Node, Sprite, Vec3, tween } from 'cc';
import { oops } from 'db://oops-framework/core/Oops';
import { GameComponent } from 'db://oops-framework/module/common/GameComponent';
import { UIID } from '../common/config/GameUIConfig';
import { PlayerModel } from '../common/model/PlayerModel';
import { TableEnemies } from '../common/table/TableEnemies';
import type { ILevelConfig } from '../common/table/ITable';
import { TableLevels } from '../common/table/TableLevels';
import { TableUnits } from '../common/table/TableUnits';
import { TableWaves } from '../common/table/TableWaves';
import { AudioPath, AudioService } from '../common/ui/AudioService';
import { AppNav } from '../common/ui/AppNav';
import { ViewKit } from '../common/ui/ViewKit';

const { ccclass } = _decorator;

interface ILevelCardRef {
    node: Node;
    frame: Node | null;
    bg: Sprite | null;
}

/**
 * 关卡选择
 *
 * 关卡卡片为独立预制体 gui/main/level_card，敌人/单位缩略为 gui/main/chip，
 * 本类只负责实例化与填充数据
 */
@ccclass('LevelSelectViewComp')
export class LevelSelectViewComp extends GameComponent {
    private cards: Map<number, ILevelCardRef> = new Map();
    private grid: Node | null = null;
    private detail: Node | null = null;
    private selectedId = 1;
    private chipToken = 0;

    protected onLoad(): void {
        AudioService.playMusic(AudioPath.Menu);

        const root = this.node;
        this.grid = ViewKit.get(root, 'grid');
        this.detail = ViewKit.get(root, 'detail');

        ViewKit.text(root, 'btn_back/label', ViewKit.lang('select_back'));
        ViewKit.text(root, 'title', ViewKit.lang('select_title'));
        ViewKit.text(root, 'btn_start/label', ViewKit.lang('select_start'));
        ViewKit.text(root, 'stars_total', `★ ${PlayerModel.inst.totalStars} / ${PlayerModel.inst.maxStars}`);
        ViewKit.text(root, 'detail/enemies_title', ViewKit.lang('select_enemies'));
        ViewKit.text(root, 'detail/units_title', ViewKit.lang('select_units'));
        ViewKit.text(root, 'detail/tip', ViewKit.lang('select_tip'));

        ViewKit.click(ViewKit.get(root, 'btn_back'), () => {
            oops.gui.remove(UIID.LevelSelect);
        });
        ViewKit.click(ViewKit.get(root, 'btn_start'), () => {
            if (!PlayerModel.inst.isUnlocked(this.selectedId)) {
                oops.gui.toast(ViewKit.lang('select_locked'));
                return;
            }
            AppNav.startBattle(this.selectedId);
        });

        this.selectedId = Math.max(1, Math.min(PlayerModel.inst.getContinueLevel(), PlayerModel.inst.unlocked));
        void this.buildGrid();
        this.refreshDetail();
    }

    //#region 关卡卡片
    private async buildGrid(): Promise<void> {
        const grid = this.grid;
        if (grid == null) return;

        const levels = TableLevels.getSorted();
        for (let i = 0; i < levels.length; i++) {
            const level = levels[i];
            const col = i % 4;
            const row = Math.floor(i / 4);

            const card = await ViewKit.instantiatePrefab('gui/main/level_card', grid);
            if (card == null || !grid.isValid) return;

            card.setPosition(new Vec3(col * 164, -row * 128, 0));
            card.name = `level_${level.id}`;
            this.fillCard(level, card);

            const id = level.id;
            ViewKit.click(card, () => this.selectLevel(id));
            this.cards.set(id, {
                node: card,
                frame: card.getChildByName('frame'),
                bg: card.getChildByName('bg')?.getComponent(Sprite) ?? null,
            });
        }

        this.refreshCards();
    }

    private fillCard(level: ILevelConfig, card: Node): void {
        const unlocked = PlayerModel.inst.isUnlocked(level.id);
        const stars = PlayerModel.inst.getStars(level.id);

        ViewKit.text(card, 'index', String(level.id).padStart(2, '0'));
        ViewKit.text(card, 'name', ViewKit.levelName(level.id));
        ViewKit.text(card, 'lock', ViewKit.lang('select_locked'));
        ViewKit.visible(card, 'lock', !unlocked);

        const labels = ['star1', 'star2', 'star3'];
        for (let i = 0; i < labels.length; i++) {
            ViewKit.text(card, labels[i], i < stars ? '★' : '☆');
            const label = ViewKit.label(card, labels[i]);
            if (label != null) label.color = ViewKit.color(i < stars ? '#C8A15A' : (unlocked ? '#B9A98E' : '#7A6A55'));
        }

        ViewKit.tintPath(card, 'bg', unlocked ? '#FFFFFF' : '#6A6A6A');
        ViewKit.visible(card, 'frame', false);
    }

    private selectLevel(levelId: number): void {
        if (!PlayerModel.inst.isUnlocked(levelId)) return;
        this.selectedId = levelId;

        this.refreshCards();
        this.refreshDetail();

        const card = this.cards.get(levelId);
        if (card != null) {
            card.node.setScale(1, 1, 1);
            tween(card.node)
                .to(0.09, { scale: new Vec3(1.04, 1.04, 1) })
                .to(0.09, { scale: new Vec3(1, 1, 1) })
                .start();
        }
    }

    private refreshCards(): void {
        this.cards.forEach((card, id) => {
            if (card.frame != null) card.frame.active = id === this.selectedId;
        });
    }
    //#endregion

    //#region 详情
    private refreshDetail(): void {
        const detail = this.detail;
        if (detail == null) return;

        const level = TableLevels.get(this.selectedId);
        if (level == null) return;

        const stars = PlayerModel.inst.getStars(level.id);
        ViewKit.text(detail, 'detail_name', ViewKit.levelName(level.id));
        ViewKit.text(detail, 'detail_index', `STAGE ${String(level.id).padStart(2, '0')}`);

        const conditions = [
            { done: stars >= 1, text: ViewKit.lang('select_star1') },
            { done: stars >= 2, text: ViewKit.lang('select_star2', level.starTime) },
            { done: stars >= 3, text: ViewKit.lang('select_star3') },
        ];
        for (let i = 0; i < conditions.length; i++) {
            const cond = conditions[i];
            const path = `cond${i + 1}`;
            ViewKit.text(detail, path, `${cond.done ? '★' : '☆'}  ${cond.text}`);
            const label = ViewKit.label(detail, path);
            if (label != null) label.color = ViewKit.color(cond.done ? '#D9C08C' : '#B9A98E');
        }

        void this.fillChips(ViewKit.get(detail, 'enemies'), this.collectEnemyIds(level), 56, 66, -140);
        void this.fillChips(ViewKit.get(detail, 'units'), level.units, 48, 56, -140);
    }

    /** 用 chip 预制体填充缩略图（每次重建前清空旧实例） */
    private async fillChips(container: Node | null, ids: string[], size: number, step: number, startX: number): Promise<void> {
        if (container == null) return;

        const token = ++this.chipToken;
        container.children.slice().forEach((child) => {
            child.removeFromParent();
            child.destroy();
        });

        for (let i = 0; i < ids.length && i < 6; i++) {
            const config = TableUnits.get(ids[i]) ?? TableEnemies.get(ids[i]);
            if (config == null) continue;

            const chip = await ViewKit.instantiatePrefab('gui/main/chip', container);
            // 快速切换关卡时丢弃过期的填充结果
            if (chip == null || !container.isValid || token !== this.chipToken) return;

            chip.setPosition(new Vec3(startX + i * step, 0, 0));
            const scale = size / 56;
            chip.setScale(scale, scale, 1);

            ViewKit.tintPath(chip, 'bg', config.color, 235);
            ViewKit.text(chip, 'tag', config.tag);
        }
    }

    private collectEnemyIds(level: ILevelConfig): string[] {
        const result: string[] = [];
        for (const waveId of level.waves) {
            const wave = TableWaves.get(waveId);
            if (wave == null) continue;
            for (const group of wave.groups) {
                if (result.indexOf(group.enemy) < 0) result.push(group.enemy);
            }
        }
        return result;
    }
    //#endregion
}
