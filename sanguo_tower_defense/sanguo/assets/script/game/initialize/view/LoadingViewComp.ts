import { _decorator } from 'cc';
import { oops } from 'db://oops-framework/core/Oops';
import { gui } from 'db://oops-framework/core/gui/Gui';
import { LayerType } from 'db://oops-framework/core/gui/layer/LayerEnum';
import { ecs } from 'db://oops-framework/libs/ecs/ECS';
import { CCView } from 'db://oops-framework/module/common/CCView';
import { UIID } from '../../common/config/GameUIConfig';
import type { Initialize } from '../Initialize';

const { ccclass, property } = _decorator;

/** 游戏资源加载 */
@ccclass('LoadingViewComp')
@ecs.register('LoadingView', false)
@gui.register('LoadingView', { layer: LayerType.UI, prefab: 'gui/loading/loading' })
export class LoadingViewComp extends CCView<Initialize> {
    protected mvvm = true;
    protected data: any = {
        /** 加载资源当前进度 */
        finished: 0,
        /** 加载资源最大进度 */
        total: 0,
        /** 加载资源进度比例值 */
        progress: '0',
        /** 加载流程中提示文本 */
        prompt: '',
        /** 游戏版本号 */
        version: '1.0.0',
    };

    private progress = 0;

    start() {
        this.loadRes();
    }

    private async onLoginSuccessGame() {
        await oops.gui.open(UIID.DemoMain);
        this.remove();
    }

    /** 加载资源 */
    private loadRes() {
        this.data.version = oops.config.game.version;
        this.data.progress = 0;
        this.loadGameRes();
    }

    /** 加载初始游戏内容资源 */
    private loadGameRes() {
        // 加载初始游戏内容资源的多语言提示文本
        this.data.prompt = oops.language.getLangByID('loading_load_game');
        oops.res.loadDir('game', this.onProgressCallback.bind(this), this.onCompleteCallback.bind(this));
    }

    /** 加载进度事件 */
    private onProgressCallback(finished: number, total: number, item: any) {
        this.data.finished = finished;
        this.data.total = total;

        const progress = finished / total;
        if (progress > this.progress) {
            this.progress = progress;
            this.data.progress = (progress * 100).toFixed(2);
        }
    }

    /** 加载完成事件 */
    private onCompleteCallback() {
        this.data.finished = 1;
        this.data.total = 1;
        this.data.progress = 100;

        // 获取用户信息的多语言提示文本
        this.data.prompt = oops.language.getLangByID('loading_load_player');

        this.onLoginSuccessGame();
    }

    reset(): void { }
}
