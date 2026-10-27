import type { Node } from 'cc';
import { oops } from 'db://oops-framework/core/Oops';
import { BattlePrefab } from '../common/config/GameUIConfig';
import { PlayerModel } from '../common/model/PlayerModel';
import { SettingsModel } from '../common/model/SettingsModel';
import type { ILevelConfig } from '../common/table/ITable';
import { TableLevels } from '../common/table/TableLevels';
import { BattleJudge } from './logic/BattleJudge';
import { BattleModel } from './logic/BattleModel';
import { DeploySystem } from './logic/DeploySystem';
import { EconomySystem } from './logic/EconomySystem';
import { EnemySystem } from './logic/EnemySystem';
import { LawnmowerSystem } from './logic/LawnmowerSystem';
import { ProjectileSystem } from './logic/ProjectileSystem';
import { UnitSystem } from './logic/UnitSystem';
import { WaveSystem } from './logic/WaveSystem';
import { BattleViewComp } from './view/BattleViewComp';

/** 战斗结算数据 */
export interface IBattleSummary {
    levelId: number;
    win: boolean;
    stars: number;
    time: number;
    kills: number;
    /** 本局新解锁的关卡（0 表示没有新解锁） */
    unlocked: number;
}

/** 固定步长（秒） */
const FIXED_STEP = 1 / 60;
/** 单帧最多追帧次数，防止切后台后长时间卡顿 */
const MAX_STEPS = 6;

/**
 * 战斗模块入口
 *
 * 职责：
 * 1、创建/销毁战斗场景（必须通过 oops.gui.game.add，LayerGame 不支持 gui.open）
 * 2、按固定步长驱动逻辑系统，逻辑与表现共用同一时间轴
 * 3、结算时写入存档并缓存结算数据供结算界面读取
 */
export class Battle {
    private static inst: Battle | null = null;
    /** 加载序号，用于作废过期的异步启动流程 */
    private static seq = 0;

    /** 当前战斗实例 */
    static get current(): Battle | null {
        return this.inst;
    }

    /** 打开指定关卡 */
    static open(levelId: number): void {
        if (this.inst != null) this.inst.dispose();
        const battle = new Battle();
        this.inst = battle;
        void battle.start(levelId);
    }

    /** 重开当前关卡 */
    static restart(levelId: number): void {
        this.open(levelId);
    }

    /** 关闭战斗并释放资源 */
    static close(): void {
        if (this.inst == null) return;
        this.inst.dispose();
        this.inst = null;
    }

    model: BattleModel | null = null;
    view: BattleViewComp | null = null;

    private node: Node | null = null;
    private level: ILevelConfig | null = null;
    private accumulator = 0;
    private summary: IBattleSummary | null = null;
    private summaryTaken = false;

    /** 是否结算完成 */
    get isOver(): boolean {
        return this.model != null && this.model.over;
    }

    /** 取走结算数据（只返回一次，避免重复弹窗） */
    takeSummary(): IBattleSummary | null {
        if (this.summaryTaken) return this.summary;
        this.summaryTaken = true;
        return this.summary;
    }

    /** 当前关卡 id */
    get levelId(): number {
        return this.level == null ? 0 : this.level.id;
    }

    private async start(levelId: number): Promise<void> {
        const level = TableLevels.get(String(levelId)) ?? TableLevels.getFirst();
        if (level == null) {
            oops.gui.toast('关卡配置缺失');
            console.error('[三国塔防] 关卡配置缺失，无法进入战斗');
            return;
        }
        this.level = level;
        const model = new BattleModel(level);
        // 沿用设置中的默认倍速
        model.speed = SettingsModel.inst.speed >= 2 ? 2 : 1;
        this.model = model;

        // 关卡预置布阵
        for (const pre of level.prePlants ?? []) {
            DeploySystem.placeFree(model, pre.unit, pre.row, pre.col);
        }

        const seq = ++Battle.seq;
        let node: Node | null = null;
        try {
            node = await oops.gui.game.add(BattlePrefab);
        }
        catch (e) {
            console.error('[三国塔防] 战斗场景加载失败', e);
        }

        // 加载期间已被重开/关闭，直接丢弃本次节点
        if (seq !== Battle.seq || Battle.inst !== this) {
            if (node != null && node.isValid) oops.gui.game.remove(node);
            return;
        }

        if (node == null) {
            oops.gui.toast('战斗场景加载失败');
            this.dispose();
            return;
        }

        this.node = node;
        this.view = node.getComponent(BattleViewComp);
        if (this.view == null) {
            console.error('[三国塔防] 战斗预制体未挂载 BattleViewComp');
            this.dispose();
            return;
        }
        this.view.init(this, model);
    }

