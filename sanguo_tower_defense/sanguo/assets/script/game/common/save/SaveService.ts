import { oops } from 'db://oops-framework/core/Oops';
import { SanguoStorageConfig } from '../config/GameStorageConfig';
import type { ILevelRecord, ISaveData, ISaveSettings } from './SaveData';
import { createDefaultSave, createDefaultSettings, SAVE_VERSION } from './SaveData';

/**
 * 存档服务
 *
 * 特性：
 * 1、惰性读取，首次访问才解析本地数据
 * 2、字段逐项兜底，旧版本存档缺字段不会导致崩溃
 * 3、写入只在关键节点（通关、设置变更、清档）发生，避免高频 IO
 */
export class SaveService {
    private static cache: ISaveData | null = null;

    /** 当前存档（只读使用，修改请通过 PlayerModel / SettingsModel） */
    static get data(): ISaveData {
        if (this.cache == null) {
            this.cache = this.read();
        }
        return this.cache;
    }

    /** 立即写盘 */
    static save(): void {
        try {
            oops.storage.set(SanguoStorageConfig.Save, this.data);
        }
        catch (e) {
            console.error('[三国塔防] 存档写入失败', e);
        }
    }

    /** 清档并重置为默认值 */
    static reset(): ISaveData {
        this.cache = createDefaultSave();
        try {
            oops.storage.remove(SanguoStorageConfig.Save);
        }
        catch (e) {
            console.warn('[三国塔防] 清除存档失败', e);
        }
        return this.cache;
    }

    private static read(): ISaveData {
        let raw: Partial<ISaveData> | null = null;
        try {
            raw = oops.storage.getJson<Partial<ISaveData>>(SanguoStorageConfig.Save, null as unknown as Partial<ISaveData>);
        }
        catch (e) {
            console.warn('[三国塔防] 存档解析失败，将使用默认存档', e);
        }
        if (raw == null || typeof raw !== 'object') {
            return createDefaultSave();
        }
        return this.migrate(raw);
    }

    /** 版本迁移与字段兜底 */
    private static migrate(raw: Partial<ISaveData>): ISaveData {
        const data = createDefaultSave();

        if (typeof raw.unlocked === 'number' && Number.isFinite(raw.unlocked)) {
            data.unlocked = Math.max(1, Math.floor(raw.unlocked));
        }
        if (typeof raw.kills === 'number' && raw.kills >= 0) {
            data.kills = Math.floor(raw.kills);
        }
        if (typeof raw.clears === 'number' && raw.clears >= 0) {
            data.clears = Math.floor(raw.clears);
        }
        data.guideDone = raw.guideDone === true;
        data.version = SAVE_VERSION;

        if (raw.records != null && typeof raw.records === 'object') {
            for (const key of Object.keys(raw.records)) {
                const record = (raw.records as Record<string, Partial<ILevelRecord>>)[key];
                if (record == null || typeof record !== 'object') continue;
                data.records[key] = {
                    stars: this.clampStars(record.stars),
                    bestTime: typeof record.bestTime === 'number' && record.bestTime > 0 ? record.bestTime : 0,
                    clears: typeof record.clears === 'number' && record.clears > 0 ? Math.floor(record.clears) : 0,
                };
            }
        }

        data.settings = this.migrateSettings(raw.settings);
        return data;
    }

    private static migrateSettings(raw: Partial<ISaveSettings> | undefined): ISaveSettings {
        const settings = createDefaultSettings();
        if (raw == null || typeof raw !== 'object') return settings;

        settings.music = raw.music !== false;
        settings.sfx = raw.sfx !== false;
        settings.autoCollect = raw.autoCollect === true;
        settings.musicVolume = this.clampVolume(raw.musicVolume, settings.musicVolume);
        settings.sfxVolume = this.clampVolume(raw.sfxVolume, settings.sfxVolume);
        settings.speed = raw.speed === 2 ? 2 : 1;
        settings.language = raw.language === 'en' ? 'en' : 'zh';
        return settings;
    }

    private static clampVolume(value: unknown, fallback: number): number {
        if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
        return Math.min(1, Math.max(0, value));
    }

    private static clampStars(value: unknown): number {
        if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
        return Math.min(3, Math.max(0, Math.floor(value)));
    }
}
