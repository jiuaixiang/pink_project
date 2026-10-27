import type { BattleModel } from './BattleModel';

/**
 * 胜负与星级判定
 *
 * 星级规则：
 * ★   通关
 * ★★  在关卡限时内通关
 * ★★★ 全程未动用拒马
 */
export class BattleJudge {
    static update(model: BattleModel): void {
        if (model.over) return;

        // 失败：敌军越界（拒马已在 LawnmowerSystem 中处理过）
        for (const enemy of model.enemies) {
            if (!enemy.alive) continue;
            if (enemy.x <= model.gameplay.dangerX) {
                this.lose(model);
                return;
            }
        }

        // 胜利：所有波次出兵完毕且场上无存活敌军
        if (!model.allSpawned) return;
        if (model.enemies.length > 0) return;
        if (model.time < 3) return;

        this.win(model);
    }

    private static win(model: BattleModel): void {
        let stars = 1;
        if (model.time <= model.level.starTime) stars += 1;
        if (!model.mowerUsed) stars += 1;

        model.stars = stars;
        model.win = true;
        model.over = true;
    }

    private static lose(model: BattleModel): void {
        model.stars = 0;
        model.win = false;
        model.over = true;
        model.addEffect({ kind: 'breach', row: 0, x: 0 });
    }
}
