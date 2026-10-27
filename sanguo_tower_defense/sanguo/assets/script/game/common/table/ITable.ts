/**
 * 三国塔防配置表接口定义
 *
 * 设计原则：
 * 1、数值全部外置到 assets/bundle/config/game/*.json，代码不硬编码平衡数据
 * 2、所有可选字段由 TableValidator 统一补默认值并告警，避免运行期 undefined 崩溃
 * 3、行为类型用 UnitKind / EnemyKind 枚举描述，新增兵种只需扩展配置与策略函数
 */

/** 武将 / 器械行为类型 */
export enum UnitKind {
    /** 产出军粮（鲁肃、荀彧） */
    Producer = 'producer',
    /** 直线射击（丁奉、孙尚香、小乔、太史慈、马岱） */
    Shooter = 'shooter',
    /** 纯阻挡（拒马、兀突骨、庞统） */
    Wall = 'wall',
    /** 一次性范围爆炸（保留，当前阵容改由天赋实现） */
    Bomber = 'bomber',
    /** 整行清场（陆逊·火烧连营） */
    RowClear = 'rowclear',
    /** 同排光环增益（保留扩展位） */
    Support = 'support',
    /** 埋设陷阱（保留扩展位） */
    Mine = 'mine',
    /** 抛射溅射（黄月英） */
    Lobber = 'lobber',
    /** 天赋技施法者：不普攻，按天赋冷却施放 */
    Caster = 'caster',
}

/** 天赋技类型 */
export enum TalentKind {
    /** 兵刃伤害 */
    Blade = 'blade',
    /** 谋略伤害 / 场域 */
    Magic = 'magic',
    /** 增益 / 治疗 / 召唤 */
    Buff = 'buff',
    /** 被动（不主动施放） */
    Passive = 'passive',
}

/** 武将天赋配置（对应 game-config.js 的 talent 字段） */
export interface ITalentConfig {
    /** 天赋键：决定施法逻辑 */
    id: string;
    /** 天赋名（展示用） */
    name: string;
    /** 冷却（秒） */
    cd: number;
    /** 类型 */
    dtype?: TalentKind;
    /** 伤害值（留空则取 unit.damage） */
    damage?: number;
    /** 作用半径 / 范围（格） */
    radius?: number;
    /** 增益持续时间（秒） */
    duration?: number;
    /** 减速比例 */
    slow?: number;
    /** 减速持续（秒） */
    slowT?: number;
    /** 击退距离（格） */
    knock?: number;
    /** 产粮量 */
    yield?: number;
    /** 治疗比例（0.15 = 15%） */
    heal?: number;
    /** 攻击加成（0.25 = +25%） */
    atkBuff?: number;
    /** 减伤比例（0.2 = 减伤 20%） */
    dr?: number;
    /** 眩晕时长（秒） */
    stun?: number;
}

/** 敌军行为类型（仅用于图鉴分类与特殊表现，实际行为由字段驱动） */
export enum EnemyKind {
    Normal = 'normal',
    Fast = 'fast',
    Armor = 'armor',
    Jumper = 'jumper',
    Digger = 'digger',
    Boss = 'boss',
}

/** 军粮产出参数 */
export interface IProduceConfig {
    /** 产出间隔（秒） */
    interval: number;
    /** 单次产出数量 */
    value: number;
}

/** 武将 / 器械配置 */
export interface IUnitConfig {
    id: string;
    /** 名称多语言键 */
    nameKey: string;
    /** 描述多语言键 */
    descKey: string;
    kind: UnitKind;
    /** 部署消耗军粮 */
    cost: number;
    /** 卡片冷却（秒） */
    cooldown: number;
    /** 生命值 */
    hp: number;
    /** 占位图上的单字标识 */
    tag: string;
    /** 占位色（#RRGGBB） */
    color: string;
    /** 正式美术资源路径（可选，占位阶段为空） */
    icon?: string;

    /** 攻击力（射击 / 抛射） */
    atk?: number;
    /** 攻击间隔（秒） */
    interval?: number;
    /** 弹道 id */
    projectile?: string;
    /** 单次齐射数量 */
    volley?: number;
    /** 攻击覆盖的行数：1 为单排，3 为三排 */
    rows?: number;
    /** 减速比例（0.5 表示速度降为 50%） */
    slowFactor?: number;
    /** 减速持续（秒） */
    slowDuration?: number;

