// 全局布局与数值配置（三国力量防御 - 最小可运行版）

export const ROWS = 5;
export const COLS = 9;
export const CELL = 80;

export const GRID_W = COLS * CELL; // 720
export const GRID_H = ROWS * CELL; // 400

export const ORIGIN_X = -GRID_W / 2; // -360
export const ORIGIN_Y = -GRID_H / 2; // -200

export function cellCenter(row: number, col: number): { x: number; y: number } {
    return {
        x: ORIGIN_X + col * CELL + CELL / 2,
        y: ORIGIN_Y + row * CELL + CELL / 2,
    };
}

// 左侧底线：敌人越过即漏怪
export const BASE_X = ORIGIN_X - CELL * 0.5; // -400
// 右侧出生点
export const SPAWN_X = ORIGIN_X + GRID_W + CELL * 0.5; // 400

export interface PlantConf {
    cost: number;
    hp: number;
    atk: number;
    atkInterval: number; // 攻击间隔（秒）
    range: number;       // 攻击射程（像素，向右）
    color: number;
    name: string;
}

export const PLANT_CONFIG: Record<string, PlantConf> = {
    soldier:  { cost: 50,  hp: 100, atk: 10, atkInterval: 1.0, range: 360, color: 0x4caf50, name: '士' },
    archer:   { cost: 75,  hp: 80,  atk: 15, atkInterval: 1.5, range: 480, color: 0x2196f3, name: '弓' },
    cavalry:  { cost: 100, hp: 120, atk: 12, atkInterval: 0.8, range: 320, color: 0xff9800, name: '骑' },
    general:  { cost: 150, hp: 200, atk: 25, atkInterval: 0.6, range: 360, color: 0x9c27b0, name: '将' },
    ballista: { cost: 200, hp: 150, atk: 30, atkInterval: 2.0, range: 560, color: 0xf44336, name: '弩' },
};

export const PLANT_ORDER = ['soldier', 'archer', 'cavalry', 'general', 'ballista'];

export interface EnemyConf {
    hp: number;
    atk: number;
    speed: number;      // 移动速度（像素/秒）
    atkInterval: number;
    reward: number;
    color: number;
    name: string;
}

export const ENEMY_CONFIG: Record<string, EnemyConf> = {
    soldier: { hp: 100, atk: 10, speed: 30, atkInterval: 1.0, reward: 10, color: 0x795548, name: '兵' },
    archer:  { hp: 80,  atk: 15, speed: 25, atkInterval: 1.5, reward: 15, color: 0x607d8b, name: '弓' },
    cavalry: { hp: 120, atk: 12, speed: 50, atkInterval: 0.8, reward: 20, color: 0x3f51b5, name: '骑' },
    general: { hp: 200, atk: 25, speed: 20, atkInterval: 0.6, reward: 50, color: 0x9c27b0, name: '将' },
    siege:   { hp: 300, atk: 20, speed: 15, atkInterval: 2.0, reward: 30, color: 0x424242, name: '械' },
    boss:    { hp: 3000, atk: 40, speed: 10, atkInterval: 1.0, reward: 500, color: 0xffd700, name: '王' },
};

// 关卡配置（敌人类型与数量），对应开发计划中的 10 关
export const LEVELS: { type: string; count: number }[][] = [
    [{ type: 'soldier', count: 10 }],
    [{ type: 'soldier', count: 8 }, { type: 'archer', count: 7 }],
    [{ type: 'archer', count: 10 }, { type: 'cavalry', count: 10 }],
    [{ type: 'cavalry', count: 13 }, { type: 'general', count: 12 }],
    [{ type: 'soldier', count: 8 }, { type: 'archer', count: 7 }, { type: 'cavalry', count: 7 }, { type: 'general', count: 4 }, { type: 'siege', count: 4 }],
    [{ type: 'general', count: 18 }, { type: 'siege', count: 17 }],
    [{ type: 'soldier', count: 8 }, { type: 'archer', count: 8 }, { type: 'cavalry', count: 8 }, { type: 'general', count: 8 }, { type: 'siege', count: 8 }],
    [{ type: 'siege', count: 25 }],
    [{ type: 'soldier', count: 10 }, { type: 'archer', count: 10 }, { type: 'cavalry', count: 10 }, { type: 'general', count: 10 }, { type: 'siege', count: 10 }],
    [{ type: 'boss', count: 1 }],
];
