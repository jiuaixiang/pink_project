import type { ILevelConfig, IUnitConfig, IValidationIssue, IWaveConfig } from './ITable';
import { EnemyKind, ProjectileKind, UnitKind } from './ITable';
import { TableEnemies } from './TableEnemies';
import { TableGameplay } from './TableGameplay';
import { TableLevels } from './TableLevels';
import { TableProjectiles } from './TableProjectiles';
import { TableUnits } from './TableUnits';
import { TableWaves } from './TableWaves';

/**
 * 配置表校验器
 *
 * 1、补齐缺省字段，保证运行期不用到处写 undefined 判断
 * 2、检查表间引用（卡片 → 单位、关卡 → 波次、波次 → 敌军、单位 → 弹道）
 * 3、只在首次校验时输出一次告警日志，坏数据降级而不是崩溃
 */
export class TableValidator {
    private static issues: IValidationIssue[] = [];
    private static validated = false;

    /** 执行校验（幂等，可重复调用） */
    static validate(): IValidationIssue[] {
        if (this.validated) return this.issues;
        this.validated = true;
        this.issues = [];

        this.validateUnits();
        this.validateEnemies();
        this.validateProjectiles();
        this.validateWaves();
        this.validateLevels();

        if (this.issues.length > 0) {
            console.warn(`[三国塔防] 配置表校验发现 ${this.issues.length} 处问题：`);
            for (const issue of this.issues) {
                console.warn(`  · [${issue.table}] ${issue.id}：${issue.message}`);
            }
        }
        return this.issues;
    }

    /** 本次校验发现的问题（调试面板展示用） */
    static getIssues(): IValidationIssue[] {
        return this.issues;
    }

    private static add(table: string, id: string, message: string) {
        this.issues.push({ table, id, message });
    }

    private static isHexColor(value: unknown): boolean {
        return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
    }

