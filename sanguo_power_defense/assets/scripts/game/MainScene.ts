import { _decorator, Component, Node, Canvas, Camera, Size } from 'cc';
import { GameManager } from './GameManager';
import { GameBoard } from './GameBoard';
import { UIManager } from '../ui/UIManager';
const { ccclass } = _decorator;

@ccclass('MainScene')
export class MainScene extends Component {
    start() {
        // 2D 渲染必须有一个 Canvas + 相机
        const canvasNode = new Node('Canvas');
        const canvas = canvasNode.addComponent(Canvas) as Canvas;
        canvas.designResolution = new Size(1280, 900);
        canvasNode.setParent(this.node);

        const camNode = new Node('UICamera');
        const cam = camNode.addComponent(Camera) as Camera;
        camNode.setParent(canvasNode);
        (canvas as any).camera = cam;
        cam.visibility = 0xffffffff;
        cam.backgroundColor.set(28, 32, 40, 255);

        // 游戏板（含网格/输入），渲染在底层
        const gbNode = new Node('GameBoard');
        const gb = gbNode.addComponent(GameBoard) as GameBoard;
        gbNode.setParent(canvasNode);

        // 管理器
        const gmNode = new Node('GameManager');
        const gm = gmNode.addComponent(GameManager) as GameManager;
        gmNode.setParent(canvasNode);
        GameManager.instance = gm;

        // UI 最后加入，渲染在最上层
        const uiNode = new Node('UIManager');
        const ui = uiNode.addComponent(UIManager) as UIManager;
        uiNode.setParent(canvasNode);
        gm.uiManager = ui;

        // 显式初始化，确定执行顺序
        ui.init();
        gm.init();
        gb.beginGame();
    }
}
