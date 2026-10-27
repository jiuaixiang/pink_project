import { _decorator } from 'cc';
import { GameComponent } from 'db://oops-framework/module/common/GameComponent';
import { oops } from 'db://oops-framework/core/Oops';
import { UIID } from '../common/config/GameUIConfig';
import { ViewKit } from '../common/ui/ViewKit';
import { PopupState } from '../common/model/PopupState';
import { PlayerModel } from '../common/model/PlayerModel';
import { TableEquips } from '../common/table/TableEquips';

const { ccclass } = _decorator;

/** 装备词条详情：属性、描述、装备 / 卸下 */
@ccclass('EquipDetailViewComp')
export class EquipDetailViewComp extends GameComponent {
    private unitId = '';
    private equipId = '';

    protected onLoad(): void {
        this.unitId = PopupState.getEquipUnitId();
        this.equipId = PopupState.getEquipId();

        const cfg = TableEquips.get(this.equipId);
        if (cfg == null) {
            oops.gui.remove(UIID.EquipDetail);
            return;
        }

        const root = this.node;
        ViewKit.text(root, 'panel/name', ViewKit.lang(cfg.nameKey));
        ViewKit.text(root, 'panel/meta', `${ViewKit.lang('equip_tier', cfg.tier)} · ${ViewKit.lang(`equip_slot_${cfg.slot}`)}`);
        ViewKit.text(root, 'panel/desc', ViewKit.lang(cfg.descKey));

        // 词条逐条落到预制体的 line1~line4
        const lines: string[] = [];
        if ((cfg.atkPct ?? 0) > 0) lines.push(ViewKit.lang('equip_stat_atk', Math.round((cfg.atkPct ?? 0) * 100)));
        if ((cfg.hpPct ?? 0) > 0) lines.push(ViewKit.lang('equip_stat_hp', Math.round((cfg.hpPct ?? 0) * 100)));
        if ((cfg.aspd ?? 0) > 0) lines.push(ViewKit.lang('equip_stat_aspd', Math.round((cfg.aspd ?? 0) * 100)));
        if ((cfg.critPct ?? 0) > 0) lines.push(ViewKit.lang('equip_stat_crit', Math.round((cfg.critPct ?? 0) * 100)));
        if ((cfg.cdReduce ?? 0) > 0) lines.push(ViewKit.lang('equip_stat_cd', (cfg.cdReduce ?? 0).toFixed(2)));
        for (let i = 0; i < 4; i++) {
            ViewKit.text(root, `panel/line${i + 1}`, lines[i] ?? '');
        }

        const worn = PlayerModel.inst.wearingOf(this.unitId)[cfg.slot] === cfg.id;
        ViewKit.text(root, 'panel/status', ViewKit.lang(worn ? 'equip_status_worn' : 'equip_status_idle'));
        ViewKit.text(root, 'panel/btn_action/label', ViewKit.lang(worn ? 'equip_action_unequip' : 'equip_action_equip'));
        ViewKit.text(root, 'panel/btn_close/label', ViewKit.lang('detail_close'));

        ViewKit.click(ViewKit.get(root, 'panel/btn_action'), () => {
            if (worn) {
                PlayerModel.inst.unequip(this.unitId, cfg.slot);
            }
            else {
                PlayerModel.inst.equipItem(this.unitId, cfg.id);
            }
            this.close();
        });
        ViewKit.click(ViewKit.get(root, 'panel/btn_close'), () => this.close());
    }

    private close(): void {
        oops.gui.remove(UIID.EquipDetail);
    }
}
