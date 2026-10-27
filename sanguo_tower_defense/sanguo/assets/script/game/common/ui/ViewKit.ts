import type { EventTouch } from 'cc';
import { Color, Label, Node, Prefab, Sprite, UITransform, Vec3, instantiate, tween } from 'cc';
import { oops } from 'db://oops-framework/core/Oops';
import { AudioPath, AudioService } from './AudioService';

/**
 * 视图绑定工具
 *
 * 强制性约束：界面元素全部来自预制体，本类只允许"按路径找节点 + 改文本/颜色/显隐/尺寸"，
 * 禁止在运行时创建新的界面节点（列表项必须实例化独立预制体）。
 */
export class ViewKit {
    /**
     * 多语言文本（原 L() 工具合并到本类）
     * 合并原因：独立的小工具模块在预览构建中曾因循环依赖导致注入失败（L 为 undefined）
     * @param key  语言键
     * @param args 依次替换 %{0} %{1} ...
     */
    static lang(key: string, ...args: (string | number)[]): string {
        let text = oops.language.getLangByID(key);
        if (text == null || text === '') return key;
        for (let i = 0; i < args.length; i++) {
            text = text.replace(`%{${i}}`, String(args[i]));
        }
        return text;
    }

    /** 关卡名称（缺失时回退为"第 N 关"） */
    static levelName(levelId: number): string {
        const name = oops.language.getLangByID(`level_${levelId}_name`);
        if (name != null && name !== '') return name;
        return `第 ${levelId} 关`;
    }

    /** 按相对路径取节点，例如 'panel/btn_close' */
    static get(root: Node | null, path: string): Node | null {
        if (root == null || !root.isValid) return null;
        if (path === '' || path === '.') return root;

        const parts = path.split('/');
        let current: Node | null = root;
        for (const part of parts) {
            if (current == null) return null;
            current = current.getChildByName(part);
        }
        if (current == null) {
            console.error(`[三国塔防] 预制体中缺少节点：${path}`);
            return null;
        }
        return current;
    }

    /** 取文本组件 */
    static label(root: Node | null, path: string): Label | null {
        const node = this.get(root, path);
        if (node == null) return null;
        const label = node.getComponent(Label);
        if (label == null) console.error(`[三国塔防] 节点 ${path} 未挂载 Label`);
        return label;
    }

    /** 取图片组件 */
    static sprite(root: Node | null, path: string): Sprite | null {
        const node = this.get(root, path);
        if (node == null) return null;
        const sprite = node.getComponent(Sprite);
        if (sprite == null) console.error(`[三国塔防] 节点 ${path} 未挂载 Sprite`);
        return sprite;
    }

    /** 安全设置文本 */
    static setText(label: Label | null, text: string): void {
        if (label == null || !label.node.isValid) return;
        if (label.string === text) return;
        label.string = text;
    }

    /** 按路径设置文本 */
    static text(root: Node | null, path: string, text: string): void {
        this.setText(this.label(root, path), text);
    }

    /** 设置显隐 */
    static visible(root: Node | null, path: string, visible: boolean): void {
        const node = this.get(root, path);
        if (node != null) node.active = visible;
    }

    /** 十六进制颜色 */
    static color(hex: string, alpha = 255): Color {
        const value = hex.replace('#', '');
        const c = new Color();
        c.r = parseInt(value.substring(0, 2), 16) || 0;
        c.g = parseInt(value.substring(2, 4), 16) || 0;
        c.b = parseInt(value.substring(4, 6), 16) || 0;
        c.a = alpha;
        return c;
    }

    /** 给图片染色 */
    static tint(sprite: Sprite | null, hex: string, alpha = 255): void {
        if (sprite == null || !sprite.node.isValid) return;
        sprite.color = this.color(hex, alpha);
    }

    /** 按路径染色 */
    static tintPath(root: Node | null, path: string, hex: string, alpha = 255): void {
        this.tint(this.sprite(root, path), hex, alpha);
    }

    /**
     * 设置左对齐图片的宽度比例（0~1），用于进度条与血条
     * 预制体中该图片锚点必须为 (0, 0.5) 且 x 位于左端
     */
    static setBar(root: Node | null, path: string, ratio: number): void {
        const node = this.get(root, path);
        if (node == null) return;
        const transform = node.getComponent(UITransform);
        if (transform == null) return;
        const full = transform.width > 0 ? transform.width : 1;
        // 首次调用时记录满宽，避免比例多次缩放后失真
        const holder = node as unknown as { __barFullWidth?: number };
        if (holder.__barFullWidth == null || holder.__barFullWidth <= 0) holder.__barFullWidth = full;
        const target = Math.max(1, holder.__barFullWidth * Math.min(1, Math.max(0, ratio)));
        transform.setContentSize(target, transform.height);
    }

