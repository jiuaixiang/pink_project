import { _decorator, Node } from 'cc';
import { GameComponent } from 'db://oops-framework/module/common/GameComponent';
import { PlayerModel } from '../common/model/PlayerModel';
import { SettingsModel } from '../common/model/SettingsModel';
import { TableValidator } from '../common/table/TableValidator';
import { AudioPath, AudioService } from '../common/ui/AudioService';
import { AppNav } from '../common/ui/AppNav';
import { ViewKit } from '../common/ui/ViewKit';

const { ccclass } = _decorator;

/**
 * 主界面
 *
 * 界面结构完全来自 gui/main/main.prefab：
 * - 文案与数值由预制体上的 LanguageLabel（多语言）与 VMLabel/VMState（MVVM）自动更新，
 *   本类不再手动刷新文本，只负责校验数据、音频、交互绑定与入场动画。
 */
@ccclass('MainViewComp')
export class MainViewComp extends GameComponent {
    protected onLoad(): void {
        TableValidator.validate();
        AudioService.apply();
        AudioService.playMusic(AudioPath.Menu);

        this.bindNavigation();
        this.playIntro();
    }

    /** 逐块入场动画（只改变预制体节点的缩放） */
    private playIntro(): void {
        const cards = ['btn_continue', 'card_levels', 'card_equip', 'card_codex', 'card_settings'];
        for (const name of cards) {
            const node = ViewKit.get(this.node, name);
            if (node != null) ViewKit.popIn(node);
        }
    }

    /** 绑定交互 */
    private bindNavigation(): void {
        const root = this.node;

        ViewKit.click(ViewKit.get(root, 'btn_continue'), () => {
            AppNav.openDraft(PlayerModel.inst.getContinueLevel());
        });
        ViewKit.click(ViewKit.get(root, 'card_levels'), () => AppNav.openLevelSelect());
        ViewKit.click(ViewKit.get(root, 'card_equip'), () => AppNav.openEquip());
        ViewKit.click(ViewKit.get(root, 'card_codex'), () => AppNav.openCodex());
        ViewKit.click(ViewKit.get(root, 'card_settings'), () => AppNav.openSettings());

        const lang = ViewKit.get(root, 'lang');
        if (lang != null) {
            // 原地切换语言：框架 updateLanguage 刷新 LanguageLabel，
            // MainViewModel 监听 LanguageChanged 刷新动态文本，无需销毁重开界面
            lang.on(Node.EventType.TOUCH_END, () => {
                SettingsModel.inst.toggleLanguage();
            });
        }
    }
}
