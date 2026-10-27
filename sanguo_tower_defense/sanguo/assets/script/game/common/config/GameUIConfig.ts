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
    DemoMain = 1,
    /** 游戏主界面 */
    Main,
    /** 关卡选择 */
    LevelSelect,
    /** 图鉴 */
    Codex,
    /** 选将（出战阵容） */
    Draft,
    /** 装备配置 */
    Equip,
    /** 设置（弹层，可叠加在战斗暂停之上） */
    Settings,
    /** 暂停 */
    Pause,
    /** 战斗结算 */
    Result,
    /** 玩法说明 */
    Help,
    /** 军师计略 */
    Strat,
    /** 剧情对话 */
    Story,
    /** 卡片详情 */
    UnitDetail,
    /** 装备词条详情 */
    EquipDetail,
    /** 获得武将演出 */
    GetHero,
}

/** 打开界面方式的配置数据 */
export const UIConfigData: { [key: number]: UIConfig } = {
    [UIID.DemoMain]: { layer: LayerType.UI, prefab: 'gui/demo/demo_main', destroy: false },
    [UIID.Main]: { layer: LayerType.UI, prefab: 'gui/main/main', destroy: true },
    [UIID.LevelSelect]: { layer: LayerType.UI, prefab: 'gui/main/level_select', destroy: true },
    [UIID.Codex]: { layer: LayerType.UI, prefab: 'gui/main/codex', destroy: true },
    [UIID.Draft]: { layer: LayerType.UI, prefab: 'gui/main/draft', destroy: true },
    [UIID.Equip]: { layer: LayerType.UI, prefab: 'gui/main/equip', destroy: true },
    [UIID.Settings]: { layer: LayerType.PopUp, prefab: 'gui/main/settings', destroy: true, mask: true },
    [UIID.Pause]: { layer: LayerType.PopUp, prefab: 'gui/battle/pause', destroy: true, mask: true },
    [UIID.Result]: { layer: LayerType.PopUp, prefab: 'gui/battle/result', destroy: true, mask: true },
    [UIID.Help]: { layer: LayerType.PopUp, prefab: 'gui/main/help', destroy: true, mask: true },
    [UIID.Strat]: { layer: LayerType.PopUp, prefab: 'gui/battle/strat', destroy: true, mask: true },
    [UIID.Story]: { layer: LayerType.PopUp, prefab: 'gui/battle/story', destroy: true, mask: true },
    [UIID.UnitDetail]: { layer: LayerType.PopUp, prefab: 'gui/battle/unit_detail', destroy: true, mask: true },
    [UIID.EquipDetail]: { layer: LayerType.PopUp, prefab: 'gui/main/equip_detail', destroy: true, mask: true },
    [UIID.GetHero]: { layer: LayerType.PopUp, prefab: 'gui/battle/get_hero', destroy: true, mask: false },
};

/** 战斗场景预制体（LayerGame 层不能通过 oops.gui.open 打开，需用 oops.gui.game.add） */
export const BattlePrefab = 'gui/battle/battle';
