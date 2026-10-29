import type { IBondConfig, IGameplayConfig, ILevelConfig, IWaveConfig } from '../../common/table/ITable';
import { TableBonds } from '../../common/table/TableBonds';
import { TableGameplay } from '../../common/table/TableGameplay';
import { TableWaves } from '../../common/table/TableWaves';
import type { IBattleEffect, IBattleFx, IEnemyInst, IFoodDrop, IMower, IProjectileInst, IRuntimeGroup, IUnitInst } from './Actor';
import { GridMap } from './GridMap';

/** 场域减速区域（诸葛亮八卦阵） */
export interface ISlowField {
    row: number;
    x: number;
    radius: number;
    /** 失效时间（相对 model.time） */
    until: number;
    slowFactor: number;
}

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
    /** 本局实际出战的卡组（选将结果，缺省为关卡卡组） */
    readonly deck: string[];

    readonly units: IUnitInst[] = [];
    readonly enemies: IEnemyInst[] = [];
    readonly projectiles: IProjectileInst[] = [];
    readonly drops: IFoodDrop[] = [];
    readonly mowers: IMower[] = [];
    /** 待视图消费的表现事件 */
    readonly effects: IBattleEffect[] = [];
    /** 战斗特效生成队列（逻辑层推送，BattleFxView 每帧消费并实例化预制体 + 缓动播放） */
    readonly battleFx: IBattleFx[] = [];
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
    /** 已贴墙逃脱（用于"余敌"计数，避免破城敌军被重复统计） */
    escaped = 0;
    /** 已触发波次数 */
    waveCursor = 0;
    /** 本局累计拾取（点击或自动）的粮草值，用于新手引导判定 */
    foodCollected = 0;
    /** 新手引导：部署前暂停波次计时（参考稿「放将才开波」） */
    wavesHeld = false;
    /** 被暂停的波次累计时长，用于补偿波次时间轴 */
    waveHoldTime = 0;
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
    /** 城门当前耐久 */
    gateHp = 5;
    /** 城门最大耐久 */
    gateMax = 5;
    /** 场域减速（诸葛亮八卦阵等） */
    slowFields: ISlowField[] = [];
    /** 连击计数与窗口剩余 */
    comboCount = 0;
    comboTimer = 0;
    /** 城门无敌剩余时间（拒马触发后） */
    gateInvuln = 0;
    /** 每张卡已上阵次数（同名再上阵涨价） */
    readonly deployCounts: Map<string, number> = new Map();
    /** 当前生效的羁缘 */
    activeBonds: IBondConfig[] = [];
    /** 羁缘提供的攻击 / 攻速 / 生命加成 */
    bondAtk = 0;
    bondAspd = 0;
    bondHp = 0;
    /** 无尽模式当前波数 */
    endlessWave = 0;
    /** 无尽模式下一波倒计时 */
    endlessTimer = 20;
    /** 本局已用过的军师计略 */
    readonly stratUsed: Set<string> = new Set();
    /** 波次旗标（进度 0~1 + 是否大波） */
    readonly waveFlags: { progress: number; big: boolean }[] = [];
    /** 本局总时长估算（无尽模式为 0） */
    readonly totalTime: number;

    private uidSeed = 1;

    constructor(level: ILevelConfig, deck?: string[]) {
        this.level = level;
        // deck 为 undefined 时回退关卡默认卡组；显式传入空数组（如首次引导关）则保持空，由剧情授予填充
        this.deck = deck != null ? deck.slice() : level.units.slice();
        this.gameplay = TableGameplay.get();
        this.grid = new GridMap(this.gameplay.rows, this.gameplay.cols);
        this.waves = TableWaves.getByLevel(level.waves);
        this.food = level.initialFood;
        this.dropTimer = Math.max(1, level.dropInterval);
        this.gateMax = Math.max(1, Math.round(this.gameplay.gateHp ?? 5));
        this.gateHp = this.gateMax;

        // 地形限制与墓碑格：不可部署
        const terrain = level.terrain;
        for (const row of terrain?.mountain ?? []) {
            for (let col = 0; col < this.gameplay.cols; col++) this.grid.block(row, col);
        }
        for (const row of terrain?.river ?? []) {
            for (let col = 0; col < this.gameplay.cols; col++) this.grid.block(row, col);
        }
        for (const cell of level.graves ?? []) {
            this.grid.block(cell[0], cell[1]);
        }

        let total = 0;
        for (const wave of this.waves) {
            total += TableWaves.countEnemies(wave);
        }
        this.totalEnemies = level.endless === true ? -1 : total;

        // 波次旗标位置（按最后一波时间归一化）
        const lastAt = this.waves.length > 0 ? this.waves[this.waves.length - 1].at : 1;
        this.totalTime = lastAt;
        for (const wave of this.waves) {
            this.waveFlags.push({ progress: lastAt > 0 ? wave.at / (lastAt + 20) : 0, big: wave.big === true });
        }

        // 卡片冷却初始化（按本局阵容）
        for (const unitId of this.deck) {
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

    addBattleFx(fx: IBattleFx): void {
        this.battleFx.push(fx);
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
    /** 新手引导授将：把武将加入本局卡组（已存在则忽略） */
    grantUnit(unitId: string): boolean {
        if (this.deck.indexOf(unitId) >= 0) return false;
        this.deck.push(unitId);
        this.cooldowns.set(unitId, 0);
        this.deployCounts.delete(unitId);
        return true;
    }

    /** 重算羁缘（部署 / 阵亡后调用） */
    recomputeBonds(): void {
        const ids: string[] = [];
        for (const unit of this.units) {
            if (!unit.alive) continue;
            if (ids.indexOf(unit.cfgId) < 0) ids.push(unit.cfgId);
        }

        this.activeBonds = TableBonds.getActive(ids);
        this.bondAtk = 0;
        this.bondAspd = 0;
        this.bondHp = 0;
        for (const bond of this.activeBonds) {
            this.bondAtk += bond.effect.atk ?? 0;
            this.bondAspd += bond.effect.aspd ?? 0;
            this.bondHp += bond.effect.hp ?? 0;
        }
    }

    /** 增加一片场域减速，并立即影响范围内的敌军 */
    addSlowField(row: number, x: number, radius: number, duration: number, slowFactor: number): void {
        this.slowFields.push({ row, x, radius, until: this.time + Math.max(0.5, duration), slowFactor });
    }

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

    /** 剩余敌军数（含未出兵的；击杀与破城逃脱都要扣除） */
    get remainEnemies(): number {
        return Math.max(0, this.totalEnemies - this.kills - this.escaped);
    }
}
