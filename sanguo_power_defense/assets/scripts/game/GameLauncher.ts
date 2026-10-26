import { _decorator, Component, Node, director } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('GameLauncher')
export class GameLauncher extends Component {
    start() {
        console.log('三国力量防御游戏启动器');
        this.loadMainScene();
    }
    
    loadMainScene() {
        director.loadScene('main');
    }
}