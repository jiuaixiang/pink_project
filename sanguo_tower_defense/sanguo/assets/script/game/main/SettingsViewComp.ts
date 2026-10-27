import { _decorator } from 'cc';
import { oops, version } from 'db://oops-framework/core/Oops';
import { GameComponent } from 'db://oops-framework/module/common/GameComponent';
import { UIID } from '../common/config/GameUIConfig';
import { PlayerModel } from '../common/model/PlayerModel';
import { SettingsModel } from '../common/model/SettingsModel';
import { AudioPath, AudioService } from '../common/ui/AudioService';
import { ViewKit } from '../common/ui/ViewKit';

const { ccclass } = _decorator;

/**
 * 设置弹层
 *
 * 开关与滑块均由预制体提供视觉，代码只负责读取/写回数值
 */
@ccclass('SettingsViewComp')
export class SettingsViewComp extends GameComponent {
    private clearConfirm = false;
    private clearTimer: (() => void) | null = null;

    protected onLoad(): void {
        const settings = SettingsModel.inst;

        ViewKit.bindSwitch(ViewKit.get(this.node, 'panel/music_switch'), settings.music, (v) => {
            settings.setMusic(v);
            if (v) AudioService.playMusic(AudioPath.Menu);
        });
        ViewKit.bindSwitch(ViewKit.get(this.node, 'panel/sfx_switch'), settings.sfx, (v) => {
            settings.setSfx(v);
            if (v) AudioService.playEffect(AudioPath.Click);
        });
        ViewKit.bindSwitch(ViewKit.get(this.node, 'panel/auto_switch'), settings.autoCollect, (v) => {
            settings.setAutoCollect(v);
        });
        ViewKit.bindSwitch(ViewKit.get(this.node, 'panel/speed_switch'), settings.speed >= 2, (v) => {
            settings.setSpeed(v ? 2 : 1);
        });

        ViewKit.bindSlider(ViewKit.get(this.node, 'panel/music_slider'), settings.musicVolume, (v) => settings.setMusicVolume(v));
        ViewKit.bindSlider(ViewKit.get(this.node, 'panel/sfx_slider'), settings.sfxVolume, (v) => settings.setSfxVolume(v));

        ViewKit.click(ViewKit.get(this.node, 'panel/btn_close'), () => this.close());
        ViewKit.click(ViewKit.get(this.node, 'panel/btn_lang'), () => {
            settings.toggleLanguage(() => this.refresh());
        });
        ViewKit.click(ViewKit.get(this.node, 'panel/btn_clear'), () => this.onClearSave());

        this.refresh();
        ViewKit.popIn(ViewKit.get(this.node, 'panel'));
    }

    /** 刷新文案（语言切换后调用） */
    private refresh(): void {
        const root = this.node;
        const settings = SettingsModel.inst;

        ViewKit.text(root, 'panel/title', ViewKit.lang('settings_title'));
        ViewKit.text(root, 'panel/music_label', ViewKit.lang('settings_music'));
        ViewKit.text(root, 'panel/sfx_label', ViewKit.lang('settings_sfx'));
        ViewKit.text(root, 'panel/auto_label', ViewKit.lang('settings_auto_collect'));
        ViewKit.text(root, 'panel/speed_label', ViewKit.lang('settings_default_speed'));
        ViewKit.text(root, 'panel/lang_label', ViewKit.lang('settings_language'));
        ViewKit.text(root, 'panel/btn_lang/label', settings.language === 'zh' ? '中文' : 'English');
        ViewKit.text(root, 'panel/btn_close/label', ViewKit.lang('settings_close'));
        ViewKit.text(root, 'panel/version', ViewKit.lang('settings_version', oops.config.game.version, version));

        if (this.clearConfirm) ViewKit.text(root, 'panel/btn_clear/label', ViewKit.lang('settings_clear_confirm'));
        else ViewKit.text(root, 'panel/btn_clear/label', ViewKit.lang('settings_clear'));

        ViewKit.refreshSwitch(ViewKit.get(root, 'panel/music_switch'), settings.music);
        ViewKit.refreshSwitch(ViewKit.get(root, 'panel/sfx_switch'), settings.sfx);
        ViewKit.refreshSwitch(ViewKit.get(root, 'panel/auto_switch'), settings.autoCollect);
        ViewKit.refreshSwitch(ViewKit.get(root, 'panel/speed_switch'), settings.speed >= 2);
    }

    /** 清档：二次确认，3 秒内未确认自动还原 */
    private onClearSave(): void {
        if (!this.clearConfirm) {
            this.clearConfirm = true;
            ViewKit.text(this.node, 'panel/btn_clear/label', ViewKit.lang('settings_clear_confirm'));
            this.clearTimer != null && this.clearTimer();
            this.clearTimer = this.later(() => {
                this.clearConfirm = false;
                ViewKit.text(this.node, 'panel/btn_clear/label', ViewKit.lang('settings_clear'));
            }, 3);
            return;
        }

        this.clearConfirm = false;
        this.clearTimer != null && this.clearTimer();
        this.clearTimer = null;
        PlayerModel.inst.reset();
        oops.gui.toast(ViewKit.lang('settings_cleared'));
        this.refresh();
    }

    /** 延时回调（组件销毁后自动失效） */
    private later(callback: () => void, delay: number): () => void {
        const handler = () => {
            if (this.node != null && this.node.isValid) callback();
        };
        this.scheduleOnce(handler, delay);
        return () => this.unschedule(handler);
    }

    private close(): void {
        oops.gui.remove(UIID.Settings);
    }

    protected onDestroy(): void {
        this.clearTimer = null;
        super.onDestroy();
    }
}
