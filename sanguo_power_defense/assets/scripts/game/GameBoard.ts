import { _decorator, Component, Node, Graphics, Vec3, Color, input, Input, EventMouse, Camera, director, tween, UITransform } from 'cc';
import { GameManager, GameState } from './GameManager';
import {
    PLANT_CONFIG, ROWS, COLS, CELL, GRID_W, GRID_H, ORIGIN_X, ORIGIN_Y,
    BASE_X, SPAWN_X, cellCenter, LEVELS,
} from '../config';
const { ccclass } = _decorator;

@ccclass('GameBoard')
export class GameBoard extends Component {
    public static instance: GameBoard | null = null;

    public selectedPlantType: string = 'soldier';
    public baseX: number = BASE_X;

    private camera: Camera | null = null;
    private gridLayer!: Node;
    private sunLayer!: Node;
    private plantLayer!: Node;
    private enemyLayer!: Node;

    private plants: Node[] = [];
    private enemies: Node[] = [];
    private suns: Node[] = [];

    private levelEnemies: string[] = [];
    private spawnIndex: number = 0;
    private spawnTimer: number = 0;
    private levelInterval: number = 3;
    private sunTimer: number = 8;

    onLoad() {
        GameBoard.instance = this;
    }

    onDestroy() {
        input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
    }

    beginGame() {
        GameBoard.instance = this;
        if (!this.node.getComponent(UITransform)) {
            this.node.addComponent(UITransform);
        }
        this.ensureCamera();
        this.createLayers();
        this.drawGrid();
        this.registerInput();
        this.startLevel(0);
    }

    private ensureCamera() {
        let cam = director.getScene()?.getComponentInChildren(Camera) || null;
        if (!cam) {
            const camNode = new Node('MainCamera');
            cam = camNode.addComponent(Camera);
            camNode.setPosition(0, 0, 100);
            cam.projection = Camera.ProjectionType.ORTHO;
            cam.orthoHeight = 420;
            cam.nearClip = 0.1;
            cam.farClip = 2000;
            cam.visibility = 0xffffffff;
            cam.backgroundColor = new Color(28, 32, 40, 255);
            camNode.setParent(director.getScene()!);
        }
        this.camera = cam;
    }

    private createLayers() {
        this.gridLayer = new Node('GridLayer');
        this.sunLayer = new Node('SunLayer');
        this.plantLayer = new Node('PlantLayer');
        this.enemyLayer = new Node('EnemyLayer');
        this.node.addChild(this.gridLayer);
        this.node.addChild(this.sunLayer);
        this.node.addChild(this.plantLayer);
        this.node.addChild(this.enemyLayer);
    }

    private drawGrid() {
        const g = this.gridLayer.addComponent(Graphics);
        g.clear();
        g.fillStyle(0x2e7d32, 0.35);
        g.fillRect(ORIGIN_X, ORIGIN_Y, GRID_W, GRID_H);
        g.lineWidth = 1;
        g.strokeStyle(0xffffff, 0.15);
        for (let r = 0; r <= ROWS; r++) {
            const y = ORIGIN_Y + r * CELL;
            g.moveTo(ORIGIN_X, y);
            g.lineTo(ORIGIN_X + GRID_W, y);
        }
        for (let c = 0; c <= COLS; c++) {
            const x = ORIGIN_X + c * CELL;
            g.moveTo(x, ORIGIN_Y);
            g.lineTo(x, ORIGIN_Y + GRID_H);
        }
        g.stroke();
    }

    private registerInput() {
        input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
    }

    private startLevel(idx: number) {
        const lvl = LEVELS[idx] || LEVELS[0];
        this.levelEnemies = [];
        for (const grp of lvl) {
            for (let i = 0; i < grp.count; i++) {
                this.levelEnemies.push(grp.type);
            }
        }
        this.spawnIndex = 0;
        this.spawnTimer = 1.0;
        this.levelInterval = 3.0;
        const gm = GameManager.instance;
        if (gm) {
            gm.maxWave = idx + 1;
            gm.setWave(1);
        }
    }

    private worldFromEvent(e: EventMouse): Vec3 {
        const loc = e.getUILocation();
        const world = new Vec3();
        if (this.camera) {
            this.camera.screenToWorld(new Vec3(loc.x, loc.y, 0), world);
        } else {
            world.set(loc.x, loc.y, 0);
        }
        // 转换到 GameBoard 本地坐标，抵消 Canvas 缩放
        const ut = this.node.getComponent(UITransform);
        if (ut) {
            return ut.convertToNodeSpaceAR(world);
        }
        return world;
    }

    private onMouseDown(event: EventMouse) {
        const world = this.worldFromEvent(event);
        // 1) UI（选择器 / 结束界面）优先处理
        const ui = GameManager.instance?.uiManager;
        if (ui && ui.handleClick && ui.handleClick(world)) return;
        // 2) 收集阳光
        for (let i = this.suns.length - 1; i >= 0; i--) {
            const s = this.suns[i];
            if (s.isValid && Vec3.distance(world, s.position) <= 26) {
                this.collectSun(s);
                return;
            }
        }
        // 3) 在网格放置单位
        this.tryPlace(world);
    }

