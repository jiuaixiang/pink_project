import { AudioClip } from 'cc';
import { oops } from 'db://oops-framework/core/Oops';
import { SaveService } from '../save/SaveService';

/** 音频资源路径（资源缺失时静默跳过，不影响流程） */
export const AudioPath = {
    Menu: 'audios/menu_bgm',
    Battle: 'audios/battle_bgm',
    Plant: 'audios/sfx_plant',
    Collect: 'audios/sfx_collect',
    Shoot: 'audios/sfx_shoot',
    Hit: 'audios/sfx_hit',
    Die: 'audios/sfx_die',
    Wave: 'audios/sfx_wave',
    Win: 'audios/sfx_win',
    Lose: 'audios/sfx_lose',
    Click: 'audios/sfx_click',
};

/**
 * 音频服务
 *
 * 设计要点：
 * 1、audios 目录已内置占位 WAV（tools/audio-gen.mjs 生成），替换正式素材时保持同名即可；
 *    播放前仍做可用性探测，资源缺失时静默降级，不阻塞流程
 * 2、音量与开关直接读存档，避免与 SettingsModel 互相 import 形成循环依赖
 *    （循环依赖会导致预览构建里模块注入失败，表现为 import 到的函数为 undefined）
 */
export class AudioService {
    private static missing: Set<string> = new Set();
    private static probed: Set<string> = new Set();
    private static currentMusic = '';

    /** 将存档中的音量与开关同步到框架音频模块 */
    static apply(): void {
        const audio = oops.audio;
        if (audio == null) return;
        const settings = SaveService.data.settings;
        try {
            if (audio.music != null) {
                audio.music.setSwitch(settings.music);
                audio.music.setVolume(settings.musicVolume);
            }
            if (audio.effect != null) {
                audio.effect.setSwitch(settings.sfx);
                audio.effect.setVolume(settings.sfxVolume);
            }
        }
        catch (e) {
            console.warn('[三国塔防] 音频参数设置失败', e);
        }
    }

    /** 播放背景音乐（相同音乐不重复播放） */
    static playMusic(path: string): void {
        if (path === '' || this.currentMusic === path) return;
        const settings = SaveService.data.settings;
        if (!settings.music) return;
        this.currentMusic = path;

        this.probe(path).then((ok) => {
            if (!ok) return;
            if (this.currentMusic !== path) return; // 探测期间已切换音乐
            try {
                oops.audio.playMusic(path, { volume: SaveService.data.settings.musicVolume, loop: true });
            }
            catch (e) {
                console.warn('[三国塔防] 背景音乐播放失败', path, e);
            }
        });
    }

    /** 停止当前背景音乐 */
    static stopMusic(): void {
        this.currentMusic = '';
        try {
            oops.audio.stopAll();
        }
        catch (e) {
            // 忽略：音频模块未就绪
        }
    }

    /** 播放音效 */
    static playEffect(path: string): void {
        if (path === '') return;
        if (!SaveService.data.settings.sfx) return;
        if (this.missing.has(path)) return;

        this.probe(path).then((ok) => {
            if (!ok) return;
            try {
                oops.audio.playEffect(path, { volume: SaveService.data.settings.sfxVolume });
            }
            catch (e) {
                this.missing.add(path);
            }
        });
    }

    /** 探测资源是否存在，结果缓存 */
    private static async probe(path: string): Promise<boolean> {
        if (this.missing.has(path)) return false;
        if (this.probed.has(path)) return true;
        this.probed.add(path);

        try {
            const clip = await oops.res.load(path, AudioClip);
            if (clip == null) {
                this.missing.add(path);
                this.probed.delete(path);
                return false;
            }
            // 保留一次引用，避免播放前被释放
            return true;
        }
        catch (e) {
            this.missing.add(path);
            this.probed.delete(path);
            console.warn(`[三国塔防] 音频资源缺失，已跳过：${path}`);
            return false;
        }
    }
}
