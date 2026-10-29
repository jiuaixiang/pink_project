import { oops } from 'db://oops-framework/core/Oops';
import { TableEnemies } from '../table/TableEnemies';
import { TableEquips } from '../table/TableEquips';
import { TableLevels } from '../table/TableLevels';
import { TableUnits } from '../table/TableUnits';
import { TableWaves } from '../table/TableWaves';
import { GameEvent } from '../config/GameEvent';
import type { ISaveData } from '../save/SaveData';
import { SaveService } from '../save/SaveService';

/** 单场战斗结算数据 */
export interface IBattleResult {
    levelId: number;
    win: boolean;
    /** 星级 0~3（失败为 0） */
    stars: number;
    /** 用时（秒） */
    time: number;
    /** 本场击杀数 */
    kills: number;
}

/**
 * 玩家进度模型
 *
 * 1、封装存档读写，界面层只面向本类
 * 2、通关后自动解锁下一关并派发存档变化事件
 * 3、图鉴解锁状态由"已通关关卡所包含的单位/敌军"推导，不额外存字段
 */
export class PlayerModel {
    private static _inst: PlayerModel | null = null;

    static get inst(): PlayerModel {
        if (this._inst == null) this._inst = new PlayerModel();
        return this._inst;
    }

    private get save(): ISaveData {
        return SaveService.data;
    }

    /** 已解锁的最高关卡 id */
    get unlocked(): number {
        return this.save.unlocked;
    }

    /** 已通关联数 */
    get clearedCount(): number {
        let count = 0;
        const records = this.save.records;
        for (const key of Object.keys(records)) {
            if (records[key].clears > 0) count++;
        }
        return count;
    }

    /** 关卡总数 */
    get levelCount(): number {
        return TableLevels.count;
    }

    /** 累计星数 */
    get totalStars(): number {
        let stars = 0;
        const records = this.save.records;
        for (const key of Object.keys(records)) {
            stars += records[key].stars;
        }
        return stars;
    }

    /** 满星数 */
    get maxStars(): number {
        return TableLevels.count * 3;
    }

    /** 累计击杀 */
    get kills(): number {
        return this.save.kills;
    }

    /** 累计通关次数 */
    get totalClears(): number {
        return this.save.clears;
    }

    /** 无尽模式最高波数 */
    get bestWave(): number {
        return this.save.bestWave ?? 0;
    }

    /** 记录无尽模式成绩 */
    recordEndless(wave: number): void {
        const reached = Math.max(0, Math.floor(wave));
        if (reached <= (this.save.bestWave ?? 0)) return;
        this.save.bestWave = reached;
        SaveService.save();
        oops.message.dispatchEvent(GameEvent.SaveChanged);
    }

    /** 已获得的装备（背包） */
    get bag(): string[] {
        if (!Array.isArray(this.save.bag)) this.save.bag = [];
        return this.save.bag;
    }

    /** 已获得的武将 / 器械花名册（引导授予、选将、通关均会收入） */
    get obtainedUnits(): string[] {
        if (!Array.isArray(this.save.units)) this.save.units = [];
        return this.save.units;
    }

    /** 记录一名武将 / 器械为已获得（持久化） */
    obtainUnit(unitId: string): void {
        if (TableUnits.get(unitId) == null) return;
        const list = this.obtainedUnits;
        if (list.indexOf(unitId) >= 0) return;
        list.push(unitId);
        SaveService.save();
        oops.message.dispatchEvent(GameEvent.SaveChanged);
    }

    /** 某武将的穿戴表 */
    wearingOf(unitId: string): Record<string, string> {
        if (this.save.wearing == null) this.save.wearing = {};
        const worn = this.save.wearing[unitId];
        if (worn == null) {
            const created: Record<string, string> = {};
            this.save.wearing[unitId] = created;
            return created;
        }
        return worn;
    }

    /** 获得装备（重复的也入包，可给不同武将使用） */
    addEquip(equipId: string): void {
        this.bag.push(equipId);
        SaveService.save();
        oops.message.dispatchEvent(GameEvent.SaveChanged);
    }

    /** 穿戴：背包中移除一件，原装备退回背包 */
    equipItem(unitId: string, equipId: string): boolean {
        const index = this.bag.indexOf(equipId);
        if (index < 0) return false;
        const cfg = TableEquips.get(equipId);
        if (cfg == null) return false;

        const worn = this.wearingOf(unitId);
        const previous = worn[cfg.slot];
        this.bag.splice(index, 1);
        if (previous != null) this.bag.push(previous);
        worn[cfg.slot] = equipId;

        SaveService.save();
        oops.message.dispatchEvent(GameEvent.SaveChanged);
        return true;
    }

    /** 卸下某槽位 */
    unequip(unitId: string, slot: string): boolean {
        const worn = this.wearingOf(unitId);
        const equipId = worn[slot];
        if (equipId == null) return false;

        delete worn[slot];
        this.bag.push(equipId);
        SaveService.save();
        oops.message.dispatchEvent(GameEvent.SaveChanged);
        return true;
    }

