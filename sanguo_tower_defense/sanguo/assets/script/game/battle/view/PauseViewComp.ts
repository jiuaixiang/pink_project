import { _decorator } from 'cc';
import { oops } from 'db://oops-framework/core/Oops';
import { GameComponent } from 'db://oops-framework/module/common/GameComponent';
import { UIID } from '../../common/config/GameUIConfig';
import { AppNav } from '../../common/ui/AppNav';
import { ViewKit } from '../../common/ui/ViewKit';
import { Battle } from '../Battle';

const { ccclass } = _decorator;

/** 暂停弹层：继续 / 重开 / 设置 / 返回主界面 */
@ccclass('PauseViewComp')
export class PauseViewComp extends GameComponent {
    private levelId = 0;

    /** 框架在界面加入舞台前回调，用于接收打开参数 */
    onAdded(data?: { levelId?: number }): void {
        if (data != null && typeof data.levelId === 'number') this.levelId = data.levelId;
    }

    protected onLoad(): void {
        const root = this.node;
        if (this.levelId <= 0 && Battle.current != null) this.levelId = Battle.current.levelId;

        ViewKit.text(root, 'panel/title', ViewKit.lang('pause_title'));
        ViewKit.text(root, 'panel/btn_resume/label', ViewKit.lang('pause_resume'));
        ViewKit.text(root, 'panel/btn_restart/label', ViewKit.lang('pause_restart'));
        ViewKit.text(root, 'panel/btn_settings/label', ViewKit.lang('pause_settings'));
        ViewKit.text(root, 'panel/btn_quit/label', ViewKit.lang('pause_quit'));

        const battle = Battle.current;
        const model = battle?.model ?? null;
        if (model != null) {
            ViewKit.text(root, 'panel/wave_text', ViewKit.lang('battle_wave', model.waveNumber, model.waves.length));
        }

        ViewKit.click(ViewKit.get(root, 'panel/btn_resume'), () => {
            oops.gui.remove(UIID.Pause);
            battle?.resume();
        });
        ViewKit.click(ViewKit.get(root, 'panel/btn_restart'), () => {
            oops.gui.remove(UIID.Pause);
            AppNav.restartBattle(this.levelId);
        });
        ViewKit.click(ViewKit.get(root, 'panel/btn_settings'), () => {
            AppNav.openSettings();
        });
        ViewKit.click(ViewKit.get(root, 'panel/btn_quit'), () => {
            oops.gui.remove(UIID.Pause);
            AppNav.backToMain();
        });

        ViewKit.popIn(ViewKit.get(root, 'panel'));
    }
}
