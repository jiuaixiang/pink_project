import { _decorator, Node } from 'cc';
import { oops } from 'db://oops-framework/core/Oops';
import { GameComponent } from 'db://oops-framework/module/common/GameComponent';
import { UIID } from '../common/config/GameUIConfig';
import { PlayerModel } from '../common/model/PlayerModel';
import { SettingsModel } from '../common/model/SettingsModel';
import { TableLevels } from '../common/table/TableLevels';
import { TableValidator } from '../common/table/TableValidator';
import { AudioPath, AudioService } from '../common/ui/AudioService';
import { AppNav } from '../common/ui/AppNav';
import { ViewKit } from '../common/ui/ViewKit';

const { ccclass } = _decorator;

/**
 * 主界面
 *
 * 界面结构完全来自 gui/main/main.prefab，本类只负责绑定节点与刷新文本/数值
 */
@ccclass('MainViewComp')
export class MainViewComp extends GameComponent {
    protected onLoad(): void {
        TableValidator.validate();
        AudioService.apply();
        AudioService.playMusic(AudioPath.Menu);

        this.bindNavigation();
        this.refresh();
    }

    /** 刷新所有文案与统计 */
    private refresh(): void {
        const root = this.node;
        const player = PlayerModel.inst;
        const level = player.getContinueLevel();

        ViewKit.text(root, 'title', ViewKit.lang('app_title'));
        ViewKit.text(root, 'subtitle', ViewKit.lang('app_subtitle'));
        ViewKit.text(root, 'chapter', `${ViewKit.lang('select_title')} · ${TableLevels.count}`);

        ViewKit.text(root, 'btn_continue/label_main', ViewKit.lang('main_continue'));
        ViewKit.text(root, 'btn_continue/label_tip', ViewKit.lang('main_continue_tip', level, ViewKit.levelName(level)));

        ViewKit.text(root, 'stat_clears', `${player.clearedCount}/${player.levelCount}`);
        ViewKit.text(root, 'stat_clears_cap', ViewKit.lang('main_stat_clears'));
        ViewKit.text(root, 'stat_stars', `${player.totalStars}/${player.maxStars}`);
        ViewKit.text(root, 'stat_stars_cap', ViewKit.lang('main_stat_stars'));
        ViewKit.text(root, 'stat_kills', String(player.kills));
        ViewKit.text(root, 'stat_kills_cap', ViewKit.lang('main_stat_kills'));

        ViewKit.text(root, 'card_levels/title', ViewKit.lang('main_levels'));
        ViewKit.text(root, 'card_levels/tip', ViewKit.lang('main_levels_tip'));
        ViewKit.text(root, 'card_equip/title', ViewKit.lang('main_equip'));
        ViewKit.text(root, 'card_equip/tip', ViewKit.lang('main_equip_tip'));
        ViewKit.text(root, 'card_codex/title', ViewKit.lang('main_codex'));
        ViewKit.text(root, 'card_codex/tip', ViewKit.lang('main_codex_tip'));
        ViewKit.text(root, 'card_settings/title', ViewKit.lang('main_settings'));
        ViewKit.text(root, 'card_settings/tip', ViewKit.lang('main_settings_tip'));

        const allClear = player.levelCount > 0 && player.clearedCount >= player.levelCount;
        ViewKit.visible(root, 'all_clear', allClear);
        if (allClear) ViewKit.text(root, 'all_clear', ViewKit.lang('main_all_clear'));

        // 无尽最佳波数
        const best = player.bestWave;
        ViewKit.visible(root, 'best_wave', best > 0);
        if (best > 0) ViewKit.text(root, 'best_wave', ViewKit.lang('main_best_wave', best));

        ViewKit.text(root, 'version', `${ViewKit.lang('app_version')} ${oops.config.game.version}`);
        ViewKit.text(root, 'lang', SettingsModel.inst.language === 'zh' ? '中文 / EN' : 'EN / 中文');

        // 逐块入场动画（只改变预制体节点的缩放）
        const cards = ['btn_continue', 'card_levels', 'card_equip', 'card_codex', 'card_settings'];
        for (const name of cards) {
            const node = ViewKit.get(root, name);
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
            lang.on(Node.EventType.TOUCH_END, () => {
                SettingsModel.inst.toggleLanguage(() => {
                    oops.gui.remove(UIID.Main);
                    AppNav.openMain();
                });
            });
        }
    }
}
