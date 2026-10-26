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
    /** 产出军粮（桃园义士） */
    Producer = 'producer',
    /** 直线射击（弓弩手、连弩营、寒冰弓手） */
    Shooter = 'shooter',
    /** 纯阻挡（藤甲兵、铁壁盾卫） */
    Wall = 'wall',
    /** 一次性范围爆炸（火油罐） */
    Bomber = 'bomber',
    /** 整行清场（烈火战车） */
    RowClear = 'rowclear',
    /** 同排光环增益（战鼓吏） */
    Support = 'support',
    /** 埋设陷阱（陷阵营） */
    Mine = 'mine',
    /** 抛射溅射（投石车） */
    Lobber = 'lobber',
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
    /** 敌军越过该位置即触发拒马 / 失败（格） */
    dangerX: number;
}

/** 表间校验结果 */
export interface IValidationIssue {
    table: string;
    id: string;
    message: string;
}
