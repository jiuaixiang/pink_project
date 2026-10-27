import { oops } from 'db://oops-framework/core/Oops';
import { UIID } from '../config/GameUIConfig';

/**
 * 弹层参数传递
 *
 * 单独抽一个模块，避免「战斗视图 → 弹层视图 → 战斗」形成循环依赖。
 */
export class PopupState {
    private static storyId = '';
    private static storyDone: (() => void) | null = null;
    private static unitId = '';
    private static equipUnitId = '';
    private static equipId = '';
    private static heroUnitId = '';
    private static heroDone: (() => void) | null = null;

    /** 打开剧情（可选结束回调） */
    static openStory(storyId: string, onDone?: () => void): void {
        this.storyId = storyId;
        this.storyDone = onDone ?? null;
        oops.gui.open(UIID.Story);
    }

    static getStoryId(): string {
        return this.storyId;
    }

    static takeStoryDone(): (() => void) | null {
        const done = this.storyDone;
        this.storyDone = null;
        this.storyId = '';
        return done;
    }

    /** 打开武将详情 */
    static openUnitDetail(unitId: string): void {
        this.unitId = unitId;
        oops.gui.open(UIID.UnitDetail);
    }

    static getUnitId(): string {
        return this.unitId;
    }

    /** 打开「获得武将」演出 */
    static openGetHero(unitId: string, onDone?: () => void): void {
        this.heroUnitId = unitId;
        this.heroDone = onDone ?? null;
        oops.gui.open(UIID.GetHero);
    }

    static getHeroUnitId(): string {
        return this.heroUnitId;
    }

    static takeHeroDone(): (() => void) | null {
        const done = this.heroDone;
        this.heroDone = null;
        this.heroUnitId = '';
        return done;
    }

    /** 打开装备词条详情（携带所属武将与装备 id） */
    static openEquipDetail(unitId: string, equipId: string): void {
        this.equipUnitId = unitId;
        this.equipId = equipId;
        oops.gui.open(UIID.EquipDetail);
    }

    static getEquipUnitId(): string {
        return this.equipUnitId;
    }

    static getEquipId(): string {
        return this.equipId;
    }
}