    private static validateUnits() {
        const gameplay = TableGameplay.get();
        for (const cfg of TableUnits.all()) {
            if (!cfg.nameKey) this.add('units', cfg.id, '缺少 nameKey');
            if (!cfg.descKey) this.add('units', cfg.id, '缺少 descKey');
            if (!this.isHexColor(cfg.color)) {
                cfg.color = '#C8A15A';
                this.add('units', cfg.id, 'color 非法，已回退为 #C8A15A');
            }
            if (!cfg.tag) cfg.tag = (cfg.nameKey || cfg.id).slice(-1);
            if (!(cfg.cost >= 0)) {
                cfg.cost = 0;
                this.add('units', cfg.id, 'cost 非法，已回退为 0');
            }
            if (!(cfg.cooldown > 0)) {
                cfg.cooldown = 5;
                this.add('units', cfg.id, 'cooldown 非法，已回退为 5 秒');
            }
            if (!(cfg.hp > 0)) {
                cfg.hp = 300;
                this.add('units', cfg.id, 'hp 非法，已回退为 300');
            }

            cfg.volley = Math.max(1, Math.floor(cfg.volley ?? 1));
            cfg.rows = Math.max(1, Math.floor(cfg.rows ?? 1));

            switch (cfg.kind) {
                case UnitKind.Shooter:
                case UnitKind.Lobber:
                    if (!(cfg.atk! > 0)) {
                        cfg.atk = 20;
                        this.add('units', cfg.id, 'atk 非法，已回退为 20');
                    }
                    if (!(cfg.interval! > 0)) {
                        cfg.interval = 1.4;
                        this.add('units', cfg.id, 'interval 非法，已回退为 1.4 秒');
                    }
                    if (!cfg.projectile) {
                        cfg.projectile = cfg.kind === UnitKind.Lobber ? 'stone' : 'arrow';
                        this.add('units', cfg.id, '缺少 projectile，已回退为 ' + cfg.projectile);
                    }
                    else {
                        const proj = TableProjectiles.get(cfg.projectile);
                        if (proj == null) {
                            this.add('units', cfg.id, `弹道 ${cfg.projectile} 不存在`);
                        }
                        else if (proj.kind === ProjectileKind.Line) {
                            // 直线弹道需要投射物速度参与命中判定，无额外字段
                        }
                    }
                    if (cfg.kind === UnitKind.Lobber && !(cfg.splash! > 0)) {
                        cfg.splash = 0.6;
                    }
                    break;
                case UnitKind.Producer:
                    if (cfg.produce == null || !(cfg.produce.interval > 0) || !(cfg.produce.value > 0)) {
                        cfg.produce = { interval: 12, value: 25 };
                        this.add('units', cfg.id, 'produce 非法，已回退为 12 秒 / 25 军粮');
                    }
                    break;
                case UnitKind.Bomber:
                case UnitKind.RowClear:
                case UnitKind.Mine:
                    if (!(cfg.damage! > 0)) {
                        cfg.damage = 1800;
                        this.add('units', cfg.id, 'damage 非法，已回退为 1800');
                    }
                    if (cfg.kind === UnitKind.Bomber && !(cfg.radius! > 0)) {
                        cfg.radius = 1.2;
                    }
                    if (cfg.kind === UnitKind.Mine && !(cfg.armTime! > 0)) {
                        cfg.armTime = 12;
                        this.add('units', cfg.id, 'armTime 非法，已回退为 12 秒');
                    }
                    break;
                case UnitKind.Support:
                    if (!(cfg.auraAtk! > 0) && !(cfg.auraSpeed! > 0)) {
                        cfg.auraAtk = 0.2;
                        cfg.auraSpeed = 0.25;
                        this.add('units', cfg.id, '缺少光环参数，已回退为 +20% 攻击 / +25% 攻速');
                    }
                    break;
                case UnitKind.Wall:
                    break;
                default:
                    this.add('units', cfg.id, `未知行为类型 ${String(cfg.kind)}`);
                    break;
            }

            if (cfg.slowFactor != null && (cfg.slowFactor <= 0 || cfg.slowFactor >= 1)) {
                this.add('units', cfg.id, 'slowFactor 应在 0~1 之间（0.5 表示减速 50%）');
            }
            if (gameplay.rows <= 0) this.add('gameplay', 'rows', '行数非法');
        }
    }

    private static validateEnemies() {
        for (const cfg of TableEnemies.all()) {
            if (!cfg.nameKey) this.add('enemies', cfg.id, '缺少 nameKey');
            if (!cfg.descKey) this.add('enemies', cfg.id, '缺少 descKey');
            if (!this.isHexColor(cfg.color)) {
                cfg.color = '#8A9A6B';
                this.add('enemies', cfg.id, 'color 非法，已回退为 #8A9A6B');
            }
            if (!cfg.tag) cfg.tag = '兵';
            if (!(cfg.hp > 0)) {
                cfg.hp = 200;
                this.add('enemies', cfg.id, 'hp 非法，已回退为 200');
            }
            if (!(cfg.armor >= 0)) {
                cfg.armor = 0;
                this.add('enemies', cfg.id, 'armor 非法，已回退为 0');
            }
            if (!(cfg.speed > 0) || cfg.speed > 2) {
                cfg.speed = 0.24;
                this.add('enemies', cfg.id, 'speed 应在 (0, 2] 格/秒，已回退为 0.24');
            }
            if (!(cfg.eat > 0)) {
                cfg.eat = 100;
                this.add('enemies', cfg.id, 'eat 非法，已回退为 100');
            }
            if (cfg.size == null || cfg.size <= 0) cfg.size = 1;
            if (cfg.kind == null) cfg.kind = EnemyKind.Normal;
        }
    }

    private static validateProjectiles() {
        for (const cfg of TableProjectiles.all()) {
            if (!(cfg.speed > 0)) {
                cfg.speed = 6;
                this.add('projectiles', cfg.id, 'speed 非法，已回退为 6');
            }
            if (cfg.kind == null) cfg.kind = ProjectileKind.Line;
            if (!this.isHexColor(cfg.color)) {
                cfg.color = '#F2E6D0';
                this.add('projectiles', cfg.id, 'color 非法，已回退为 #F2E6D0');
            }
            if (cfg.width == null || cfg.width <= 0) cfg.width = 5;
        }
    }

