import { _decorator, Node, Sprite, Vec3 } from 'cc';
import { GameComponent } from 'db://oops-framework/module/common/GameComponent';
import { oops } from 'db://oops-framework/core/Oops';
import { UIID } from '../common/config/GameUIConfig';
import { AppNav } from '../common/ui/AppNav';
import { ViewKit } from '../common/ui/ViewKit';
import { AudioPath, AudioService } from '../common/ui/AudioService';
import { DraftModel } from '../common/model/DraftModel';
import { PlayerModel } from '../common/model/PlayerModel';
import { DraftViewModel } from './DraftViewModel';
import { TableLevels } from '../common/table/TableLevels';
import { TableUnits } from '../common/table/TableUnits';

const { ccclass } = _decorator;

/** 本局最多可带出战的武将数 */
const MAX_DECK = 8;

/**
 * 选将界面
 *
 * 从本关可用武将里挑选最多 8 名进入卡槽，战斗只出所选武将；
 * 不选时默认带前 8 名，保证直接点「出阵」也能开打。
 */
@ccclass('DraftViewComp')
export class DraftViewComp extends GameComponent {
    private levelId = 0;
    private pool: string[] = [];
    private readonly selected = new Set<string>();
    private readonly items = new Map<string, Node>();
    private vm: DraftViewModel | null = null;

    protected onLoad(): void {
        this.levelId = DraftModel.getPending();
        const level = TableLevels.get(this.levelId);
        if (level == null) {
            AppNav.backToMain();
            return;
        }

        // 选将池只展示已获得的武将 / 器械（引导授予、选将、通关收入花名册），
        // 未获得的单位（如尚未通关获取到的拒马）不会出现在可选列表中
        this.pool = level.units.filter((id) => PlayerModel.inst.isUnitUnlocked(id)).slice(0, 12);

        // 文案与计数由预制体上的 LanguageLabel / VMLabel 绑定刷新
        const root = this.node;
        this.vm = this.node.getComponent(DraftViewModel);
        this.syncVm();

        const previous = DraftModel.getDeck(level.id);
        const preset = previous ?? this.pool.slice(0, Math.min(MAX_DECK, this.pool.length));
        for (const unitId of preset) {
            if (this.pool.indexOf(unitId) >= 0) this.selected.add(unitId);
        }

        ViewKit.click(ViewKit.get(root, 'btn_back'), () => {
            oops.gui.remove(UIID.Draft);
        });
        ViewKit.click(ViewKit.get(root, 'btn_all'), () => {
            this.selected.clear();
            for (const unitId of this.pool.slice(0, MAX_DECK)) this.selected.add(unitId);
            this.refresh();
        });
        ViewKit.click(ViewKit.get(root, 'btn_clear'), () => {
            this.selected.clear();
            this.refresh();
        });
        ViewKit.click(ViewKit.get(root, 'btn_start'), () => this.onStart());

        void this.buildGrid();
    }

    private async buildGrid(): Promise<void> {
        const layer = ViewKit.get(this.node, 'grid');
        if (layer == null) return;

        // 预制体里带示例条目（编辑器预览用），填充前先清空
        layer.children.slice().forEach((child) => {
            child.removeFromParent();
            child.destroy();
        });

        for (let i = 0; i < this.pool.length; i++) {
            const unitId = this.pool[i];
            const cfg = TableUnits.get(unitId);
            if (cfg == null) continue;

            const node = await ViewKit.instantiatePrefab('gui/main/draft_item', layer);
            if (node == null || !layer.isValid) return;

            const col = i % 6;
            const row = Math.floor(i / 6);
            node.setPosition(new Vec3((col - 2.5) * 164, 60 - row * 120, 0));

            ViewKit.text(node, 'name', ViewKit.lang(cfg.nameKey));
            ViewKit.text(node, 'cost', `${cfg.cost}`);
            ViewKit.tintPath(node, 'chip', cfg.color);
            ViewKit.text(node, 'tag', cfg.tag);

            this.items.set(unitId, node);
            ViewKit.click(node, () => this.toggle(unitId));
        }

        this.refresh();
    }

    private toggle(unitId: string): void {
        if (this.selected.has(unitId)) {
            this.selected.delete(unitId);
        }
        else if (this.selected.size >= MAX_DECK) {
            oops.gui.toast(ViewKit.lang('draft_full', MAX_DECK));
            return;
        }
        else {
            this.selected.add(unitId);
        }
        this.refresh();
    }

    private refresh(): void {
        for (const [unitId, node] of this.items) {
            const on = this.selected.has(unitId);
            ViewKit.visible(node, 'frame', on);
            ViewKit.visible(node, 'check', on);
            const bg = node.getChildByName('bg')?.getComponent(Sprite);
            if (bg != null) bg.color = ViewKit.color(on ? '#FFFFFF' : '#8C8C8C');
        }
        this.syncVm();
    }

    /** 把关卡名与已选计数写入 MVVM 数据源，VMLabel 自动刷新 */
    private syncVm(): void {
        const level = TableLevels.get(this.levelId);
        this.vm?.sync(
            level != null ? ViewKit.levelName(level.id) : '',
            ViewKit.lang('draft_count', this.selected.size, MAX_DECK),
        );
    }

    private onStart(): void {
        if (this.levelId <= 0) return;
        if (this.selected.size === 0) {
            oops.gui.toast(ViewKit.lang('draft_empty'));
            return;
        }

        const deck = this.pool.filter((id) => this.selected.has(id));
        DraftModel.setDeck(this.levelId, deck);
        AudioService.playEffect(AudioPath.Click);

        oops.gui.remove(UIID.Draft);
        oops.gui.remove(UIID.LevelSelect);
        AppNav.startBattle(this.levelId);
    }
}
