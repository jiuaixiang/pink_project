import { LayerType } from 'db://oops-framework/core/gui/layer/LayerEnum';
import type { UIConfig } from 'db://oops-framework/core/gui/layer/UIConfig';

/**
 * 老版定义界面配置方式
 * 优点：集中管理
 * 缺点：与具体的界面逻辑代码分离不好管理，团队开发时，修改同一个文件容易冲突
 *
 * 新版定义界面配置 - 解决老版配置的缺点，同时可以废弃此文件
 * 例:
 * @ccclass('DemoRedDot')
 * @gui.register('DemoRedDot', { layer: LayerType.UI, prefab: 'gui/demo/demo_red_dot' })
 * export class DemoRedDot extends GameComponent {
 */

/** 界面唯一标识（方便服务器通过编号数据触发界面打开） */
export enum UIID {
    DemoMain,
}

/** 打开界面方式的配置数据 */
export const UIConfigData: { [key: number]: UIConfig } = {
    [UIID.DemoMain]: { layer: LayerType.UI, prefab: 'gui/demo/demo_main', destroy: false },
};
