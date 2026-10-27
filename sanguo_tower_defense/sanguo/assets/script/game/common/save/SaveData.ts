/** 存档当前数据结构版本（结构变更时递增，并在 SaveService 中补迁移逻辑） */
export const SAVE_VERSION = 1;

/** 玩家设置数据 */
export interface ISaveSettings {
    /** 背景音乐开关 */
    music: boolean;
    /** 背景音乐音量 0~1 */
    musicVolume: number;
    /** 音效开关 */
    sfx: boolean;
    /** 音效音量 0~1 */
    sfxVolume: number;
    /** 自动拾取军粮 */
    autoCollect: boolean;
    /** 默认倍速 1 / 2 */
    speed: number;
    /** 界面语言 zh / en */
    language: string;
}

/** 单关战绩 */
export interface ILevelRecord {
    /** 最高星级 0~3 */
    stars: number;
    /** 最短通关时间（秒），0 表示未通关 */
    bestTime: number;
    /** 通关次数 */
    clears: number;
}

/** 存档根结构 */
export interface ISaveData {
    /** 存档结构版本 */
    version: number;
    /** 已解锁的最高关卡 id（第一关始终解锁） */
    unlocked: number;
    /** 关卡战绩：key 为关卡 id */
    records: { [levelId: string]: ILevelRecord };
    /** 累计击杀敌军数 */
    kills: number;
    /** 累计通关次数 */
    clears: number;
    /** 新手引导是否已完成 */
    guideDone: boolean;
    /** 设置数据 */
    settings: ISaveSettings;
}

/** 默认设置 */
export function createDefaultSettings(): ISaveSettings {
    return {
        music: true,
        musicVolume: 0.6,
        sfx: true,
        sfxVolume: 0.8,
        autoCollect: false,
        speed: 1,
        language: 'zh',
    };
}

/** 默认存档 */
export function createDefaultSave(): ISaveData {
    return {
        version: SAVE_VERSION,
        unlocked: 1,
        records: {},
        kills: 0,
        clears: 0,
        guideDone: false,
        settings: createDefaultSettings(),
    };
}
