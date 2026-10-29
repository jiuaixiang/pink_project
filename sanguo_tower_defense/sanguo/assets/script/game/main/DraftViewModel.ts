import { _decorator } from 'cc';
import { VM } from 'db://oops-framework/libs/model-view/ViewModel';
import VMParent from 'db://oops-framework/libs/model-view/VMParent';

const { ccclass } = _decorator;

/**
 * 选将界面 MVVM 数据源（挂在 draft.prefab 根节点）
 *
 * 预制体里的 VMLabel 通过 watchPath（*.levelName / *.countText）绑定本类 data，
 * 视图在选择变化时调用 update() 写入被观察数据，绑定组件自动刷新文本。
 */
@ccclass('DraftViewModel')
export class DraftViewModel extends VMParent {
    protected data = {
        levelName: '',
        countText: '',
    };

    protected onUnBind(): void {
        VM.remove(this.tag);
    }

    /**
     * 选择变化后由视图调用
     *
     * [注意] 方法名不能叫 update——那是 Cocos 组件的每帧生命周期钩子，
     * 会被引擎以 update(dt) 调用，把帧时长写进绑定数据（之前 level_name 显示小数就是它）
     */
    sync(levelName: string, countText: string): void {
        this.data.levelName = levelName;
        this.data.countText = countText;
    }
}
