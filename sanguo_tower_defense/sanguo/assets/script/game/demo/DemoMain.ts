import { _decorator } from 'cc';
import { GameComponent } from 'db://oops-framework/module/common/GameComponent';

const { ccclass, property } = _decorator;

/** 教程列表 */
@ccclass('DemoMain')
export class DemoMain extends GameComponent {
    protected onLoad(): void {
        this.setButton();
    }
}
