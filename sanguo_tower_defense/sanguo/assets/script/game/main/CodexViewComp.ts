import { _decorator, Node, Vec3 } from 'cc';
import { oops } from 'db://oops-framework/core/Oops';
import { GameComponent } from 'db://oops-framework/module/common/GameComponent';
import { UIID } from '../common/config/GameUIConfig';
import { PlayerModel } from '../common/model/PlayerModel';
import { TableEnemies } from '../common/table/TableEnemies';
import type { IEnemyConfig, IUnitConfig } from '../common/table/ITable';
import { TableUnits } from '../common/table/TableUnits';
import { AudioPath, AudioService } from '../common/ui/AudioService';
import { ViewKit } from '../common/ui/ViewKit';

const { ccclass } = _decorator;

type CodexMode = 'unit' | 'enemy';

/**
 * 兵书图鉴
 *
 * 条目为 gui/main/codex_item 预制体，属性行为 gui/main/detail_row 预制体
 */
@ccclass('CodexViewComp')
export class CodexViewComp extends GameComponent {
    private mode: CodexMode = 'unit';
    private selectedId = '';
    private list: Node | null = null;
    private detail: Node | null = null;

    protected onLoad(): void {
        AudioService.playMusic(AudioPath.Menu);

        const root = this.node;
        this.list = ViewKit.get(root, 'list');
        this.detail = ViewKit.get(root, 'detail');

        ViewKit.text(root, 'btn_back/label', ViewKit.lang('codex_back'));
        ViewKit.text(root, 'title', ViewKit.lang('codex_title'));
        ViewKit.text(root, 'tip', ViewKit.lang('codex_tip'));
        ViewKit.text(root, 'tab_unit/label', ViewKit.lang('codex_units'));
        ViewKit.text(root, 'tab_enemy/label', ViewKit.lang('codex_enemies'));

        ViewKit.click(ViewKit.get(root, 'btn_back'), () => {
            oops.gui.remove(UIID.Codex);
        });
        ViewKit.click(ViewKit.get(root, 'tab_unit'), () => this.switchMode('unit'));
        ViewKit.click(ViewKit.get(root, 'tab_enemy'), () => this.switchMode('enemy'));

        this.switchMode('unit');
    }

    private switchMode(mode: CodexMode): void {
        this.mode = mode;

        const activeColor = ViewKit.color('#C8A15A');
        const idleColor = ViewKit.color('#B9A98E');
        const unitLabel = ViewKit.label(this.node, 'tab_unit/label');
        const enemyLabel = ViewKit.label(this.node, 'tab_enemy/label');
        if (unitLabel != null) unitLabel.color = mode === 'unit' ? activeColor : idleColor;
        if (enemyLabel != null) enemyLabel.color = mode === 'enemy' ? activeColor : idleColor;
        ViewKit.tintPath(this.node, 'tab_unit', mode === 'unit' ? '#2A241C' : '#1E1A15');
        ViewKit.tintPath(this.node, 'tab_enemy', mode === 'enemy' ? '#2A241C' : '#1E1A15');

        const ids = mode === 'unit' ? TableUnits.ids() : TableEnemies.ids();
        this.selectedId = ids.length > 0 ? ids[0] : '';
        void this.refreshList();
        void this.refreshDetail();
    }

