import { _decorator, Component, Node, Graphics, Label, Color, UITransform } from 'cc';
import { GameManager, GameState } from '../game/GameManager';
import { GameBoard } from '../game/GameBoard';
import { PLANT_CONFIG, PLANT_ORDER, ORIGIN_Y } from '../config';
const { ccclass } = _decorator;

interface Sel {
    type: string;
    cx: number;
    cy: number;
    hw: number;
    hh: number;
    color: number;
}

@ccclass('UIManager')
export class UIManager extends Component {
    private sunLabel!: Label;
    private scoreLabel!: Label;
    private waveLabel!: Label;
    private lifeLabel!: Label;
    private selG!: Graphics;
    private selectors: Sel[] = [];
    private overlay!: Node;
    private overlayText!: Label;
    private restartBox = { cx: 0, cy: -40, hw: 130, hh: 36 };

    init() {
        this.createHud();
        this.createSelectors();
        this.createOverlay();
        this.refresh();
    }

    private addLabel(x: number, y: number, size: number, str: string): Label {
        const n = new Node('L');
        n.setParent(this.node);
        n.addComponent(UITransform).setContentSize(300, 60);
        const lb = n.addComponent(Label);
        lb.string = str;
        lb.fontSize = size;
        lb.color = new Color(255, 255, 255, 255);
        n.setPosition(x, y, 0);
        return lb;
    }

    private createHud() {
        const y = 320;
        this.sunLabel = this.addLabel(-300, y, 26, '阳光: 100');
        this.scoreLabel = this.addLabel(-100, y, 26, '分数: 0');
        this.waveLabel = this.addLabel(100, y, 26, '波次: 1/1');
        this.lifeLabel = this.addLabel(300, y, 26, '生命: 5');
    }

    private createSelectors() {
        const selNode = new Node('SelG');
        selNode.setParent(this.node);
        this.selG = selNode.addComponent(Graphics);

        const cy = ORIGIN_Y - 70; // 网格下方
        const hw = 60;
        const hh = 35;
        const spacing = 130;
        const startX = -(spacing * 2);
        PLANT_ORDER.forEach((t, i) => {
            const cx = startX + i * spacing;
            this.selectors.push({ type: t, cx, cy, hw, hh, color: PLANT_CONFIG[t].color });
            const n = new Node('SelLabel');
            n.setParent(this.node);
            n.addComponent(UITransform).setContentSize(140, 40);
            const lb = n.addComponent(Label);
            lb.string = `${PLANT_CONFIG[t].name} ${PLANT_CONFIG[t].cost}`;
            lb.fontSize = 22;
            lb.color = new Color(255, 255, 255, 255);
            n.setPosition(cx, cy, 0);
        });
    }

    private createOverlay() {
        this.overlay = new Node('Overlay');
        this.overlay.setParent(this.node);
        this.overlay.addComponent(UITransform).setContentSize(900, 900);
        const g = this.overlay.addComponent(Graphics);
        g.fillStyle(0x000000, 0.6);
        g.fillRect(-450, -450, 900, 900);

        const tn = new Node('OverlayText');
        tn.setParent(this.overlay);
        tn.addComponent(UITransform).setContentSize(400, 80);
        this.overlayText = tn.addComponent(Label);
        this.overlayText.string = '';
        this.overlayText.fontSize = 56;
        this.overlayText.color = new Color(255, 255, 255, 255);
        tn.setPosition(0, 60, 0);

        const rn = new Node('Restart');
        rn.setParent(this.overlay);
        rn.addComponent(UITransform).setContentSize(260, 72);
        const rl = rn.addComponent(Label);
        rl.string = '点击重新开始';
        rl.fontSize = 28;
        rl.color = new Color(255, 255, 255, 255);
        rn.setPosition(this.restartBox.cx, this.restartBox.cy, 0);

        this.overlay.active = false;
    }

    refresh() {
        const gm = GameManager.instance;
        if (!gm) return;
        this.sunLabel.string = `阳光: ${gm.sun}`;
        this.scoreLabel.string = `分数: ${gm.score}`;
        this.waveLabel.string = `波次: ${gm.wave}/${gm.maxWave}`;
        this.lifeLabel.string = `生命: ${gm.life}`;

        this.selG.clear();
        for (const s of this.selectors) {
            const sel = !!GameBoard.instance && GameBoard.instance.selectedPlantType === s.type;
            this.selG.fillStyle(s.color, sel ? 1 : 0.6);
            this.selG.fillRoundedRect(s.cx - s.hw, s.cy - s.hh, s.hw * 2, s.hh * 2, 8);
            this.selG.lineWidth = sel ? 5 : 2;
            this.selG.strokeStyle(sel ? 0xffffff : 0x000000, 0.6);
            this.selG.strokeRoundedRect(s.cx - s.hw, s.cy - s.hh, s.hw * 2, s.hh * 2, 8);
        }

        if (gm.state === GameState.WON || gm.state === GameState.LOST) {
            this.overlay.active = true;
            this.overlayText.string = gm.state === GameState.WON ? '胜利！' : '失败…';
        } else {
            this.overlay.active = false;
        }
    }

    // 返回 true 表示点击已被 UI 消费
    handleClick(world: { x: number; y: number }): boolean {
        const gm = GameManager.instance;
        if (!gm) return false;

        if (gm.state === GameState.WON || gm.state === GameState.LOST) {
            if (
                Math.abs(world.x - this.restartBox.cx) <= this.restartBox.hw &&
                Math.abs(world.y - this.restartBox.cy) <= this.restartBox.hh
            ) {
                gm.restart();
            }
            return true;
        }

        for (const s of this.selectors) {
            if (
                Math.abs(world.x - s.cx) <= s.hw &&
                Math.abs(world.y - s.cy) <= s.hh
            ) {
                const gb = GameBoard.instance;
                if (gb) {
                    gb.selectedPlantType = s.type;
                    this.refresh();
                }
                return true;
            }
        }
        return false;
    }
}
