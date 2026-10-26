import type { Color } from 'cc';
import { _decorator, color, tween } from 'cc';
import { oops } from 'db://oops-framework/core/Oops';
import { JsonUtil } from 'db://oops-framework/core/utils/JsonUtil';
import { ViewUtil } from 'db://oops-framework/core/utils/ViewUtil';
import { ecs } from 'db://oops-framework/libs/ecs/ECS';
import { CCView } from 'db://oops-framework/module/common/CCView';
import { CommonStorageConfig } from '../../common/config/GameStorageConfig';
import type { Initialize } from '../Initialize';
import { LoadingViewComp } from './LoadingViewComp';

const { ccclass, property } = _decorator;

/** 游戏初始画面 - 避免加载框架通用资源与自定义游戏资源过长时的过度画面 */
@ccclass('InitialViewComp')
@ecs.register('InitialView', false)
export class InitialViewComp extends CCView<Initialize> {
    /** 等待动画播放完成 */
    private waitComplete = false;
    /** 资源加载完成 */
    private loadComplete = false;

    //#region 体验动画相关自定义逻辑
    private startColor = color(255, 0, 0, 0);
    private endColor = color(255, 0, 0, 255);
    private duration = 0;

    // TODO: 这里实现的效果为动画播放完，初始化完成则进入第一个界面；如果动画未播放完，初始化完成时，会等动画播放完进入第一个界面（注：动画逻辑可自定义，注意资源要尽可能小，让玩家更快看到提示画面）
    private waitAnim(startColor: Color, endColor: Color, callback: Function) {
        const title = this.node.getChildByName('title')!.uiLabel;
        tween(title)
            .to(this.duration, { color: endColor }, {
                onUpdate: (target, ratio) => {
                    const r = startColor.r + (endColor.r - startColor.r) * ratio!;
                    const g = startColor.g + (endColor.g - startColor.g) * ratio!;
                    const b = startColor.b + (endColor.b - startColor.b) * ratio!;
                    const a = startColor.a + (endColor.a - startColor.a) * ratio!;
                    title.color.set(r, g, b, a);
                }
            })
            .call(() => {
                callback();
            })
            .start();
    }

    /** 等待资源加载动画 - 预防弱网情况初始化时间过长，导致的黑屏较差体验 */
    private wait() {
        this.waitAnim(this.startColor, this.endColor, () => {
            this.waitComplete = true;
            if (this.loadComplete) {
                this.waitAnim(this.endColor, this.startColor, () => {
                    this.enter();
                });
            }
        });
    }
    //#endregion

    start() {
        this.wait();
        this.loadRes();
    }

    /** 游戏必备资源加载 */
    private async loadRes() {
        // 并行加载必备资源
        const promises: Promise<void>[] = [];

        promises.push(this.loadTable());
        promises.push(this.loadLanguage());
        promises.push(this.loadCommon());
        await Promise.all(promises);

        // 窗口打开失败事件
        oops.gui.setOpenFailure(this.onOpenFailure);

        this.loadComplete = true;

        // 等待动画完成则，准备进入游戏
        if (this.waitComplete) {
            this.waitAnim(this.endColor, this.startColor, () => {
                this.enter();
            });
        }
    }

    private async enter() {
        await this.ent.addUi(LoadingViewComp);
        this.remove();
    }

    /** 窗口打开失败事件 */
    private onOpenFailure() {
        oops.gui.toast('网络异常请稍后重试');
    }

    /** 加载 Zip 配置表 */
    private loadTable(): Promise<void> {
        return JsonUtil.loadDir();
    }

    /** 加载化语言包（可选） */
    private loadLanguage(): Promise<void> {
        return new Promise((resolve, reject) => {
            // 设置默认语言
            let lan = oops.storage.get(CommonStorageConfig.Language);
            if (lan == null || lan == '') {
                lan = oops.config.game.languageDefault;
                oops.storage.set(CommonStorageConfig.Language, lan);
            }

            // 加载语言包资源
            oops.language.setLanguage(lan, resolve);
        });
    }

    /** 加载公共资源（必备） */
    private loadCommon(): Promise<void> {
        return new Promise((resolve, reject) => {
            oops.res.loadDir('common', resolve);
        });
    }

    reset(): void {
        this.node.destroy();
    }
}
