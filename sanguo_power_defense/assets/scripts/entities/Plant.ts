import { _decorator, Component, Node, Graphics, Label, Vec3, Color, tween, UITransform } from 'cc';
import { PLANT_CONFIG } from '../config';
import { GameBoard } from '../game/GameBoard';
const { ccclass, property } = _decorator;

@ccclass('Plant')
export class Plant extends Component {
    @property
    plantType: string = 'soldier';

    public row: number = 0;
    public col: number = 0;
    public dead: boolean = false;

    public config: any;
    public hp: number = 100;
    public maxHp: number = 100;
    private cooldown: number = 0;
    private hpBar: Graphics | null = null;

    start() {
        this.setup();
    }

    private setup() {
        this.config = PLANT_CONFIG[this.plantType] || PLANT_CONFIG['soldier'];
        this.maxHp = this.config.hp;
        this.hp = this.config.hp;
        this.cooldown = 0;
        this.draw();
    }

    private draw() {
        const g = this.node.getComponent(Graphics) || this.node.addComponent(Graphics);
        g.clear();
        const s = 56;
        g.fillStyle(this.config.color, 1);
        g.fillRoundedRect(-s / 2, -s / 2, s, s, 8);
        g.lineWidth = 3;
        g.strokeStyle(0x000000, 0.4);
        g.strokeRoundedRect(-s / 2, -s / 2, s, s, 8);

        let label = this.node.getChildByName('Name');
        if (!label) {
            label = new Node('Name');
            label.addComponent(UITransform).setContentSize(60, 60);
            label.setParent(this.node);
        }
        let lb = label.getComponent(Label);
        if (!lb) lb = label.addComponent(Label);
        lb.string = this.config.name;
        lb.fontSize = 34;
        lb.color = new Color(255, 255, 255, 255);
        label.setPosition(0, 0, 0);

        let hb = this.node.getChildByName('HP');
        if (!hb) {
            hb = new Node('HP');
            hb.addComponent(UITransform).setContentSize(60, 10);
            hb.setParent(this.node);
        }
        this.hpBar = hb.getComponent(Graphics) || hb.addComponent(Graphics);
        hb.setPosition(0, s / 2 + 8, 0);
        this.updateHpBar();
    }

    private updateHpBar() {
        const g = this.hpBar;
        if (!g) return;
        g.clear();
        const w = 56;
        const h = 6;
        g.fillStyle(0x000000, 0.5);
        g.fillRect(-w / 2, -h / 2, w, h);
        const ratio = Math.max(0, this.hp / this.maxHp);
        g.fillStyle(ratio > 0.3 ? 0x4caf50 : 0xf44336, 1);
        g.fillRect(-w / 2, -h / 2, w * ratio, h);
    }

    takeDamage(d: number) {
        if (this.dead) return;
        this.hp -= d;
        this.updateHpBar();
        if (this.hp <= 0) this.die();
    }

    die() {
        if (this.dead) return;
        this.dead = true;
        tween(this.node)
            .to(0.2, { scale: new Vec3(0, 0, 1) })
            .call(() => this.node.destroy())
            .start();
    }

    update(dt: number) {
        if (this.dead) return;
        this.cooldown -= dt;
        const board = GameBoard.getInstance();
        if (!board) return;
        const target = board.findEnemyInRow(this.row, this.node.position.x, this.config.range);
        if (target) {
            if (this.cooldown <= 0) {
                this.cooldown = this.config.atkInterval;
                const e = target.getComponent('Enemy') as any;
                if (e) e.takeDamage(this.config.atk);
                tween(this.node)
                    .to(0.08, { scale: new Vec3(1.15, 1.15, 1) })
                    .to(0.08, { scale: new Vec3(1, 1, 1) })
                    .start();
            }
        }
    }
}