    //#region 左侧列表
    private async refreshList(): Promise<void> {
        const list = this.list;
        if (list == null) return;

        list.children.slice().forEach((child) => {
            child.removeFromParent();
            child.destroy();
        });

        const ids = this.mode === 'unit' ? TableUnits.ids() : TableEnemies.ids();
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const item = await ViewKit.instantiatePrefab('gui/main/codex_item', list);
            if (item == null || !list.isValid) return;

            // 23 名武将：4 列 × 6 行
            const col = i % 4;
            const row = Math.floor(i / 4);
            item.setPosition(new Vec3((col - 1.5) * 190, 180 - row * 60, 0));
            this.fillItem(item, id);
            ViewKit.click(item, () => {
                this.selectedId = id;
                void this.refreshList();
                void this.refreshDetail();
            });
        }
    }

    private fillItem(item: Node, id: string): void {
        const isUnit = this.mode === 'unit';
        const config = isUnit ? TableUnits.get(id) : TableEnemies.get(id);
        if (config == null) return;

        const unlocked = isUnit ? PlayerModel.inst.isUnitUnlocked(id) : PlayerModel.inst.isEnemyUnlocked(id);
        const selected = this.selectedId === id;

        ViewKit.visible(item, 'frame', selected);
        ViewKit.tintPath(item, 'bg', selected ? '#2A241C' : '#1E1A15');
        ViewKit.tintPath(item, 'chip', unlocked ? config.color : '#2A241C', unlocked ? 235 : 255);
        ViewKit.text(item, 'tag', unlocked ? config.tag : '?');
        ViewKit.text(item, 'name', unlocked ? ViewKit.lang(config.nameKey) : '???');
        ViewKit.text(item, 'kind', isUnit ? ViewKit.lang(`kind_${(config as IUnitConfig).kind}`) : ViewKit.lang(`ekind_${(config as IEnemyConfig).kind}`));

        const name = ViewKit.label(item, 'name');
        if (name != null) name.color = ViewKit.color(unlocked ? '#F2E6D0' : '#7A6A55');
    }
    //#endregion

    //#region 右侧详情
    private async refreshDetail(): Promise<void> {
        const detail = this.detail;
        if (detail == null) return;

        const isUnit = this.mode === 'unit';
        const config = isUnit ? TableUnits.get(this.selectedId) : TableEnemies.get(this.selectedId);
        if (config == null) return;

        const unlocked = isUnit ? PlayerModel.inst.isUnitUnlocked(config.id) : PlayerModel.inst.isEnemyUnlocked(config.id);

        ViewKit.tintPath(detail, 'head_chip', unlocked ? config.color : '#2A241C', 235);
        ViewKit.text(detail, 'head_tag', unlocked ? config.tag : '?');
        ViewKit.text(detail, 'head_name', unlocked ? ViewKit.lang(config.nameKey) : '???');
        ViewKit.text(detail, 'head_kind', isUnit ? ViewKit.lang(`kind_${(config as IUnitConfig).kind}`) : ViewKit.lang(`ekind_${(config as IEnemyConfig).kind}`));
        ViewKit.text(detail, 'desc', unlocked ? ViewKit.lang(config.descKey) : ViewKit.lang('codex_locked'));

        const rows = ViewKit.get(detail, 'rows');
        if (rows == null) return;

        rows.children.slice().forEach((child) => {
            child.removeFromParent();
            child.destroy();
        });

        if (!unlocked) return;

        const items: { key: string; value: string }[] = [];
        if (isUnit) {
            const unit = config as IUnitConfig;
            items.push({ key: ViewKit.lang('codex_hp'), value: String(unit.hp) });
            items.push({ key: ViewKit.lang('codex_cost'), value: String(unit.cost) });
            items.push({ key: ViewKit.lang('codex_cooldown'), value: `${unit.cooldown}s` });
            if (unit.atk != null && unit.atk > 0) items.push({ key: ViewKit.lang('codex_atk'), value: String(unit.atk) });
            if (unit.interval != null) items.push({ key: ViewKit.lang('codex_interval'), value: `${unit.interval}s` });
            if (unit.produce != null) items.push({ key: ViewKit.lang('codex_produce'), value: `${unit.produce.value} / ${unit.produce.interval}s` });
            if (unit.talent != null) {
                items.push({ key: ViewKit.lang('codex_talent'), value: `${unit.talent.name} · ${unit.talent.cd}s` });
            }
        }
        else {
            const enemy = config as IEnemyConfig;
            items.push({ key: ViewKit.lang('codex_hp'), value: String(enemy.hp) });
            items.push({ key: ViewKit.lang('codex_armor'), value: String(enemy.armor) });
            items.push({ key: ViewKit.lang('codex_speed'), value: enemy.speed.toFixed(2) });
            items.push({ key: ViewKit.lang('codex_eat'), value: String(enemy.eat) });
        }

        for (let i = 0; i < items.length; i++) {
            const row = await ViewKit.instantiatePrefab('gui/main/detail_row', rows);
            if (row == null || !rows.isValid) return;
            row.setPosition(new Vec3(0, -i * 28, 0));
            ViewKit.text(row, 'key', items[i].key);
            ViewKit.text(row, 'value', items[i].value);
        }
    }
    //#endregion
}
