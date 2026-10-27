import type { IEnemyConfig, IProjectileConfig, IUnitConfig } from '../../common/table/ITable';

/** 战场单位实例（逻辑层，不引用任何渲染类型） */
export interface IUnitInst {
    uid: number;
    cfgId: string;
    cfg: IUnitConfig;
    /** 行（0 为最上排） */
    row: number;
    /** 列 */
    col: number;
    hp: number;
    maxHp: number;
    /** 攻击计时（秒） */
    attackTimer: number;
    /** 产出计时（秒，产出单位） */
    produceTimer: number;
    /** 引信计时（秒，爆破单位） */
    fuseTimer: number;
    /** 蓄势计时（秒，陷阱单位，<=0 表示已就绪） */
    armTimer: number;
    /** 光环提供的攻击加成 */
    auraAtk: number;
    /** 光环提供的攻速加成 */
    auraSpeed: number;
    /** 受击闪白剩余时间 */
    hitFlash: number;
    alive: boolean;
}

/** 敌军实例 */
export interface IEnemyInst {
    uid: number;
    cfgId: string;
    cfg: IEnemyConfig;
    row: number;
    /** 横向位置（格，浮点，向左推进） */
    x: number;
    hp: number;
    maxHp: number;
    armor: number;
    maxArmor: number;
    /** 正在啃咬的单位 uid，-1 表示未啃咬 */
    eatingUid: number;
    /** 减速剩余时间 */
    slowRemain: number;
    /** 减速后速度倍率 */
    slowFactor: number;
    /** 是否已使用跳跃 / 掘地越过阻碍 */
    jumped: boolean;
    /** 受击闪白剩余时间 */
    hitFlash: number;
    alive: boolean;
}

/** 弹道实例 */
export interface IProjectileInst {
    uid: number;
    cfg: IProjectileConfig;
    row: number;
    x: number;
    /** 抛射落点（格） */
    targetX: number;
    /** 抛射进度 0~1 */
    progress: number;
    /** 起点 x（抛射用） */
    startX: number;
    /** 抛射总飞行时长（秒） */
    duration: number;
    damage: number;
    slow: number;
    slowDuration: number;
    alive: boolean;
}

/** 军粮掉落物 */
export interface IFoodDrop {
    uid: number;
    /** 横向位置（格） */
    x: number;
    /** 纵向位置（行单位，0~rows） */
    y: number;
    value: number;
    /** 剩余存活时间（秒） */
    life: number;
    /** 已存在时间（秒），用于自动拾取延迟 */
    age: number;
    /** 是否正在飞向计数器 */
    flying: boolean;
    alive: boolean;
}

/** 拒马 */
export interface IMower {
    row: number;
    /** 位置（格） */
    x: number;
    used: boolean;
    running: boolean;
}

/** 战斗表现事件（由视图层消费，逻辑层不直接操作节点） */
export type BattleEffectKind = 'damage' | 'explosion' | 'mower' | 'bigwave' | 'breach' | 'shoot' | 'food';

export interface IBattleEffect {
    kind: BattleEffectKind;
    row: number;
    x: number;
    /** 覆盖默认纵向位置（行单位），用于军粮拾取等自由坐标表现 */
    y?: number;
    value?: number;
    radius?: number;
    /** 颜色（伤害飘字 / 爆炸表现） */
    color?: string;
}

/** 波次运行时分组 */
export interface IRuntimeGroup {
    enemy: string;
    row: number;
    remaining: number;
    interval: number;
    timer: number;
}
