/**
 * 三国塔防全局事件名
 *
 * 使用 oops.message 派发，跨界面通信统一走这里，避免界面之间直接持有引用
 */
export enum GameEvent {
    /** 存档数据变化（通关、星级、清档） */
    SaveChanged = 'sanguo_save_changed',
    /** 设置数据变化（音量、开关、语言） */
    SettingsChanged = 'sanguo_settings_changed',
    /** 语言切换完成 */
    LanguageChanged = 'sanguo_language_changed',
}
