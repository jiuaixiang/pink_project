import { oops } from 'db://oops-framework/core/Oops';
import { Battle } from '../../battle/Battle';
import { UIID } from '../config/GameUIConfig';

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

    /** 打开图鉴 */
    static openCodex(): void {
        this.openMain();
        if (oops.gui.has(UIID.Codex)) return;
        oops.gui.open(UIID.Codex);
    }

    /** 打开设置弹层 */
    static openSettings(): void {
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
        this.removeIfOpen(UIID.Main);
        Battle.open(levelId);
    }

    /** 退出战斗回到主界面 */
    static backToMain(): void {
        this.removeIfOpen(UIID.Pause);
        this.removeIfOpen(UIID.Result);
        this.removeIfOpen(UIID.Settings);
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
