import { _decorator } from 'cc';
import { oops } from 'db://oops-framework/core/Oops';
import { VM } from 'db://oops-framework/libs/model-view/ViewModel';
import VMParent from 'db://oops-framework/libs/model-view/VMParent';
import { GameEvent } from '../common/config/GameEvent';
import { PlayerModel } from '../common/model/PlayerModel';
import { SettingsModel } from '../common/model/SettingsModel';
import { TableLevels } from '../common/table/TableLevels';
import { ViewKit } from '../common/ui/ViewKit';

const { ccclass } = _decorator;

/**
 * 主界面 MVVM 数据源（挂在 main.prefab 根节点）
 *
 * - 预制体里的 VMLabel / VMState 通过 watchPath（如 *.statClears）绑定本类 data
 * - VMParent.onLoad 会把 watchPath 的 * 替换为实例 tag 并注册可观察数据
 * - 视图代码不再手动更新文本：这里只负责把玩家数据写入 data，绑定组件自动刷新
 */
@ccclass('MainViewModel')
export class MainViewModel extends VMParent {
    protected data = {
        chapterText: '',
        continueTip: '',
        statClears: '0',
        statStars: '0',
        statKills: '0',
        bestWaveShow: false,
        bestWaveText: '',
        allClearShow: false,
        versionText: '',
        langText: '',
    };

    protected onBind(): void {
        this.pull();
        oops.message.on(GameEvent.SaveChanged, this.onSaveChanged, this);
        // 切换语言后原地刷新动态文案（静态文案由框架 updateLanguage 刷新 LanguageLabel）
        oops.message.on(GameEvent.LanguageChanged, this.onSaveChanged, this);
    }

    protected onUnBind(): void {
        oops.message.off(GameEvent.SaveChanged, this.onSaveChanged, this);
        oops.message.off(GameEvent.LanguageChanged, this.onSaveChanged, this);
        // 界面销毁时移除 VMParent 注册的 VM（tag 含节点 uuid），防止切语言重开后残留
        VM.remove(this.tag);
    }

    /** 存档 / 语言变化 → 写入被观察数据 → VMLabel/VMState 自动更新视图 */
    private onSaveChanged(): void {
        this.pull();
    }

    /** 从玩家模型拉取全部展示数据 */
    private pull(): void {
        const player = PlayerModel.inst;
        const level = player.getContinueLevel();

        this.data.chapterText = `${ViewKit.lang('select_title')} · ${TableLevels.count}`;
        this.data.continueTip = ViewKit.lang('main_continue_tip', level, ViewKit.levelName(level));
        this.data.statClears = `${player.clearedCount}/${player.levelCount}`;
        this.data.statStars = `${player.totalStars}/${player.maxStars}`;
        this.data.statKills = String(player.kills);

        const best = player.bestWave;
        this.data.bestWaveShow = best > 0;
        this.data.bestWaveText = best > 0 ? ViewKit.lang('main_best_wave', best) : '';

        this.data.allClearShow = player.levelCount > 0
            && player.clearedCount >= player.levelCount;

        this.data.versionText = `${ViewKit.lang('app_version')} ${oops.config.game.version}`;
        this.data.langText = SettingsModel.inst.language === 'zh' ? '中文 / EN' : 'EN / 中文';
    }
}
