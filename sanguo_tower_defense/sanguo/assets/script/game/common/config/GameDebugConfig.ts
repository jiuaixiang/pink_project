/**
 * 运行期调试开关
 *
 * 由 Main 脚本上的 debugMode 属性写入，供战斗调试面板、快捷键等使用。
 * 与 `cc/env` 的 DEBUG 不同，这个开关在正式构建里同样可以临时打开。
 */
export class GameDebugConfig {
    private static isOn = false;

    /** 当前是否调试模式 */
    static get enabled(): boolean {
        return this.isOn;
    }

    static setEnabled(value: boolean): void {
        this.isOn = value;
    }
}