    private tryPlace(world: Vec3) {
        const col = Math.floor((world.x - ORIGIN_X) / CELL);
        const row = Math.floor((world.y - ORIGIN_Y) / CELL);
        if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;

        for (const p of this.plants) {
            if (!p.isValid) continue;
            const pc = p.getComponent('Plant') as any;
            if (pc && !pc.dead && pc.row === row && pc.col === col) return;
        }

        const cfg = PLANT_CONFIG[this.selectedPlantType] || PLANT_CONFIG['soldier'];
        const gm = GameManager.instance;
        if (!gm || !gm.spend(cfg.cost)) return;

        const center = cellCenter(row, col);
        const n = new Node(`Plant_${this.selectedPlantType}_${row}_${col}`);
        const p = n.addComponent('Plant') as any;
        p.plantType = this.selectedPlantType;
        p.row = row;
        p.col = col;
        n.setPosition(center.x, center.y, 0);
        n.setParent(this.plantLayer);
        this.plants.push(n);
    }

    private spawnEnemy(type: string) {
        const row = Math.floor(Math.random() * ROWS);
        const n = new Node(`Enemy_${type}`);
        const e = n.addComponent('Enemy') as any;
        e.enemyType = type;
        e.row = row;
        const c = cellCenter(row, 0);
        n.setPosition(SPAWN_X, c.y, 0);
        n.setParent(this.enemyLayer);
        this.enemies.push(n);
    }

    private spawnSun(value: number) {
        const x = ORIGIN_X + Math.random() * GRID_W;
        const n = new Node('Sun');
        const g = n.addComponent(Graphics);
        g.fillStyle(0xffeb3b, 1);
        g.fillCircle(0, 0, 18);
        g.lineWidth = 2;
        g.strokeStyle(0xff9800, 1);
        g.strokeCircle(0, 0, 18);
        n.setPosition(x, 420, 0);
        n.setParent(this.sunLayer);
        (n as any).sunValue = value;

        const restY = ORIGIN_Y + Math.random() * GRID_H;
        const self = this;
        tween(n)
            .to(2.5, { position: new Vec3(x, restY, 0) })
            .delay(6)
            .call(() => {
                if (n.isValid) {
                    const i = self.suns.indexOf(n);
                    if (i >= 0) self.suns.splice(i, 1);
                    n.destroy();
                }
            })
            .start();

        this.suns.push(n);
    }

    private collectSun(n: Node) {
        const gm = GameManager.instance;
        const val = (n as any).sunValue || 25;
        if (gm) gm.addSun(val);
        const i = this.suns.indexOf(n);
        if (i >= 0) this.suns.splice(i, 1);
        tween(n).to(0.15, { scale: new Vec3(0, 0, 1) }).call(() => {
            if (n.isValid) n.destroy();
        }).start();
    }

    private cleanup() {
        this.plants = this.plants.filter(
            (n) => n.isValid && !(n.getComponent('Plant') as any)?.dead
        );
        this.enemies = this.enemies.filter(
            (n) => n.isValid && !(n.getComponent('Enemy') as any)?.dead
        );
        this.suns = this.suns.filter((n) => n.isValid);
    }

    // 供 Plant 查询：同行、在射程内、最近的敌人
    findEnemyInRow(row: number, plantX: number, range: number): Node | null {
        let best: Node | null = null;
        let bestD = Infinity;
        for (const e of this.enemies) {
            if (!e.isValid) continue;
            const ec = e.getComponent('Enemy') as any;
            if (!ec || ec.dead || ec.row !== row) continue;
            const ex = e.position.x;
            if (ex < plantX - CELL || ex > plantX + range) continue;
            const d = Math.abs(ex - plantX);
            if (d < bestD) {
                bestD = d;
                best = e;
            }
        }
        return best;
    }

    // 供 Enemy 查询：同行、在身前可攻击范围内、最靠近的植物
    findPlantToAttack(row: number, enemyX: number): Node | null {
        let best: Node | null = null;
        let bestX = -Infinity;
        for (const p of this.plants) {
            if (!p.isValid) continue;
            const pc = p.getComponent('Plant') as any;
            if (!pc || pc.dead || pc.row !== row) continue;
            const px = p.position.x;
            if (px > enemyX + CELL * 0.6) continue; // 植物必须在敌人左侧或重叠
            if (px < enemyX - CELL * 1.5) continue; // 不能离得太远
            if (px > bestX) {
                bestX = px;
                best = p;
            }
        }
        return best;
    }

    update(dt: number) {
        const gm = GameManager.instance;
        if (!gm || gm.state !== GameState.PLAYING) return;

        this.cleanup();

        this.spawnTimer -= dt;
        if (this.spawnIndex < this.levelEnemies.length && this.spawnTimer <= 0) {
            this.spawnEnemy(this.levelEnemies[this.spawnIndex]);
            this.spawnIndex++;
            this.spawnTimer = this.levelInterval;
        }

        this.sunTimer -= dt;
        if (this.sunTimer <= 0) {
            this.spawnSun(25);
            this.sunTimer = 10;
        }

        if (this.spawnIndex >= this.levelEnemies.length && this.enemies.length === 0) {
            gm.gameOver(true);
        }
    }
}