    /** 产出配置 */
    produce?: IProduceConfig;
    /** 爆炸 / 清行 / 陷阱伤害 */
    damage?: number;
    /** 爆炸半径（格） */
    radius?: number;
    /** 陷阱布置时间（秒） */
    armTime?: number;
    /** 光环攻击力加成（0.2 表示 +20%） */
    auraAtk?: number;
    /** 光环攻速加成（0.25 表示 +25%） */
    auraSpeed?: number;
    /** 抛射溅射半径（格） */
    splash?: number;
    /** 反伤：被啃咬时每秒反弹给攻击者的伤害（兀突骨尖刺） */
    thorns?: number;
    /** 弹道是否贯穿整行（马岱回旋镖） */
    pierce?: boolean;
    /** 引信时间（秒），爆炸类单位落地后倒计时 */
    fuse?: number;
    /** 天赋技配置 */
    talent?: ITalentConfig;
}

/** 敌军配置 */
export interface IEnemyConfig {
    id: string;
    nameKey: string;
    descKey: string;
    kind: EnemyKind;
    hp: number;
    /** 护甲值（先于生命值被消耗） */
    armor: number;
    /** 移动速度（格 / 秒） */
    speed: number;
    /** 啃咬伤害（每秒） */
    eat: number;
    /** 占位图上的单字标识 */
    tag: string;
    /** 占位色（#RRGGBB） */
    color: string;
    /** 正式美术资源路径（可选） */
    icon?: string;
    /** 体型缩放 */
    size?: number;
    /** 是否为 Boss */
    boss?: boolean;
    /** 是否无视阻挡（掘地） */
    bypassWall?: boolean;
    /** 是否可跳过第一个阻挡单位（飞骑） */
    jump?: boolean;
    /** 是否从场内空降登场（斥候） */
    sky?: boolean;
    /** 被击杀时劫获的军粮（民夫 / 辎重车） */
    loot?: number;
    /** 受伤系数（0.7 表示只承受 70% 伤害） */
    dmgMul?: number;
    /** 首次受击怯战时长（秒，每名敌军一次） */
    hesitate?: number;
    /** 挖壕：无阻挡时每隔固定时间叠加减伤层（工程兵） */
    dig?: boolean;
    /** 远程抛射（弓箭兵）：推进到距城 range 格停驻，每 interval 秒抛射最靠城的武将 */
    lob?: IEnemyRanged;
    /** 行进射击（弩兵 / 骑射） */
    shoot?: IEnemyRanged;
    /** 跃越阻挡后的首击伤害（冲锋） */
    charge?: number;
    /** 跃越阻挡时对越过目标的践踏伤害 */
    stomp?: number;
}

/** 敌方远程攻击参数 */
export interface IEnemyRanged {
    /** 单次伤害 */
    damage: number;
    /** 间隔（秒） */
    interval: number;
    /** 连发数（默认 1） */
    volley?: number;
    /** 停驻距离（格，仅 lob 使用） */
    range?: number;
}

/** 弹道飞行方式 */
export enum ProjectileKind {
    /** 水平直线 */
    Line = 'line',
    /** 抛物线 */
    Arc = 'arc',
}

/** 弹道配置 */
export interface IProjectileConfig {
    id: string;
    kind: ProjectileKind;
    /** 飞行速度（格 / 秒） */
    speed: number;
    color: string;
    /** 线宽（像素，占位表现用） */
    width?: number;
    /** 溅射半径（格） */
    splash?: number;
    /** 命中减速比例 */
    slow?: number;
    /** 减速持续（秒） */
    slowDuration?: number;
}

/** 波次中的出兵分组 */
export interface IWaveGroupConfig {
    /** 敌军 id */
    enemy: string;
    /** 出生行：-1 表示随机 */
    row: number;
    /** 数量 */
    count: number;
    /** 同组出生间隔（秒） */
    interval: number;
    /** 组内首次出兵延迟（秒） */
    delay?: number;
}

/** 波次配置 */
export interface IWaveConfig {
    id: string;
    /** 相对战斗开始的绝对时间（秒） */
    at: number;
    /** 是否为大波（显示横幅） */
    big?: boolean;
    groups: IWaveGroupConfig[];
}

/** 关卡预置单位 */
export interface IPrePlantConfig {
    unit: string;
    row: number;
    col: number;
}

