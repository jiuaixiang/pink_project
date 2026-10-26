import { _decorator, Node } from 'cc';
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
        oops.gui.init(UIConfigData);
    }

    protected run() {
        smc.initialize = ecs.getEntity(Initialize);
        smc.initialize.load(this.initial);
    }
}
