import { _decorator } from 'cc';
import { GameComponent } from 'db://oops-framework/module/common/GameComponent';
import { oops } from 'db://oops-framework/core/Oops';
import { UIID } from '../common/config/GameUIConfig';
import { ViewKit } from '../common/ui/ViewKit';
import { Battle } from '../battle/Battle';

const { ccclass } = _decorator;

/** 玩法说明弹层：打开时战斗暂停，关闭后继续 */
@ccclass('HelpViewComp')
export class HelpViewComp extends GameComponent {
    protected onLoad(): void {
        const root = this.node;

        ViewKit.text(root, 'panel/title', ViewKit.lang('help_title'));
        ViewKit.text(root, 'panel/goal', ViewKit.lang('help_goal'));
        ViewKit.text(root, 'panel/controls', ViewKit.lang('help_controls'));
        ViewKit.text(root, 'panel/terms', ViewKit.lang('help_terms'));
        ViewKit.text(root, 'panel/btn_close/label', ViewKit.lang('help_close'));

        ViewKit.click(ViewKit.get(root, 'panel/btn_close'), () => this.close());
    }

    private close(): void {
        oops.gui.remove(UIID.Help);
        Battle.current?.resume();
    }
}
