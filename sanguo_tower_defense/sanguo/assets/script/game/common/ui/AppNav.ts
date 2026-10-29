import { oops } from 'db://oops-framework/core/Oops';
import { Battle } from '../../battle/Battle';
import { UIID } from '../config/GameUIConfig';
import { DraftModel } from '../model/DraftModel';
import { PlayerModel } from '../model/PlayerModel';
import { TableLevels } from '../table/TableLevels';

/**
 * 界面导航
 *
 * 统一入口的好处：
 * 1、避免各界面互相 import 造成循环依赖
 * 2、关闭界面时统一判定是否已打开，杜绝框架"界面层不存在"警告
 * 3、进入战斗前清理 UI 层，保证 LayerGame 战场不被遮挡
 */
export class AppNav {
    /** 回到主界面 */
    static openMain(): void {
        if (oops.gui.has(UIID.Main)) return;
        oops.gui.open(UIID.Main);
    }

    /** 打开关卡选择（确保主界面在背后） */
    static openLevelSelect(): void {
        this.openMain();
        if (oops.gui.has(UIID.LevelSelect)) return;
        oops.gui.open(UIID.LevelSelect);
    }

    /** 打开选将界面（进入战斗前的阵容选择） */
    static openDraft(levelId: number): void {
        // 新手引导关为脚本化教学：首次进入时无需选将，直接进战斗，卡组初始为空，
        // 由开场剧情依次「获得武将」后逐步加入卡槽；已通关重玩则正常选将
        const level = TableLevels.get(levelId);
        if (level?.guide === true && !PlayerModel.inst.isCleared(levelId)) {
            this.startBattle(levelId);
            return;
        }

        DraftModel.setPending(levelId);
        // 注意：不能 remove 后同帧 open——框架 LayerUI.remove 不清 ui_nodes 记录，
        // 立即重开会被 LayerUI.add 以「重复加载」拒绝（与切语言黑屏同源）
        if (oops.gui.has(UIID.Draft)) return;
        oops.gui.open(UIID.Draft);
    }

    /** 打开装备界面 */
    static openEquip(): void {
        this.openMain();
        if (oops.gui.has(UIID.Equip)) return;
        oops.gui.open(UIID.Equip);
    }

    /** 打开图鉴 */
    static openCodex(): void {
        this.openMain();
        if (oops.gui.has(UIID.Codex)) return;
        oops.gui.open(UIID.Codex);
    }

    /** 打开设置弹层 */
    static openSettings(): void {
        // 临时诊断：设置面板只有主界面卡片与暂停面板两个入口，
        // 若在其他界面被拉起，这里会打印完整调用栈
        console.trace('[三国塔防] openSettings 调用来源');
        if (oops.gui.has(UIID.Settings)) return;
        oops.gui.open(UIID.Settings);
    }

    /** 关闭设置弹层 */
    static closeSettings(): void {
        if (oops.gui.has(UIID.Settings)) oops.gui.remove(UIID.Settings);
    }

    /** 开始战斗：清理 UI 层后打开战场 */
    static startBattle(levelId: number): void {
        this.removeIfOpen(UIID.Pause);
        this.removeIfOpen(UIID.Result);
        this.removeIfOpen(UIID.Settings);
        this.removeIfOpen(UIID.LevelSelect);
        this.removeIfOpen(UIID.Codex);
        this.removeIfOpen(UIID.Equip);
        this.removeIfOpen(UIID.Draft);
        this.removeIfOpen(UIID.Help);
        this.removeIfOpen(UIID.Strat);
        this.removeIfOpen(UIID.Main);
        Battle.open(levelId);
    }

    /** 退出战斗回到主界面 */
    static backToMain(): void {
        this.removeIfOpen(UIID.Pause);
        this.removeIfOpen(UIID.Result);
        this.removeIfOpen(UIID.Settings);
        this.removeIfOpen(UIID.Draft);
        this.removeIfOpen(UIID.Equip);
        Battle.close();
        this.openMain();
    }

    /** 重开当前关卡 */
    static restartBattle(levelId: number): void {
        Battle.restart(levelId);
    }

    private static removeIfOpen(uiid: UIID): void {
        if (oops.gui.has(uiid)) oops.gui.remove(uiid);
    }
}