/** 关卡配置 */
export interface ILevelConfig {
    id: number;
    nameKey: string;
    /** 初始军粮 */
    initialFood: number;
    /** 军粮上限 */
    maxFood: number;
    /** 天降军粮间隔（秒） */
    dropInterval: number;
    /** 天降军粮单次数量 */
    dropValue: number;
    /** 可招募卡片（unit id 列表，即卡片栏顺序） */
    units: string[];
    /** 波次 id 列表 */
    waves: string[];
    /** 拒马数量（保命道具） */
    mowers: number;
    /** 二星时间要求（秒） */
    starTime: number;
    /** 通关后解锁的关卡 id */
    unlockNext?: number;
    /** 开始战斗时预置的单位 */
    prePlants?: IPrePlantConfig[];
    /** 是否启用新手引导 */
    guide?: boolean;
    /** 关卡提示文案 */
    tip?: string;
    /** 地形限制：不可部署的行 */
    terrain?: ILevelTerrain;
    /** 夜间关：军粮产出 -30% */
    night?: boolean;
    /** 浓雾关：右侧两列视觉遮蔽 */
    fog?: boolean;
    /** 墓碑格（不可部署）：[row, col] */
    graves?: number[][];
    /** 关末主将名（仅展示） */
    bossName?: string;
    /** 无尽模式：波次程序生成，无胜利条件 */
    endless?: boolean;
}

/** 关卡地形限制 */
export interface ILevelTerrain {
    /** 高山：不可部署的行 */
    mountain?: number[];
    /** 河流：不可部署的行 */
    river?: number[];
}

/** 剧情台词 */
export interface IStoryLine {
    /** 说话人语言键（旁白用 story_narrator） */
    who: string;
    /** 台词语言键 */
    text: string;
}

/** 剧情段 */
export interface IStoryConfig {
    id: string;
    lines: IStoryLine[];
}

/** 装备槽位 */
export enum EquipSlot {
    Weapon = 'weapon',
    Armor = 'armor',
    Horse = 'horse',
    Treasure = 'treasure',
}

/** 装备配置 */
export interface IEquipConfig {
    id: string;
    nameKey: string;
    descKey: string;
    slot: EquipSlot;
    /** 品阶 1~5 */
    tier: number;
    /** 攻击加成 */
    atkPct?: number;
    /** 生命加成 */
    hpPct?: number;
    /** 攻速加成 */
    aspd?: number;
    /** 暴击率 */
    critPct?: number;
    /** 部署冷却缩减（秒） */
    cdReduce?: number;
}

/** 羁缘效果 */
export interface IBondEffect {
    /** 攻击加成 */
    atk?: number;
    /** 攻速加成 */
    aspd?: number;
    /** 生命加成（部署时生效） */
    hp?: number;
}

/** 羁缘配置 */
export interface IBondConfig {
    id: string;
    nameKey: string;
    /** 需要的武将 id */
    members: string[];
    effect: IBondEffect;
}

/** 全局玩法配置 */
export interface IGameplayConfig {
    /** 战场行数 */
    rows: number;
    /** 战场列数 */
    cols: number;
    /** 设计格子宽度（像素） */
    cellWidth: number;
    /** 设计格子高度（像素） */
    cellHeight: number;
    /** 左侧城墙预留宽度（像素） */
    leftWallWidth: number;
    /** 顶部 HUD 高度（像素） */
    topBarHeight: number;
    /** 底部操作栏高度（像素） */
    bottomBarHeight: number;
    /** 拒马相对第 0 列的横向位置（格） */
    mowerOffset: number;
    /** 敌军出生点（格） */
    spawnX: number;
    /** 敌军越过该位置即触发拒马 / 扣城门耐久（格） */
    dangerX: number;
    /** 城门耐久（敌军贴墙一次扣 1，Boss 扣 5，归零判负） */
    gateHp: number;

    /** 连击窗口（秒） */
    comboWindow: number;
    /** 触发连击所需击杀数 */
    comboKills: number;
    /** 连击奖励军粮 */
    comboReward: number;
    /** 拒马触发后城门无敌时长（秒） */
    mowerInvuln: number;
    /** 撤退返还比例 */
    refundRate: number;
    /** 同名武将重复上阵的涨价比例 */
    repeatCostMul: number;
    /** 夜间关军粮产出系数 */
    nightFoodMul: number;
    /** 击杀基础掉粮 */
    killGold: number;
    /** 教学关敌军生命系数（参考稿 0.6） */
    tutEnemyHp: number;
    /** 通关掉落装备的概率 */
    equipDropRate: number;
}

/** 表间校验结果 */
export interface IValidationIssue {
    table: string;
    id: string;
    message: string;
}
