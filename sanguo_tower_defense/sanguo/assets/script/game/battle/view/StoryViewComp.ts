import { _decorator } from 'cc';
import { GameComponent } from 'db://oops-framework/module/common/GameComponent';
import { oops } from 'db://oops-framework/core/Oops';
import { UIID } from '../../common/config/GameUIConfig';
import { ViewKit } from '../../common/ui/ViewKit';
import { TableStories } from '../../common/table/TableStories';
import { PopupState } from '../../common/model/PopupState';
import { Battle } from '../Battle';

const { ccclass } = _decorator;

/**
 * 剧情对话弹层
 *
 * 打开时战斗暂停，点击任意处逐句推进，播完自动关闭并恢复战斗。
 */
@ccclass('StoryViewComp')
export class StoryViewComp extends GameComponent {
    private index = 0;
    private lineCount = 0;

    protected onLoad(): void {
        const story = TableStories.story(PopupState.getStoryId());
        this.lineCount = story != null ? story.lines.length : 0;
        this.index = 0;

        ViewKit.text(this.node, 'panel/tap', ViewKit.lang('story_tap'));
        ViewKit.text(this.node, 'btn_skip/label', ViewKit.lang('story_skip'));

        ViewKit.click(ViewKit.get(this.node, 'dim'), () => this.next());
        ViewKit.click(ViewKit.get(this.node, 'panel'), () => this.next());
        ViewKit.click(ViewKit.get(this.node, 'btn_skip'), () => this.close());

        this.render();
    }

    private render(): void {
        const story = TableStories.story(PopupState.getStoryId());
        if (story == null || this.index >= story.lines.length) {
            this.close();
            return;
        }

        const line = story.lines[this.index];
        const who = ViewKit.lang(line.who);
        ViewKit.text(this.node, 'panel/speaker', who === 'story_narrator' ? '' : who);
        ViewKit.text(this.node, 'panel/text', ViewKit.lang(line.text));
    }

    private next(): void {
        this.index += 1;
        if (this.index >= this.lineCount) {
            this.close();
            return;
        }
        this.render();
    }

    private close(): void {
        const done = PopupState.takeStoryDone();

        oops.gui.remove(UIID.Story);
        Battle.current?.resume();
        done?.();
    }
}
