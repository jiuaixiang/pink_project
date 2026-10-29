import { _decorator, Node, Vec3, tween } from 'cc';
import { oops } from 'db://oops-framework/core/Oops';
import { GameComponent } from 'db://oops-framework/module/common/GameComponent';
import { UIID } from '../../common/config/GameUIConfig';
import { PlayerModel } from '../../common/model/PlayerModel';
import { TableEquips } from '../../common/table/TableEquips';
import { TableLevels } from '../../common/table/TableLevels';
import { AppNav } from '../../common/ui/AppNav';
import { ViewKit } from '../../common/ui/ViewKit';
import type { IBattleSummary } from '../Battle';

const { ccclass } = _decorator;

/** 战斗结算弹层：星级、用时、解锁提示与后续操作 */
@ccclass('ResultViewComp')
export class ResultViewComp extends GameComponent {
    private summary: IBattleSummary | null = null;

    onAdded(data?: IBattleSummary): void {
        if (data != null) this.summary = data;
    }

    protected onLoad(): void {
        const summary = this.summary;
        const root = this.node;

        if (summary == null) {
            console.error('[三国塔防] 结算数据缺失');
            AppNav.backToMain();
            return;
        }

        const win = summary.win;
        ViewKit.text(root, 'panel/title', ViewKit.lang(win ? 'result_win' : 'result_lose'));
        const titleLabel = ViewKit.label(root, 'panel/title');
        if (titleLabel != null) titleLabel.color = ViewKit.color(win ? '#C8A15A' : '#C0392B');

        ViewKit.text(root, 'panel/level_name', ViewKit.levelName(summary.levelId));
        if (summary.wave != null) {
            ViewKit.text(root, 'panel/time', ViewKit.lang('result_wave', summary.wave));
        }
        else {
            ViewKit.text(root, 'panel/time', ViewKit.lang('result_time', Math.round(summary.time)));
        }

        // 星级展示
        const starNames = ['panel/star1', 'panel/star2', 'panel/star3'];
        for (let i = 0; i < starNames.length; i++) {
            const path = starNames[i];
            const earned = i < summary.stars;
            ViewKit.text(root, path, earned ? '★' : '☆');
            const label = ViewKit.label(root, path);
            if (label != null) label.color = ViewKit.color(earned ? '#C8A15A' : '#7A6A55');
            this.animateStar(ViewKit.get(root, path), earned, i * 0.12);
        }

        // 解锁提示
        if (win && summary.unlocked > 0) {
            ViewKit.text(root, 'panel/unlock', ViewKit.lang('result_unlock', summary.unlocked));
            ViewKit.visible(root, 'panel/unlock', true);
        }
        else if (win) {
            const next = TableLevels.getNext(summary.levelId);
            ViewKit.text(root, 'panel/unlock', next == null ? ViewKit.lang('result_no_unlock') : '');
            ViewKit.visible(root, 'panel/unlock', next == null);
        }
        else {
            ViewKit.text(root, 'panel/unlock', ViewKit.lang('result_lose_tip'));
            ViewKit.visible(root, 'panel/unlock', true);
        }

        // 装备掉落 / 无尽最佳波数
        if (summary.equip != null) {
            const equip = TableEquips.get(summary.equip);
            ViewKit.text(root, 'panel/drop', ViewKit.lang('result_equip_drop', equip != null ? ViewKit.lang(equip.nameKey) : summary.equip));
            ViewKit.visible(root, 'panel/drop', true);
        }
        else if (summary.wave != null) {
            ViewKit.text(root, 'panel/drop', ViewKit.lang('result_best', PlayerModel.inst.bestWave));
            ViewKit.visible(root, 'panel/drop', true);
        }
        else {
            ViewKit.visible(root, 'panel/drop', false);
        }

        // 按钮
                        
        const nextLevel = TableLevels.getNext(summary.levelId);
        const canNext = win && (summary.unlocked > 0 || (nextLevel != null && nextLevel.id <= summary.levelId + 1));
        ViewKit.visible(root, 'panel/btn_next', canNext);

        ViewKit.click(ViewKit.get(root, 'panel/btn_retry'), () => {
            oops.gui.remove(UIID.Result);
            AppNav.restartBattle(summary.levelId);
        });
        ViewKit.click(ViewKit.get(root, 'panel/btn_next'), () => {
            const target = summary.unlocked > 0 ? summary.unlocked : (nextLevel != null ? nextLevel.id : summary.levelId);
            oops.gui.remove(UIID.Result);
            AppNav.startBattle(target);
        });
        ViewKit.click(ViewKit.get(root, 'panel/btn_home'), () => {
            oops.gui.remove(UIID.Result);
            AppNav.backToMain();
        });

        ViewKit.popIn(ViewKit.get(root, 'panel'));
    }

    /** 星星逐个点亮动画 */
    private animateStar(node: Node | null, earned: boolean, delay: number): void {
        if (node == null) return;
        node.setScale(earned ? 0.2 : 1, earned ? 0.2 : 1, 1);
        if (!earned) return;

        tween(node)
            .delay(delay)
            .to(0.22, { scale: new Vec3(1.35, 1.35, 1) }, { easing: 'quadOut' })
            .to(0.12, { scale: new Vec3(1, 1, 1) })
            .start();
    }
}
