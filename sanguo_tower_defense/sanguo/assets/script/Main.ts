import { _decorator, Node, ResolutionPolicy, view } from 'cc';
import { LogType } from 'db://oops-framework/core/common/log/Logger';
import { oops } from 'db://oops-framework/core/Oops';
import { Root } from 'db://oops-framework/core/Root';
import { ecs } from 'db://oops-framework/libs/ecs/ECS';
import { UIConfigData } from './game/common/config/GameUIConfig';
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

    protected iniStart() {
        oops.log.setTags(
            // LogType.Net |
            LogType.Model | LogType.Business | LogType.View | LogType.Config | LogType.Trace
        );
    }

    protected initGui() {
        // 三国塔防按 1280x720 横屏设计。
        // 使用 SHOW_ALL：任何屏幕比例下保证整块 1280x720 设计区完整可见，
        // 不足部分留黑边（FIXED_HEIGHT 会在竖屏或 4:3 屏幕上裁掉左右内容）。
        // view.setDesignResolutionSize(1280, 720, ResolutionPolicy.SHOW_ALL);
        oops.gui.init(UIConfigData);
    }

    protected run() {
        smc.initialize = ecs.getEntity(Initialize);
        smc.initialize.load(this.initial);
    }
}
