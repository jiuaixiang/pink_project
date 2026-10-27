import { _decorator } from 'cc';
import { GameComponent } from 'db://oops-framework/module/common/GameComponent';
import { oops } from 'db://oops-framework/core/Oops';
import { UIID } from '../../common/config/GameUIConfig';
import { ViewKit } from '../../common/ui/ViewKit';
import { PlayerModel } from '../../common/model/PlayerModel';
import { TableUnits } from '../../common/table/TableUnits';
import { PopupState } from '../../common/model/PopupState';
import { Battle } from '../Battle';

const { ccclass } = _decorator;

/** 卡片长按详情：属性 + 天赋 + 装备加成 */
@ccclass('UnitDetailViewComp')
export class UnitDetailViewComp extends GameComponent {
    protected onLoad(): void {
        const cfg = TableUnits.get(PopupState.getUnitId());
        if (cfg == null) {
            oops.gui.remove(UIID.UnitDetail);
            return;
        }

        const root = this.node;
        const stats = PlayerModel.inst.statsOf(cfg.id);

        ViewKit.text(root, 'panel/name', ViewKit.lang(cfg.nameKey));
        ViewKit.text(root, 'panel/kind', `${ViewKit.lang(`kind_${cfg.kind}`)} · ${cfg.tag}`);

        const hp = Math.round(cfg.hp * (1 + stats.hpPct));
        ViewKit.text(root, 'panel/stat1', `${ViewKit.lang('codex_hp')}  ${hp}`);
        ViewKit.text(root, 'panel/stat2', `${ViewKit.lang('codex_cost')}  ${cfg.cost}`);
        ViewKit.text(root, 'panel/stat3', `${ViewKit.lang('codex_cooldown')}  ${cfg.cooldown}s`);
        ViewKit.text(root, 'panel/stat4', cfg.atk != null && cfg.atk > 0
            ? `${ViewKit.lang('codex_atk')}  ${cfg.atk}   ${ViewKit.lang('codex_interval')} ${cfg.interval ?? 0}s`
            : '');
        ViewKit.text(root, 'panel/stat5', stats.atkPct + stats.hpPct + stats.aspd + stats.critPct > 0
            ? ViewKit.lang('equip_stat_atk', Math.round(stats.atkPct * 100)) + '   '
                + ViewKit.lang('equip_stat_hp', Math.round(stats.hpPct * 100)) + '   '
                + ViewKit.lang('equip_stat_aspd', Math.round(stats.aspd * 100))
            : '');

        ViewKit.text(root, 'panel/talent_name', cfg.talent != null
            ? `${ViewKit.lang('codex_talent')}【${cfg.talent.name}】`
            : ViewKit.lang('detail_no_talent'));
        ViewKit.text(root, 'panel/talent_desc', ViewKit.lang(cfg.descKey));
        ViewKit.text(root, 'panel/btn_close/label', ViewKit.lang('detail_close'));

        ViewKit.click(ViewKit.get(root, 'panel/btn_close'), () => this.close());
    }

    private close(): void {
        oops.gui.remove(UIID.UnitDetail);
        Battle.current?.resume();
    }
}
