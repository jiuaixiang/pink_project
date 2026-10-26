import { _decorator, Component, director } from 'cc';
const { ccclass } = _decorator;

export enum GameState {
    READY = 'ready',
    PLAYING = 'playing',
    WON = 'won',
    LOST = 'lost',
}

@ccclass('GameManager')
export class GameManager extends Component {
    public static instance: GameManager | null = null;

    public sun: number = 100;
    public score: number = 0;
    public life: number = 5;
    public maxLife: number = 5;
    public wave: number = 1;
    public maxWave: number = 1;
    public state: GameState = GameState.READY;

    // 由 MainScene 注入
    public uiManager: any = null;

    onLoad() {
        GameManager.instance = this;
    }

    init() {
        this.sun = 100;
        this.score = 0;
        this.maxLife = 5;
        this.life = this.maxLife;
        this.wave = 1;
        this.state = GameState.PLAYING;
        this.notifyUI();
    }

    addSun(amount: number) {
        this.sun += amount;
        this.notifyUI();
    }

    canAfford(cost: number): boolean {
        return this.sun >= cost;
    }

    spend(cost: number): boolean {
        if (this.sun < cost) return false;
        this.sun -= cost;
        this.notifyUI();
        return true;
    }

    addScore(amount: number) {
        this.score += amount;
        this.notifyUI();
    }

    setWave(w: number) {
        this.wave = w;
        this.notifyUI();
    }

    loseLife() {
        this.life -= 1;
        this.notifyUI();
        if (this.life <= 0) {
            this.gameOver(false);
        }
    }

    gameOver(win: boolean) {
        if (this.state !== GameState.PLAYING) return;
        this.state = win ? GameState.WON : GameState.LOST;
        this.notifyUI();
    }

    restart() {
        director.loadScene('main');
    }

    notifyUI() {
        if (this.uiManager && this.uiManager.refresh) {
            this.uiManager.refresh();
        }
    }
}