    /** 每帧驱动（由视图 update 调用） */
    tick(dtRaw: number): void {
        const model = this.model;
        if (model == null || model.over || model.paused) return;

        // 裁剪单帧时间，避免切后台回来一次跳到很后面
        const dt = Math.min(Math.max(dtRaw, 0), 0.05) * model.speed;
        this.accumulator += dt;

        let steps = 0;
        while (this.accumulator >= FIXED_STEP && steps < MAX_STEPS) {
            this.step(FIXED_STEP);
            this.accumulator -= FIXED_STEP;
            steps += 1;
            if (model.over) break;
        }
        if (steps >= MAX_STEPS) this.accumulator = 0;
    }

    private step(dt: number): void {
        const model = this.model!;
        model.time += dt;

        DeploySystem.update(model, dt);
        WaveSystem.update(model, dt);
        EconomySystem.update(model, dt);
        UnitSystem.update(model, dt);
        ProjectileSystem.update(model, dt);
        EnemySystem.update(model, dt);
        LawnmowerSystem.update(model);
        BattleJudge.update(model);

        this.prune(model);

        if (model.over) this.finalize();
    }

    /** 清理死亡对象，保持数组紧凑 */
    private prune(model: BattleModel): void {
        this.compact(model.units);
        this.compact(model.enemies);
        this.compact(model.projectiles);
        this.compact(model.drops);
    }

    private compact<T extends { alive: boolean }>(list: T[]): void {
        let write = 0;
        for (let read = 0; read < list.length; read++) {
            if (!list[read].alive) continue;
            list[write] = list[read];
            write += 1;
        }
        list.length = write;
    }

    /** 结算：写存档、缓存结果 */
    private finalize(): void {
        const model = this.model;
        const level = this.level;
        if (model == null || level == null || this.summary != null) return;

        const beforeUnlock = PlayerModel.inst.unlocked;
        PlayerModel.inst.recordBattle({
            levelId: level.id,
            win: model.win,
            stars: model.stars,
            time: model.time,
            kills: model.kills,
        });
        const afterUnlock = PlayerModel.inst.unlocked;

        this.summary = {
            levelId: level.id,
            win: model.win,
            stars: model.stars,
            time: model.time,
            kills: model.kills,
            unlocked: afterUnlock > beforeUnlock ? afterUnlock : 0,
        };
        model.paused = true;
    }

    pause(): void {
        if (this.model != null) this.model.paused = true;
    }

    resume(): void {
        if (this.model != null) this.model.paused = false;
        this.accumulator = 0;
    }

    setSpeed(speed: number): void {
        if (this.model != null) this.model.speed = speed >= 2 ? 2 : 1;
    }

    get speed(): number {
        return this.model == null ? 1 : this.model.speed;
    }

    /** 关闭战斗：先停逻辑，再交给框架销毁节点并释放预制体 */
    dispose(): void {
        Battle.seq += 1;

        const view = this.view;
        this.view = null;
        if (view != null && view.node != null && view.node.isValid) {
            view.teardown();
        }

        const node = this.node;
        this.node = null;
        if (node != null && node.isValid) {
            try {
                oops.gui.game.remove(node);
            }
            catch (e) {
                console.warn('[三国塔防] 战斗场景移除异常', e);
                node.destroy();
            }
        }

        this.model = null;
        this.level = null;
        this.summary = null;
        this.summaryTaken = false;
        this.accumulator = 0;
    }
}

/** 供调试面板直接驱动一帧（不经过视图） */
export function battleStepOnce(): void {
    const battle = Battle.current;
    if (battle != null) battle.tick(FIXED_STEP);
}


