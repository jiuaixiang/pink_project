import { oops } from 'db://oops-framework/core/Oops';
import { GameEvent } from '../config/GameEvent';
import type { ISaveSettings } from '../save/SaveData';
import { SaveService } from '../save/SaveService';
import { AudioService } from '../ui/AudioService';

/**
 * 玩家设置模型
 *
 * 设置项统一落在存档中，变更后立即同步音频模块并派发事件，界面收到事件后刷新显示
 */
export class SettingsModel {
    private static _inst: SettingsModel | null = null;

    static get inst(): SettingsModel {
        if (this._inst == null) this._inst = new SettingsModel();
        return this._inst;
    }

    get data(): ISaveSettings {
        return SaveService.data.settings;
    }

    get music(): boolean {
        return this.data.music;
    }

    get sfx(): boolean {
        return this.data.sfx;
    }

    get autoCollect(): boolean {
        return this.data.autoCollect;
    }

    get speed(): number {
        return this.data.speed;
    }

    get language(): string {
        return this.data.language;
    }

    setMusic(value: boolean): void {
        if (this.data.music === value) return;
        this.data.music = value;
        this.commit();
    }

    setMusicVolume(value: number): void {
        const v = Math.min(1, Math.max(0, value));
        if (this.data.musicVolume === v) return;
        this.data.musicVolume = v;
        this.commit();
    }

    setSfx(value: boolean): void {
        if (this.data.sfx === value) return;
        this.data.sfx = value;
        this.commit();
    }

    setSfxVolume(value: number): void {
        const v = Math.min(1, Math.max(0, value));
        if (this.data.sfxVolume === v) return;
        this.data.sfxVolume = v;
        this.commit();
    }

    setAutoCollect(value: boolean): void {
        if (this.data.autoCollect === value) return;
        this.data.autoCollect = value;
        this.commit();
    }

    setSpeed(value: number): void {
        const v = value >= 2 ? 2 : 1;
        if (this.data.speed === v) return;
        this.data.speed = v;
        this.commit();
    }

    /** 切换语言（异步加载语言包后派发事件） */
    setLanguage(language: string, onComplete?: () => void): void {
        if (language !== 'zh' && language !== 'en') return;
        if (this.data.language === language) {
            onComplete && onComplete();
            return;
        }
        this.data.language = language;
        SaveService.save();

        oops.language.setLanguage(language, () => {
            oops.message.dispatchEvent(GameEvent.LanguageChanged);
            oops.message.dispatchEvent(GameEvent.SettingsChanged);
            onComplete && onComplete();
        });
    }

    /** 交替切换中英文 */
    toggleLanguage(onComplete?: () => void): void {
        this.setLanguage(this.data.language === 'zh' ? 'en' : 'zh', onComplete);
    }

    private commit(): void {
        AudioService.apply();
        SaveService.save();
        oops.message.dispatchEvent(GameEvent.SettingsChanged);
    }
}
