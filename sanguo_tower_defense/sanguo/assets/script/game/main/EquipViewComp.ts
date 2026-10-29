import { _decorator, Node, Sprite, Vec3 } from 'cc';
import { GameComponent } from 'db://oops-framework/module/common/GameComponent';
import { oops } from 'db://oops-framework/core/Oops';
import { AppNav } from '../common/ui/AppNav';
import { ViewKit } from '../common/ui/ViewKit';
import { AudioPath, AudioService } from '../common/ui/AudioService';
import { PlayerModel } from '../common/model/PlayerModel';
import { PopupState } from '../common/model/PopupState';
import { GameEvent } from '../common/config/GameEvent';
import { EquipSlot } from '../common/table/ITable';
import type { IEquipConfig } from '../common/table/ITable';
import { TableEquips } from '../common/table/TableEquips';
import { TableUnits } from '../common/table/TableUnits';

const { ccclass } = _decorator;

interface SlotView {
    slot: EquipSlot;
    node: Node | null;
}

/**
 * 装备界面
 *
 * 左：武将列表（2 列）  右：四个槽位 + 属性汇总  下：背包
 * 交互：选武将 → 点槽位（进入挑选）→ 点背包装备；再点已装备槽位即卸下
 */
@ccclass('EquipViewComp')
export class EquipViewComp extends GameComponent {
    private unitId = '';
    private pickSlot: EquipSlot | null = null;
    private readonly rows = new Map<string, Node>();
    private slots: SlotView[] = [];
    private bagToken = 0;

    protected onLoad(): void {
        this.bindStatic();
        this.buildUnits();
        this.buildSlots();
        this.selectUnit(TableUnits.all()[0]?.id ?? '');
        // 详情弹层里装备/卸下后，靠存档事件回刷新
        oops.message.on(GameEvent.SaveChanged, this.onSaveChanged, this);
    }

    protected onDestroy(): void {
        oops.message.off(GameEvent.SaveChanged, this.onSaveChanged, this);
        super.onDestroy();
    }

    private onSaveChanged(): void {
        if (!this.node.isValid) return;
        this.refreshPanel();
        this.refreshUnitMarks();
        void this.buildBag();
    }

    private bindStatic(): void {
        const root = this.node;
                        
        ViewKit.click(ViewKit.get(root, 'btn_back'), () => AppNav.backToMain());

        this.slots = [
            this.slotView(EquipSlot.Weapon, 'panel/slot_weapon'),
            this.slotView(EquipSlot.Armor, 'panel/slot_armor'),
            this.slotView(EquipSlot.Horse, 'panel/slot_horse'),
            this.slotView(EquipSlot.Treasure, 'panel/slot_treasure'),
        ];

        for (const view of this.slots) {
            ViewKit.click(view.node, () => this.onSlot(view.slot));
        }
    }

    private slotView(slot: EquipSlot, path: string): SlotView {
        return { slot, node: ViewKit.get(this.node, path) };
    }

    /** 左侧武将行 */
    private async buildUnits(): Promise<void> {
        const layer = ViewKit.get(this.node, 'unit_list');
        if (layer == null) return;

        // 预制体里带示例行（编辑器预览用），填充前先清空
        layer.children.slice().forEach((child) => {
            child.removeFromParent();
            child.destroy();
        });

        const ids = TableUnits.all().map((cfg) => cfg.id);
        for (let i = 0; i < ids.length && i < 24; i++) {
            const node = await ViewKit.instantiatePrefab('gui/main/equip_row', layer);
            if (node == null || !layer.isValid) return;

            const col = i % 2;
            const row = Math.floor(i / 2);
            node.setPosition(new Vec3(col === 0 ? -95 : 95, 230 - row * 42, 0));

            const unitId = ids[i];
            ViewKit.text(node, 'name', ViewKit.lang(TableUnits.get(unitId)!.nameKey));
            this.rows.set(unitId, node);
            ViewKit.click(node, () => this.selectUnit(unitId));
        }

        this.refreshUnitMarks();
    }

    private selectUnit(unitId: string): void {
        if (unitId === '') return;
        this.unitId = unitId;
        this.pickSlot = null;
        AudioService.playEffect(AudioPath.Click);

        this.refreshUnitMarks();
        this.refreshPanel();
        void this.buildBag();
    }

    private refreshUnitMarks(): void {
        for (const [unitId, node] of this.rows) {
            const worn = PlayerModel.inst.wearingOf(unitId);
            const count = Object.keys(worn).length;
            ViewKit.text(node, 'mark', count > 0 ? ViewKit.lang('equip_worn', count) : '');
            const bg = node.getChildByName('bg')?.getComponent(Sprite);
            if (bg != null) bg.color = ViewKit.color(unitId === this.unitId ? '#4A3A26' : '#FFFFFF');
        }
    }

