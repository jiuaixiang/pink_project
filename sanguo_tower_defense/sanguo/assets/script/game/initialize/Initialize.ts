import type { Node } from 'cc';
import { ecs } from 'db://oops-framework/libs/ecs/ECS';
import { CCEntity } from 'db://oops-framework/module/common/CCEntity';
import { InitialViewComp } from './view/InitialViewComp';

/**
 * 游戏进入初始化模块
 * 1、热更新
 * 2、加载默认资源
 */
@ecs.register('Initialize')
export class Initialize extends CCEntity {
    /** 初始化游戏公共资源 */
    load(initial: Node) {
        this.add(initial.addComponent(InitialViewComp));
    }
}
