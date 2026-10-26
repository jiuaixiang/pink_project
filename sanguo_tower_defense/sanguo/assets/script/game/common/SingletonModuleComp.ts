import { ecs } from 'db://oops-framework/libs/ecs/ECS';
import type { Account } from '../account/Account';
import type { Initialize } from '../initialize/Initialize';

/** 游戏单例业务模块 */
@ecs.register('SingletonModule')
export class SingletonModuleComp extends ecs.Comp {
    /** 游戏初始化模块 */
    initialize: Initialize = null!;
    /** 游戏账号模块 */
    account: Account = null!;

    reset() {}
}

export const smc: SingletonModuleComp = ecs.getSingleton(SingletonModuleComp);