    /** 汇总某武将的装备加成 */
    statsOf(unitId: string): { atkPct: number; hpPct: number; aspd: number; critPct: number; cdReduce: number } {
        const result = { atkPct: 0, hpPct: 0, aspd: 0, critPct: 0, cdReduce: 0 };
        const worn = this.wearingOf(unitId);
        for (const slot of Object.keys(worn)) {
            const cfg = TableEquips.get(worn[slot]);
            if (cfg == null) continue;
            result.atkPct += cfg.atkPct ?? 0;
            result.hpPct += cfg.hpPct ?? 0;
            result.aspd += cfg.aspd ?? 0;
            result.critPct += cfg.critPct ?? 0;
            result.cdReduce += cfg.cdReduce ?? 0;
        }
        return result;
    }

    /** 新手引导是否已完成 */
    get guideDone(): boolean {
        return this.save.guideDone;
    }

    /** 是否已通关 */
    isCleared(levelId: number): boolean {
        const record = this.save.records[String(levelId)];
        return record != null && record.clears > 0;
    }

    /** 是否已解锁 */
    isUnlocked(levelId: number): boolean {
        if (levelId <= 1) return true;
        return levelId <= this.save.unlocked;
    }

    /** 某关最高星级 */
    getStars(levelId: number): number {
        const record = this.save.records[String(levelId)];
        return record == null ? 0 : record.stars;
    }

    /** 某关最短通关时间 */
    getBestTime(levelId: number): number {
        const record = this.save.records[String(levelId)];
        return record == null ? 0 : record.bestTime;
    }

    /** 推荐继续的关卡：优先第一个未通关的已解锁关卡 */
    getContinueLevel(): number {
        const levels = TableLevels.getSorted();
        for (const level of levels) {
            if (!this.isUnlocked(level.id)) break;
            if (!this.isCleared(level.id)) return level.id;
        }
        // 全部通关则回到最后一关
        return levels.length > 0 ? levels[levels.length - 1].id : 1;
    }

    /** 记录战斗结果 */
    recordBattle(result: IBattleResult): void {
        this.save.kills += Math.max(0, Math.floor(result.kills));

        if (result.win) {
            const key = String(result.levelId);
            const old = this.save.records[key];
            const stars = Math.max(old == null ? 0 : old.stars, Math.min(3, Math.max(1, Math.floor(result.stars))));
            const bestTime = old == null || old.bestTime <= 0
                ? result.time
                : Math.min(old.bestTime, result.time);

            this.save.records[key] = {
                stars,
                bestTime: Math.max(0, Math.round(bestTime * 10) / 10),
                clears: (old == null ? 0 : old.clears) + 1,
            };
            this.save.clears += 1;

            const level = TableLevels.get(result.levelId);
            if (level != null) {
                const next = level.unlockNext;
                if (typeof next === 'number' && next > this.save.unlocked) {
                    this.save.unlocked = next;
                }
                else if (this.save.unlocked <= level.id) {
                    // 未配置 unlockNext 时按关卡顺序兜底
                    const nextLevel = TableLevels.getNext(level.id);
                    if (nextLevel != null) this.save.unlocked = Math.max(this.save.unlocked, nextLevel.id);
                }
                // 通关后将本关可招募武将收入花名册（解锁后续关卡选将）
                for (const uid of level.units) {
                    if (this.obtainedUnits.indexOf(uid) < 0) this.obtainedUnits.push(uid);
                }
            }
        }

        SaveService.save();
        oops.message.dispatchEvent(GameEvent.SaveChanged);
    }

    /** 标记新手引导完成 */
    setGuideDone(): void {
        if (this.save.guideDone) return;
        this.save.guideDone = true;
        SaveService.save();
        oops.message.dispatchEvent(GameEvent.SaveChanged);
    }

    /** 武将是否已收录（已获得花名册优先，兼容旧存档/图鉴按关卡推导） */
    isUnitUnlocked(unitId: string): boolean {
        if (TableUnits.get(unitId) == null) return false;
        // 已通过引导 / 选将 / 通关实际获得的武将优先判定
        if (this.obtainedUnits.indexOf(unitId) >= 0) return true;
        // 兼容旧存档与图鉴：出现在已通关关卡或首关可招募列表的也算收录
        for (const level of TableLevels.getSorted()) {
            if (level.units.indexOf(unitId) < 0) continue;
            if (this.isCleared(level.id) || level.id === 1) return true;
        }
        return false;
    }

    /** 敌军是否已遭遇（出现在任意已通关关卡的波次中） */
    isEnemyUnlocked(enemyId: string): boolean {
        if (TableEnemies.get(enemyId) == null) return false;
        for (const level of TableLevels.getSorted()) {
            if (!this.isCleared(level.id) && level.id !== 1) continue;
            for (const waveId of level.waves) {
                const wave = TableWaves.get(waveId);
                if (wave == null) continue;
                for (const group of wave.groups) {
                    if (group.enemy === enemyId) return true;
                }
            }
        }
        return false;
    }

    /** 清档 */
    reset(): void {
        SaveService.reset();
        oops.message.dispatchEvent(GameEvent.SaveChanged);
    }
}
