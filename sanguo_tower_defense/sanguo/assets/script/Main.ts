import { _decorator, Node, ResolutionPolicy, profiler, view } from 'cc';
import { LogType } from 'db://oops-framework/core/common/log/Logger';
import { oops } from 'db://oops-framework/core/Oops';
import { Root } from 'db://oops-framework/core/Root';
import { ecs } from 'db://oops-framework/libs/ecs/ECS';
import { UIConfigData } from './game/common/config/GameUIConfig';
import { GameDebugConfig } from './game/common/config/GameDebugConfig';
import { smc } from './game/common/SingletonModuleComp';
import { Initialize } from './game/initialize/Initialize';

const { ccclass, property } = _decorator;

@ccclass('Main')
export class Main extends Root {
    @property({
        type: Node,
        tooltip: '游戏初始画面',
    })
    initial: Node = null!;

    @property({
        tooltip: '调试模式：显示左下角帧率/绘制统计，并开启战斗调试面板与快捷键',
    })
    debugMode = false;

    protected iniStart() {
        this.applyDebugMode();

        oops.log.setTags(
            // LogType.Net | LogType.Model | LogType.Business | LogType.View | LogType.Config | LogType.Trace
            LogType.Model | LogType.Business | LogType.View | LogType.Config | LogType.Trace,
        );
    }

    protected initGui() {
        // 三国塔防按 1280x720 横屏设计。
        // SHOW_ALL：任何屏幕比例下保证整块 1280x720 设计区完整可见，不足部分留黑边
        // （FIXED_HEIGHT 会在竖屏或 4:3 屏幕上裁掉左右内容）。
        view.setDesignResolutionSize(1280, 720, ResolutionPolicy.SHOW_ALL);
        oops.gui.init(UIConfigData);
    }

    protected run() {
        // Root 在配置加载后会按 config.json 的 stats 覆盖一次 Profiler，
        // 这里在 run（配置加载之后）再按 debugMode 强制一次，保证以脚本配置为准。
        this.applyDebugMode();

        smc.initialize = ecs.getEntity(Initialize);
        smc.initialize.load(this.initial);
    }

    /** 应用调试模式：Profiler 统计 + 运行期调试开关 */
    private applyDebugMode(): void {
        GameDebugConfig.setEnabled(this.debugMode);
        if (this.debugMode) profiler.showStats();
        else profiler.hideStats();
    }
}
