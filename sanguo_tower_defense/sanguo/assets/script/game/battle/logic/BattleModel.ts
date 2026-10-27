import type { IGameplayConfig, ILevelConfig, IWaveConfig } from '../../common/table/ITable';
import { TableGameplay } from '../../common/table/TableGameplay';
import { TableWaves } from '../../common/table/TableWaves';
import type { IBattleEffect, IEnemyInst, IFoodDrop, IMower, IProjectileInst, IRuntimeGroup, IUnitInst } from './Actor';
import { GridMap } from './GridMap';

/**
 * 战斗状态容器
 *
 * 逻辑层唯一数据源：所有系统读写本对象，视图层只读取并渲染
 */
export class BattleModel {
    readonly level: ILevelConfig;
    readonly gameplay: IGameplayConfig;
    readonly grid: GridMap;
    readonly waves: IWaveConfig[];
    readonly totalEnemies: number;

    readonly units: IUnitInst[] = [];
    readonly enemies: IEnemyInst[] = [];
    readonly projectiles: IProjectileInst[] = [];
    readonly drops: IFoodDrop[] = [];
    readonly mowers: IMower[] = [];
    /** 待视图消费的表现事件 */
    readonly effects: IBattleEffect[] = [];
    /** 卡片冷却剩余时间 */
    readonly cooldowns: Map<string, number> = new Map();
    /** 运行时波次分组 */
    readonly groups: IRuntimeGroup[] = [];

    /** 战斗已进行时间（受暂停影响） */
    time = 0;
    /** 当前军粮 */
    food: number;
    /** 已击杀敌军数 */
    kills = 0;
    /** 已出兵数 */
    spawned = 0;
    /** 已触发波次数 */
    waveCursor = 0;
    /** 是否暂停 */
    paused = false;
    /** 倍速 */
    speed = 1;
    /** 是否结束 */
    over = false;
    /** 是否胜利 */
    win = false;
    /** 是否动用过拒马 */
    mowerUsed = false;
    /** 结算星级 0~3 */
    stars = 0;
    /** 天降军粮计时 */
    dropTimer = 0;

    private uidSeed = 1;

    constructor(level: ILevelConfig) {
        this.level = level;
        this.gameplay = TableGameplay.get();
        this.grid = new GridMap(this.gameplay.rows, this.gameplay.cols);
        this.waves = TableWaves.getByLevel(level.waves);
        this.food = level.initialFood;
        this.dropTimer = Math.max(1, level.dropInterval);

        let total = 0;
        for (const wave of this.waves) {
            total += TableWaves.countEnemies(wave);
        }
        this.totalEnemies = total;

        // 卡片冷却初始化
        for (const unitId of level.units) {
            this.cooldowns.set(unitId, 0);
        }

        // 拒马按行均分
        const mowerCount = Math.max(0, Math.min(level.mowers, this.gameplay.rows));
        for (let i = 0; i < mowerCount; i++) {
            const row = Math.floor((i * this.gameplay.rows) / mowerCount);
            this.mowers.push({ row, x: this.gameplay.mowerOffset, used: false, running: false });
        }
    }

    /** 生成唯一 id */
    nextUid(): number {
        return this.uidSeed++;
    }

    /** 推送表现事件 */
    addEffect(effect: IBattleEffect): void {
        this.effects.push(effect);
    }

    findUnit(uid: number): IUnitInst | null {
        for (const unit of this.units) {
            if (unit.uid === uid) return unit.alive ? unit : null;
        }
        return null;
    }

    findEnemy(uid: number): IEnemyInst | null {
        for (const enemy of this.enemies) {
            if (enemy.uid === uid) return enemy.alive ? enemy : null;
        }
        return null;
    }

    /** 取指定格子的单位 */
    unitAt(row: number, col: number): IUnitInst | null {
        const uid = this.grid.getUid(row, col);
        if (uid === 0) return null;
        return this.findUnit(uid);
    }

    /** 增加军粮（不超过上限） */
    addFood(value: number): void {
        this.food = Math.min(this.level.maxFood, this.food + value);
    }

    /** 消耗军粮，不足返回 false */
    consumeFood(value: number): boolean {
        if (this.food < value) return false;
        this.food -= value;
        return true;
    }

    /** 波次是否已全部出兵完毕 */
    get allSpawned(): boolean {
        if (this.waveCursor < this.waves.length) return false;
        for (const group of this.groups) {
            if (group.remaining > 0) return false;
        }
        return true;
    }

    /** 当前波次序号（1 起，用于 HUD） */
    get waveNumber(): number {
        return Math.min(this.waveCursor, this.waves.length);
    }

    /** 出兵进度 0~1 */
    get progress(): number {
        if (this.totalEnemies <= 0) return 1;
        return Math.min(1, this.spawned / this.totalEnemies);
    }

    /** 剩余敌军数（含未出兵的） */
    get remainEnemies(): number {
        return Math.max(0, this.totalEnemies - this.kills);
    }
}
