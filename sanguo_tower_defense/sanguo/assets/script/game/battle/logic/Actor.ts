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
    /** 天赋技冷却计时 */
    talentTimer: number;
    /** 攻击加成倍率（曹操奸雄等） */
    atkBuffMul: number;
    /** 攻击加成剩余时间 */
    atkBuffTimer: number;
    /** 承伤倍率（甄姬减伤） */
    drMul: number;
    /** 减伤剩余时间 */
    drTimer: number;
    /** 咀嚼 / 施法硬直剩余时间 */
    chewTimer: number;
    /** 是否已触发涅槃 */
    revived: boolean;
    /** 实际支付粮草（撤退返还用） */
    paid: number;
    /** 装备加成：攻击 / 攻速 / 暴击率 */
    equipAtk: number;
    equipAspd: number;
    equipCrit: number;
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
    /** 眩晕剩余时间（姜维伏兵） */
    stunTimer: number;
    /** 挖壕层数（工程兵，每层减伤 20%） */
    digLayers: number;
    /** 挖壕计时 */
    digTimer: number;
    /** 远程攻击计时（抛射 / 行进射击） */
    shootTimer: number;
    /** 是否已触发怯战 */
    hesitated: boolean;
    /** 是否已使用冲锋首击 */
    charged: boolean;
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
    /** 是否贯穿整行（命中后不消失） */
    pierce: boolean;
    /** 已命中的敌军 uid，避免贯穿弹重复伤害同一目标 */
    hitUids: number[];
    /** 是否暴击（飘字用红色） */
    crit: boolean;
    /** 敌方弹道（仅表现，伤害已即时结算） */
    hostile?: boolean;
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
export type BattleEffectKind = 'damage' | 'explosion' | 'mower' | 'bigwave' | 'breach' | 'shoot' | 'food' | 'gate' | 'shout' | 'die' | 'skill' | 'shake';

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
    /** 文案（技能名播报 / 增益飘字） */
    text?: string;
    /** 施法者名（技能播报副标题） */
    who?: string;
    /** 技能名（skill 事件） */
    name?: string;
    /** 屏震幅度（shake 事件） */
    amp?: number;
}

/** 程序化战斗特效（由 BattleFxView 用 Graphics 每帧绘制，逻辑层只负责生成） */
export type BattleFxKind =
    | 'impact' | 'muzzle' | 'shard' | 'burst' | 'sweep' | 'wave'
    | 'cast' | 'castaura' | 'shockwave' | 'line' | 'arc' | 'die' | 'fire' | 'slash' | 'trail'
    | 'bagua' | 'shout' | 'graincart' | 'bowdraw';

export interface IBattleFx {
    kind: BattleFxKind;
    /** 横向位置（格） */
    x: number;
    /** 纵向位置（行单位，0~rows） */
    y: number;
    color: string;
    /** 剩余寿命（秒） */
    life: number;
    /** 总寿命（秒） */
    max: number;
    /** 半径（格，圆形表现） */
    r?: number;
    /** 椭圆半径（格） */
    rx?: number;
    ry?: number;
    /** 朝向（弧度） */
    ang?: number;
    /** 终点（格，cast/wave/trail 用） */
    x2?: number;
    y2?: number;
    /** 弧角跨度（弧度，sweep 用） */
    span?: number;
    /** 行进距离（格，shockwave 用） */
    travel?: number;
    /** 半宽（格，line 用） */
    w?: number;
    /** 是否暴击（impact 更亮更大） */
    crit?: boolean;
    /** 碎片初速（格/秒） */
    vx?: number;
    vy?: number;
    /** 碎片自转（弧度/秒） */
    vrot?: number;
    rot?: number;
    /** 碎片边长（像素） */
    size?: number;
    round?: boolean;
    /** 碎片重力（格/秒²） */
    grav?: number;
    /** 技能名（shout / 播报用） */
    name?: string;
    /** 施法者名 */
    who?: string;
    /** 屏震幅度 */
    amp?: number;
    /** 方向标记（1 右 / -1 左，缺省 1） */
    dir?: number;
}

/** 波次运行时分组 */
export interface IRuntimeGroup {
    enemy: string;
    row: number;
    remaining: number;
    interval: number;
    timer: number;
}
