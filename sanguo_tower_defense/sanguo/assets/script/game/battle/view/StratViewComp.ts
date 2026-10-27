import { _decorator, Sprite } from 'cc';
import { GameComponent } from 'db://oops-framework/module/common/GameComponent';
import { oops } from 'db://oops-framework/core/Oops';
import { UIID } from '../../common/config/GameUIConfig';
import { ViewKit } from '../../common/ui/ViewKit';
import { Battle } from '../Battle';
import type { BattleModel } from '../logic/BattleModel';
import { Combat } from '../logic/Combat';

const { ccclass } = _decorator;

interface StratOption {
    id: string;
    cost: number;
}

/** 三种计略：火计伤害 / 坚守补城门 / 缓兵减速 */
const OPTIONS: StratOption[] = [
    { id: 'fire', cost: 150 },
    { id: 'gate', cost: 200 },
    { id: 'slow', cost: 100 },
];

/** 军师计略：花粮草买一次性增益，每种每局限一次 */
@ccclass('StratViewComp')
export class StratViewComp extends GameComponent {
    private model: BattleModel | null = null;

    protected onLoad(): void {
        this.model = Battle.current?.battleModel ?? null;
        if (this.model == null) {
            oops.gui.remove(UIID.Strat);
            return;
        }

        const root = this.node;
        ViewKit.text(root, 'panel/title', ViewKit.lang('strat_title'));
        ViewKit.text(root, 'panel/hint', ViewKit.lang('strat_hint'));
        ViewKit.text(root, 'panel/btn_close/label', ViewKit.lang('strat_close'));

        for (const option of OPTIONS) {
            const path = `panel/opt_${option.id}`;
            ViewKit.text(root, `${path}/name`, ViewKit.lang(`strat_${option.id}_name`));
            ViewKit.text(root, `${path}/desc`, ViewKit.lang(`strat_${option.id}_desc`));
            ViewKit.click(ViewKit.get(root, path), () => this.use(option));
        }

        this.refresh();
    }

    private use(option: StratOption): void {
        const model = this.model;
        if (model == null) return;

        if (model.stratUsed.has(option.id)) {
            oops.gui.toast(ViewKit.lang('strat_used'));
            return;
        }
        if (model.food < option.cost) {
            oops.gui.toast(ViewKit.lang('strat_no_food'));
            return;
        }

        model.consumeFood(option.cost);
        model.stratUsed.add(option.id);

        if (option.id === 'fire') {
            for (const enemy of model.enemies) {
                if (!enemy.alive) continue;
                Combat.damageEnemy(model, enemy, 300, '#FF7A5A');
            }
            model.addEffect({ kind: 'explosion', row: 2, x: 4.5, radius: 6 });
        }
        else if (option.id === 'gate') {
            model.gateHp = Math.min(model.gateMax, model.gateHp + 2);
            model.addEffect({ kind: 'shout', row: 0, x: 4.5 });
        }
        else {
            for (const enemy of model.enemies) {
                if (!enemy.alive) continue;
                enemy.slowRemain = Math.max(enemy.slowRemain, 6);
                enemy.slowFactor = Math.min(enemy.slowFactor, 0.5);
            }
            model.addEffect({ kind: 'shout', row: 0, x: 4.5 });
        }

        this.refresh();
    }

    private refresh(): void {
        const model = this.model;
        if (model == null) return;

        ViewKit.text(this.node, 'panel/food', ViewKit.lang('strat_food', Math.floor(model.food)));

        for (const option of OPTIONS) {
            const path = `panel/opt_${option.id}`;
            const used = model.stratUsed.has(option.id);
            const affordable = model.food >= option.cost;

            ViewKit.text(this.node, `${path}/state`, used
                ? ViewKit.lang('strat_used')
                : ViewKit.lang('strat_cost', option.cost));

            const stateLabel = ViewKit.label(this.node, `${path}/state`);
            if (stateLabel != null) {
                stateLabel.color = ViewKit.color(used ? '#8C8272' : (affordable ? '#F4D98A' : '#C0392B'));
            }

            const node = ViewKit.get(this.node, path);
            const bg = node?.getComponent(Sprite) ?? null;
            if (bg != null) bg.color = ViewKit.color(used ? '#6E6E6E' : '#FFFFFF');
        }
    }
}