    /** 点击绑定（含点击音效与悬浮缩放） */
    static click(target: Node | null, callback: () => void): void {
        if (target == null) return;

        target.on(Node.EventType.TOUCH_END, () => {
            AudioService.playEffect(AudioPath.Click);
            callback();
        });
        target.on(Node.EventType.MOUSE_ENTER, () => {
            if (target.isValid) target.setScale(1.02, 1.02, 1);
        });
        target.on(Node.EventType.MOUSE_LEAVE, () => {
            if (target.isValid) target.setScale(1, 1, 1);
        });
    }

    /** 设置节点尺寸 */
    static resize(node: Node | null, width: number, height: number): void {
        if (node == null) return;
        const transform = node.getComponent(UITransform);
        if (transform != null) transform.setContentSize(width, height);
    }

    /** 设置位置 */
    static move(node: Node | null, x: number, y: number): void {
        if (node == null) return;
        node.setPosition(new Vec3(x, y, 0));
    }

    /** 加载并实例化预制体（列表项统一走这里） */
    static async instantiatePrefab(path: string, parent: Node): Promise<Node | null> {
        try {
            const prefab = await oops.res.load(path, Prefab);
            if (prefab == null) {
                console.error(`[三国塔防] 预制体加载失败：${path}`);
                return null;
            }
            const node = instantiate(prefab);
            node.parent = parent;
            return node;
        }
        catch (e) {
            console.error(`[三国塔防] 预制体加载异常：${path}`, e);
            return null;
        }
    }

    /** 开关视觉刷新（预制体结构：track + knob） */
    static refreshSwitch(switchNode: Node | null, on: boolean): void {
        if (switchNode == null) return;
        const track = this.sprite(switchNode, 'track');
        const knob = switchNode.getChildByName('knob');
        this.tint(track, on ? '#3E8E5A' : '#12100D');
        this.move(knob, on ? 15 : -15, 0);
    }

    /** 绑定开关点击 */
    static bindSwitch(switchNode: Node | null, value: boolean, onChange: (value: boolean) => void): void {
        if (switchNode == null) return;
        let current = value;
        this.refreshSwitch(switchNode, current);
        switchNode.on(Node.EventType.TOUCH_END, () => {
            current = !current;
            AudioService.playEffect(AudioPath.Click);
            this.refreshSwitch(switchNode, current);
            onChange(current);
        });
    }

    /**
     * 绑定滑块（预制体结构：track + fill(anchor 0) + knob）
     * 返回设置进度的函数，便于外部同步
     */
    static bindSlider(sliderNode: Node | null, value: number, onChange: (value: number) => void): (value: number) => void {
        if (sliderNode == null) return () => undefined;

        const track = sliderNode.getChildByName('track');
        const trackTransform = track != null ? track.getComponent(UITransform) : null;
        const knob = sliderNode.getChildByName('knob');
        const fullWidth = trackTransform != null && trackTransform.width > 0 ? trackTransform.width : 480;

        const apply = (ratio: number) => {
            const v = Math.min(1, Math.max(0, ratio));
            const fillNode = sliderNode.getChildByName('fill');
            if (fillNode != null) {
                const transform = fillNode.getComponent(UITransform);
                if (transform != null) transform.setContentSize(Math.max(2, fullWidth * v), transform.height);
            }
            this.move(knob, -fullWidth / 2 + fullWidth * v, 0);
        };
        apply(value);

        let current = value;
        const handle = (event: EventTouch) => {
            const transform = sliderNode.getComponent(UITransform);
            if (transform == null) return;
            const ui = event.getUILocation();
            const local = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
            const ratio = Math.min(1, Math.max(0, (local.x + fullWidth / 2) / fullWidth));
            if (Math.abs(ratio - current) < 0.002) return;
            current = ratio;
            apply(ratio);
            onChange(ratio);
        };

        sliderNode.on(Node.EventType.TOUCH_START, handle);
        sliderNode.on(Node.EventType.TOUCH_MOVE, handle);

        return (value2: number) => {
            current = Math.min(1, Math.max(0, value2));
            apply(current);
        };
    }

    /** 弹层出现动画（缩放 + 淡入），只针对预制体上已有节点做变换 */
    static popIn(node: Node | null): void {
        if (node == null) return;
        node.setScale(0.94, 0.94, 1);
        tween(node).to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    }
}