    /** 右侧槽位与属性 */
    private refreshPanel(): void {
        const cfg = TableUnits.get(this.unitId);
        if (cfg == null) return;

        ViewKit.text(this.node, 'panel/unit_name', ViewKit.lang(cfg.nameKey));
        ViewKit.text(this.node, 'panel/unit_kind', ViewKit.lang(`kind_${cfg.kind}`));

        const worn = PlayerModel.inst.wearingOf(this.unitId);
        for (const view of this.slots) {
            const equipId = worn[view.slot];
            const equip = equipId != null ? TableEquips.get(equipId) : null;
            const path = `panel/slot_${view.slot}`;

            ViewKit.text(this.node, `${path}/value`, equip != null ? ViewKit.lang(equip.nameKey) : ViewKit.lang('equip_none'));

            const valueLabel = ViewKit.label(this.node, `${path}/value`);
            if (valueLabel != null) valueLabel.color = ViewKit.color(equip != null ? '#F4D98A' : '#8C8272');
        }

        const stats = PlayerModel.inst.statsOf(this.unitId);
        const parts: string[] = [];
        if (stats.atkPct > 0) parts.push(ViewKit.lang('equip_stat_atk', Math.round(stats.atkPct * 100)));
        if (stats.hpPct > 0) parts.push(ViewKit.lang('equip_stat_hp', Math.round(stats.hpPct * 100)));
        if (stats.aspd > 0) parts.push(ViewKit.lang('equip_stat_aspd', Math.round(stats.aspd * 100)));
        if (stats.critPct > 0) parts.push(ViewKit.lang('equip_stat_crit', Math.round(stats.critPct * 100)));
        if (stats.cdReduce > 0) parts.push(ViewKit.lang('equip_stat_cd', stats.cdReduce.toFixed(1)));
        ViewKit.text(this.node, 'panel/stats', parts.length > 0 ? parts.join('   ') : ViewKit.lang('equip_no_stats'));
    }

    /** 点击槽位：已装备则卸下，否则进入挑选 */
    private onSlot(slot: EquipSlot): void {
        if (this.unitId === '') return;

        if (this.pickSlot === slot) {
            this.pickSlot = null;
            this.refreshPanel();
            void this.buildBag();
            return;
        }

        const worn = PlayerModel.inst.wearingOf(this.unitId);
        if (worn[slot] != null) {
            PlayerModel.inst.unequip(this.unitId, slot);
            AudioService.playEffect(AudioPath.Click);
            this.refreshPanel();
            this.refreshUnitMarks();
            void this.buildBag();
            return;
        }

        this.pickSlot = slot;
        AudioService.playEffect(AudioPath.Click);
        void this.buildBag();
    }

    /** 底部背包 */
    private async buildBag(): Promise<void> {
        const layer = ViewKit.get(this.node, 'bag_list');
        if (layer == null) return;

        const token = ++this.bagToken;
        layer.children.slice().forEach((child) => {
            child.removeFromParent();
            child.destroy();
        });

        const bag = PlayerModel.inst.bag;
        ViewKit.text(this.node, 'bag_count', ViewKit.lang('equip_bag_count', bag.length));

        if (bag.length === 0 && this.pickSlot == null) {
            oops.gui.toast(ViewKit.lang('equip_empty'));
        }

        for (let i = 0; i < bag.length && i < 20; i++) {
            const cfg = TableEquips.get(bag[i]);
            if (cfg == null) continue;

            const node = await ViewKit.instantiatePrefab('gui/main/equip_item', layer);
            if (node == null || !layer.isValid || token !== this.bagToken) return;

            const col = i % 5;
            const row = Math.floor(i / 5);
            node.setPosition(new Vec3((col - 2) * 106, 66 - row * 46, 0));

            ViewKit.text(node, 'name', ViewKit.lang(cfg.nameKey));
            ViewKit.text(node, 'tier', `T${cfg.tier}`);

            // 挑选槽位时，不匹配的装备置灰
            const matched = this.pickSlot == null || cfg.slot === this.pickSlot;
            const bg = node.getChildByName('bg')?.getComponent(Sprite);
            if (bg != null) bg.color = ViewKit.color(matched ? '#FFFFFF' : '#6E6E6E');

            ViewKit.click(node, () => this.onPickItem(cfg, matched));
        }
    }

    /** 点背包条目：打开词条详情，装备/卸下由详情弹层完成 */
    private onPickItem(cfg: IEquipConfig, matched: boolean): void {
        if (this.unitId === '') return;

        if (!matched) {
            oops.gui.toast(ViewKit.lang('equip_slot_mismatch'));
            return;
        }

        PopupState.openEquipDetail(this.unitId, cfg.id);
    }
}