    private static validateWaves() {
        const gameplay = TableGameplay.get();
        for (const wave of TableWaves.all()) {
            this.validateWave(wave, gameplay.rows);
        }
    }

    private static validateWave(wave: IWaveConfig, rows: number) {
        if (!(wave.at >= 0)) {
            wave.at = 0;
            this.add('waves', wave.id, 'at 非法，已回退为 0');
        }
        if (!Array.isArray(wave.groups) || wave.groups.length === 0) {
            this.add('waves', wave.id, '缺少 groups');
            return;
        }
        for (const group of wave.groups) {
            if (TableEnemies.get(group.enemy) == null) {
                this.add('waves', wave.id, `敌兵 ${group.enemy} 不存在`);
            }
            if (group.row == null) group.row = -1;
            if (group.row < -1 || group.row >= rows) {
                this.add('waves', wave.id, `row=${group.row} 超出 0~${rows - 1}（-1 表示随机）`);
                group.row = -1;
            }
            if (!(group.count > 0)) {
                group.count = 1;
                this.add('waves', wave.id, 'count 非法，已回退为 1');
            }
            if (!(group.interval >= 0)) group.interval = 1;
            if (!(group.delay! >= 0)) group.delay = 0;
        }
    }

    private static validateLevels() {
        const gameplay = TableGameplay.get();
        for (const level of TableLevels.getSorted()) {
            this.validateLevel(level, gameplay.rows, gameplay.cols);
        }
        if (TableLevels.count === 0) {
            this.add('levels', '-', '关卡表为空，无法进入战斗');
        }
    }

    private static validateLevel(level: ILevelConfig, rows: number, cols: number) {
        if (!level.nameKey) level.nameKey = `level_${level.id}_name`;
        if (!Array.isArray(level.units)) level.units = [];
        if (level.units.length === 0) {
            this.add('levels', String(level.id), '未配置可招募卡片');
        }
        for (const unitId of level.units) {
            const cfg: IUnitConfig | null = TableUnits.get(unitId);
            if (cfg == null) this.add('levels', String(level.id), `卡片单位 ${unitId} 不存在`);
        }
        if (!Array.isArray(level.waves) || level.waves.length === 0) {
            this.add('levels', String(level.id), '未配置波次');
            level.waves = [];
        }
        for (const waveId of level.waves) {
            if (!TableWaves.has(waveId)) this.add('levels', String(level.id), `波次 ${waveId} 不存在`);
        }
        if (!(level.initialFood >= 0)) {
            level.initialFood = 50;
            this.add('levels', String(level.id), 'initialFood 非法，已回退为 50');
        }
        if (!(level.maxFood > 0)) level.maxFood = 9990;
        if (!(level.dropInterval > 0)) level.dropInterval = 10;
        if (!(level.dropValue > 0)) level.dropValue = 25;
        if (level.mowers == null || level.mowers < 0) level.mowers = 3;
        if (!(level.starTime > 0)) {
            level.starTime = 240;
            this.add('levels', String(level.id), 'starTime 非法，已回退为 240 秒');
        }
        if (level.mowers > rows) level.mowers = rows;

        if (Array.isArray(level.prePlants)) {
            for (const pre of level.prePlants) {
                if (TableUnits.get(pre.unit) == null) {
                    this.add('levels', String(level.id), `预置单位 ${pre.unit} 不存在`);
                }
                if (pre.row < 0 || pre.row >= rows || pre.col < 0 || pre.col >= cols) {
                    this.add('levels', String(level.id), `预置单位坐标 (${pre.row},${pre.col}) 越界`);
                }
            }
        }
    }

    /** 配置热重载后允许重新校验 */
    static reset(): void {
        this.validated = false;
        this.issues = [];
    }
}

/** 便捷调用：确保配置已校验 */
export function ensureTables(): void {
    TableValidator.validate();
}
