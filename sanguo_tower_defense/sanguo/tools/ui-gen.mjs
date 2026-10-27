/**
 * 三国塔防 UI 生成器（离线工具，不参与运行时）
 *
 * 作用：
 * 1、生成占位 PNG 贴图与对应 .meta（九宫格边框、SpriteFrame UUID）
 * 2、按声明式描述生成标准 Cocos Creator 预制体（.prefab），可后续在编辑器中直接编辑
 * 3、生成视图脚本的 .ts.meta，使预制体中的脚本组件 UUID 稳定可引用
 *
 * 用法：node tools/ui-gen.mjs
 * 说明：生成后的预制体即为唯一 UI 来源，运行时代码只允许读取节点并刷新数值/文本。
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = join(ROOT, 'assets', 'bundle');
const SCRIPT = join(ROOT, 'assets', 'script', 'game');

//#region 基础工具
function writeFile(path, content) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
}

function hexToRgba(hex, alpha = 255) {
    const v = hex.replace('#', '');
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), alpha];
}

/** UUID 压缩（与 Cocos Creator 内部 compressUuid 一致：保留前 5 位，其余每 3 个 hex → 2 个 base64 字符） */
const BASE64_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function compressUuid(uuid) {
    const hex = uuid.replace(/-/g, '');
    if (hex.length !== 32) throw new Error(`UUID 长度非法: ${uuid}`);
    let out = hex.slice(0, 5);
    for (let i = 5; i < 32; i += 3) {
        const value = parseInt(hex.slice(i, i + 3), 16);
        out += BASE64_KEYS[value >> 6] + BASE64_KEYS[value & 0x3f];
    }
    return out;
}

// 自检：与工程中已有预制体保持一致
if (compressUuid('92429ca4-4e7c-450a-b706-c96e7c2568e3') !== '92429ykTnxFCrcGyW58JWjj') {
    throw new Error('UUID 压缩算法自检失败');
}

function uuidFrom(seed) {
    const hex = createHash('md5').update(seed).digest('hex').split('');
    hex[12] = '4';
    const variant = (parseInt(hex[16], 16) & 0x3) | 0x8;
    hex[16] = variant.toString(16);
    const s = hex.join('');
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** 将 RGBA 像素编码为 PNG */
function encodePng(width, height, rgba) {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0;
        rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    }
    return Buffer.concat([
        signature,
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', deflateSync(raw, { level: 9 })),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}
//#endregion

//#region 占位贴图绘制
/** 采样 3x3 得到圆角矩形覆盖率 */
function roundedCoverage(w, h, radius, inset, px, py) {
    const left = inset;
    const right = w - inset;
    const top = inset;
    const bottom = h - inset;
    const r = Math.max(0, radius - inset);
    let hit = 0;
    for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
            const x = px + (sx + 0.5) / 3;
            const y = py + (sy + 0.5) / 3;
            if (x < left || x > right || y < top || y > bottom) continue;
            const cx = Math.min(Math.max(x, left + r), right - r);
            const cy = Math.min(Math.max(y, top + r), bottom - r);
            const dx = x - cx;
            const dy = y - cy;
            if (dx * dx + dy * dy <= r * r) hit++;
        }
    }
    return hit / 9;
}

/** 圆角矩形贴图（可带描边） */
function paintRounded(w, h, radius, fill, border, borderWidth) {
    const buf = Buffer.alloc(w * h * 4);
    const fillColor = fill ? hexToRgba(fill[0], fill[1] ?? 255) : null;
    const borderColor = border ? hexToRgba(border) : null;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const outer = roundedCoverage(w, h, radius, 0, x, y);
            if (outer <= 0) continue;
            const inner = borderWidth > 0 ? roundedCoverage(w, h, radius, borderWidth, x, y) : outer;
            const i = (y * w + x) * 4;
            let r = 0, g = 0, b = 0, a = 0;
            if (fillColor && inner > 0) {
                r = fillColor[0]; g = fillColor[1]; b = fillColor[2]; a = fillColor[3];
            }
            if (borderColor && outer > inner) {
                const t = (outer - inner) / Math.max(0.001, outer);
                r = r * (1 - t) + borderColor[0] * t;
                g = g * (1 - t) + borderColor[1] * t;
                b = b * (1 - t) + borderColor[2] * t;
                a = Math.max(a, 255 * outer);
            }
            else {
                a = 255 * outer;
            }
            buf[i] = Math.round(r);
            buf[i + 1] = Math.round(g);
            buf[i + 2] = Math.round(b);
            buf[i + 3] = Math.round(a);
        }
    }
    return buf;
}

/** 圆形贴图（白色，运行时按需要染色） */
function paintCircle(w, h) {
    const buf = Buffer.alloc(w * h * 4);
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) / 2 - 1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let hit = 0;
            for (let sy = 0; sy < 3; sy++) {
                for (let sx = 0; sx < 3; sx++) {
                    const dx = x + (sx + 0.5) / 3 - cx;
                    const dy = y + (sy + 0.5) / 3 - cy;
                    if (dx * dx + dy * dy <= r * r) hit++;
                }
            }
            const i = (y * w + x) * 4;
            buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255;
            buf[i + 3] = Math.round((hit / 9) * 255);
        }
    }
    return buf;
}

/** 竖向渐变贴图 */
function paintGradient(w, h, stops) {
    const buf = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
        const t = y / (h - 1);
        const [c0, c1] = stops;
        const r = Math.round(c0[0] + (c1[0] - c0[0]) * t);
        const g = Math.round(c0[1] + (c1[1] - c0[1]) * t);
        const b = Math.round(c0[2] + (c1[2] - c0[2]) * t);
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
        }
    }
    return buf;
}

function paintSolid(w, h) {
    const buf = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        buf[i * 4] = 255; buf[i * 4 + 1] = 255; buf[i * 4 + 2] = 255; buf[i * 4 + 3] = 255;
    }
    return buf;
}

/** 贴图定义：文件名、尺寸、绘制函数、九宫格边框 */
const TEXTURES = [
    { name: 'tex_bg', w: 8, h: 256, paint: () => paintGradient(8, 256, [[0x1c, 0x18, 0x12], [0x0b, 0x09, 0x07]]), border: 0 },
    { name: 'tex_panel', w: 64, h: 64, paint: () => paintRounded(64, 64, 16, ['#1E1A15', 255], '#3A3128', 1.2), border: 16 },
    { name: 'tex_panel_raise', w: 64, h: 64, paint: () => paintRounded(64, 64, 16, ['#2A241C', 255], '#4A3E2E', 1.4), border: 16 },
    { name: 'tex_frame_gold', w: 64, h: 64, paint: () => paintRounded(64, 64, 16, null, '#C8A15A', 2.4), border: 16 },
    { name: 'tex_btn', w: 64, h: 64, paint: () => paintRounded(64, 64, 14, ['#2A241C', 255], '#C8A15A', 1.6), border: 14 },
    { name: 'tex_btn_primary', w: 64, h: 64, paint: () => paintRounded(64, 64, 14, ['#C8A15A', 255], '#E8D6A8', 1.6), border: 14 },
    { name: 'tex_chip', w: 64, h: 64, paint: () => paintRounded(64, 64, 12, ['#FFFFFF', 255], null, 0), border: 12 },
    { name: 'tex_circle', w: 64, h: 64, paint: () => paintCircle(64, 64), border: 0 },
    { name: 'tex_solid', w: 8, h: 8, paint: () => paintSolid(8, 8), border: 0 },
];

const TEX_UUID = {};
const TEX_SF_UUID = {};
const TEX_BORDER = {};

function generateTextures() {
    for (const tex of TEXTURES) {
        const uuid = uuidFrom(`sanguo:texture:${tex.name}`);
        TEX_UUID[tex.name] = uuid;
        TEX_SF_UUID[tex.name] = `${uuid}@f9941`;
        TEX_BORDER[tex.name] = tex.border;

        const dir = join(BUNDLE, 'game', 'texture');
        writeFile(join(dir, `${tex.name}.png`), encodePng(tex.w, tex.h, tex.paint()));

        const meta = {
            ver: '1.0.27',
            importer: 'image',
            imported: true,
            uuid,
            files: ['.json', '.png'],
            subMetas: {
                '6c48a': {
                    importer: 'texture',
                    uuid: `${uuid}@6c48a`,
                    displayName: tex.name,
                    id: '6c48a',
                    name: 'texture',
                    ver: '1.0.22',
                    imported: true,
                    files: ['.json'],
                    subMetas: {},
                    userData: {
                        wrapModeS: 'clamp-to-edge',
                        wrapModeT: 'clamp-to-edge',
                        minfilter: 'linear',
                        magfilter: 'linear',
                        mipfilter: 'none',
                        premultiplyAlpha: false,
                        anisotropy: 1,
                        isUuid: true,
                        imageUuidOrDatabaseUri: uuid,
                        visible: false,
                    },
                },
                f9941: {
                    importer: 'sprite-frame',
                    uuid: `${uuid}@f9941`,
                    displayName: tex.name,
                    id: 'f9941',
                    name: 'spriteFrame',
                    ver: '1.0.12',
                    imported: true,
                    files: ['.json'],
                    subMetas: {},
                    userData: {
                        trimType: 'auto',
                        trimThreshold: 1,
                        rotated: false,
                        offsetX: 0,
                        offsetY: 0,
                        trimX: 0,
                        trimY: 0,
                        width: tex.w,
                        height: tex.h,
                        rawWidth: tex.w,
                        rawHeight: tex.h,
                        borderTop: tex.border,
                        borderBottom: tex.border,
                        borderLeft: tex.border,
                        borderRight: tex.border,
                        isUuid: true,
                        imageUuidOrDatabaseUri: `${uuid}@6c48a`,
                        atlasUuid: '',
                        packable: true,
                        pixelsToUnit: 100,
                        pivotX: 0.5,
                        pivotY: 0.5,
                        meshType: 0,
                        vertices: {
                            rawPosition: [-tex.w / 2, -tex.h / 2, 0, tex.w / 2, -tex.h / 2, 0, -tex.w / 2, tex.h / 2, 0, tex.w / 2, tex.h / 2, 0],
                            indexes: [0, 1, 2, 2, 1, 3],
                            uv: [0, tex.h, tex.w, tex.h, 0, 0, tex.w, 0],
                            nuv: [0, 0, 1, 0, 0, 1, 1, 1],
                            minPos: [-tex.w / 2, -tex.h / 2, 0],
                            maxPos: [tex.w / 2, tex.h / 2, 0],
                        },
                    },
                },
            },
            userData: {
                type: 'sprite-frame',
                redirect: `${uuid}@6c48a`,
                hasAlpha: true,
                fixAlphaTransparencyArtifacts: false,
            },
        };
        writeFile(join(dir, `${tex.name}.png.meta`), JSON.stringify(meta, null, 2));
    }
}
//#endregion

//#region 预制体生成
const UI_LAYER = 33554432;

/** 视觉占位文本：运行时由视图脚本按多语言赋值 */
const PLACEHOLDER = '';

class PrefabBuilder {
    constructor(name) {
        this.name = name;
        this.arr = [];
        this.seed = 0;
    }

    fileId(tag) {
        const hash = createHash('md5').update(`${this.name}:${tag}:${this.seed++}`).digest('base64');
        return hash.replace(/[+/=]/g, '').slice(0, 22);
    }

    addComponent(obj, nodeIndex, node) {
        const index = this.arr.length;
        obj.node = { __id__: nodeIndex };
        obj._id = '';
        obj.__prefab = { __id__: index + 1 };
        this.arr.push(obj);
        this.arr.push({ __type__: 'cc.CompPrefabInfo', fileId: this.fileId('c') });
        node._components.push({ __id__: index });
        return index;
    }

    addNode(spec, parentId, isRoot) {
        const nodeIndex = this.arr.length;
        const node = {
            __type__: 'cc.Node',
            _name: spec.name,
            _objFlags: 0,
            __editorExtras__: {},
            _parent: parentId == null ? null : { __id__: parentId },
            _children: [],
            _active: spec.active !== false,
            _components: [],
            _prefab: null,
            _lpos: { __type__: 'cc.Vec3', x: spec.x ?? 0, y: spec.y ?? 0, z: 0 },
            _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
            _lscale: {
                __type__: 'cc.Vec3',
                x: spec.scale ?? 1,
                y: spec.scale ?? 1,
                z: 1,
            },
            _mobility: 0,
            _layer: UI_LAYER,
            _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
            _id: '',
        };
        this.arr.push(node);

        const width = spec.w ?? (spec.label?.wrap ? spec.label.width ?? 300 : 0);
        const height = spec.h ?? (spec.label ? (spec.label.size ?? 18) * 1.4 : 0);
        const ax = spec.ax ?? 0.5;
        const ay = spec.ay ?? 0.5;

        // 变换组件
        this.addComponent({
            __type__: 'cc.UITransform',
            _name: '',
            _objFlags: 0,
            __editorExtras__: {},
            _enabled: true,
            _contentSize: { __type__: 'cc.Size', width, height },
            _anchorPoint: { __type__: 'cc.Vec2', x: ax, y: ay },
        }, nodeIndex, node);

        // 图片
        if (spec.sprite) {
            const sf = TEX_SF_UUID[spec.sprite];
            if (!sf) throw new Error(`未定义的贴图: ${spec.sprite}`);
            const color = hexToRgba(spec.color ?? '#FFFFFF', spec.alpha ?? 255);
            this.addComponent({
                __type__: 'cc.Sprite',
                _name: '',
                _objFlags: 0,
                __editorExtras__: {},
                _enabled: true,
                _customMaterial: null,
                _srcBlendFactor: 2,
                _dstBlendFactor: 4,
                _color: { __type__: 'cc.Color', r: color[0], g: color[1], b: color[2], a: color[3] },
                _spriteFrame: { __uuid__: sf, __expectedType__: 'cc.SpriteFrame' },
                // 有九宫格边框的贴图才使用 SLICED，其余使用 SIMPLE 拉伸
                _type: spec.sliced === false || (TEX_BORDER[spec.sprite] ?? 0) === 0 ? 0 : 1,
                _fillType: 0,
                _sizeMode: 0,
                _fillCenter: { __type__: 'cc.Vec2', x: 0, y: 0 },
                _fillStart: 0,
                _fillRange: 0,
                _isTrimmedMode: true,
                _useGrayscale: false,
                _atlas: null,
            }, nodeIndex, node);
        }

        // 文本
        if (spec.label) {
            const l = spec.label;
            const color = hexToRgba(l.color ?? '#F2E6D0', l.alpha ?? 255);
            const fontSize = l.size ?? 18;
            this.addComponent({
                __type__: 'cc.Label',
                _name: '',
                _objFlags: 0,
                __editorExtras__: {},
                _enabled: true,
                _customMaterial: null,
                _srcBlendFactor: 2,
                _dstBlendFactor: 4,
                _color: { __type__: 'cc.Color', r: color[0], g: color[1], b: color[2], a: color[3] },
                _string: l.text ?? PLACEHOLDER,
                _horizontalAlign: l.align === 'left' ? 0 : l.align === 'right' ? 2 : 1,
                _verticalAlign: l.valign === 'top' ? 0 : l.valign === 'bottom' ? 2 : 1,
                _actualFontSize: fontSize,
                _fontSize: fontSize,
                _fontFamily: 'Microsoft YaHei',
                _lineHeight: l.lineHeight ?? Math.round(fontSize * 1.35),
                _overflow: l.wrap ? 3 : 0,
                _enableWrapText: l.wrap === true,
                _font: null,
                _isSystemFontUsed: true,
                _spacingX: 0,
                _isItalic: false,
                _isBold: l.bold === true,
                _isUnderline: false,
                _underlineHeight: 2,
                _cacheMode: 0,
                _enableOutline: false,
                _outlineColor: { __type__: 'cc.Color', r: 0, g: 0, b: 0, a: 255 },
                _outlineWidth: 2,
                _enableShadow: false,
                _shadowColor: { __type__: 'cc.Color', r: 0, g: 0, b: 0, a: 255 },
                _shadowOffset: { __type__: 'cc.Vec2', x: 2, y: 2 },
                _shadowBlur: 2,
            }, nodeIndex, node);
        }

        // 透明度
        if (spec.opacity != null) {
            this.addComponent({
                __type__: 'cc.UIOpacity',
                _name: '',
                _objFlags: 0,
                __editorExtras__: {},
                _enabled: true,
                _opacity: spec.opacity,
            }, nodeIndex, node);
        }

        // 点击拦截
        if (spec.blockInput) {
            this.addComponent({
                __type__: 'cc.BlockInputEvents',
                _name: '',
                _objFlags: 0,
                __editorExtras__: {},
                _enabled: true,
            }, nodeIndex, node);
        }

        // 全屏拉伸
        if (spec.widget === 'stretch') {
            this.addComponent({
                __type__: 'cc.Widget',
                _name: '',
                _objFlags: 0,
                __editorExtras__: {},
                _enabled: true,
                _alignFlags: 45,
                _target: null,
                _left: 0,
                _right: 0,
                _top: 0,
                _bottom: 0,
                _horizontalCenter: 0,
                _verticalCenter: 0,
                _isAbsLeft: true,
                _isAbsRight: true,
                _isAbsTop: true,
                _isAbsBottom: true,
                _isAbsHorizontalCenter: true,
                _isAbsVerticalCenter: true,
                _originalWidth: width,
                _originalHeight: height,
                _alignMode: 2,
                _lockFlags: 0,
            }, nodeIndex, node);
        }

        // 业务脚本
        if (spec.script) {
            const comp = {
                __type__: compressUuid(spec.script.uuid),
                _name: '',
                _objFlags: 0,
                __editorExtras__: {},
                _enabled: true,
                ...(spec.script.props ?? {}),
            };
            this.addComponent(comp, nodeIndex, node);
        }

        // 子节点
        const children = spec.children ?? [];
        for (const child of children) {
            const id = this.addNode(child, nodeIndex, false);
            node._children.push({ __id__: id });
        }

        // 节点预制体信息
        const prefabInfoIndex = this.arr.length;
        const info = {
            __type__: 'cc.PrefabInfo',
            root: { __id__: 1 },
            asset: { __id__: 0 },
            fileId: this.fileId('n'),
            instance: null,
            targetOverrides: null,
        };
        if (isRoot) info.nestedPrefabInstanceRoots = null;
        this.arr.push(info);
        node._prefab = { __id__: prefabInfoIndex };

        return nodeIndex;
    }

    build(rootSpec) {
        this.arr.push({
            __type__: 'cc.Prefab',
            _name: this.name,
            _objFlags: 0,
            __editorExtras__: {},
            _native: '',
            data: { __id__: 1 },
            optimizationPolicy: 0,
            persistent: false,
        });
        this.addNode(rootSpec, null, true);
        return JSON.stringify(this.arr, null, 2);
    }
}

/** 快捷构造：纯节点 */
const node = (name, opts = {}, children = []) => ({ name, ...opts, children });
/** 快捷构造：图片节点 */
const sprite = (name, tex, w, h, opts = {}, children = []) => ({ name, sprite: tex, w, h, ...opts, children });
/** 快捷构造：文本节点（active / ax / ay 属于节点属性，其余属于 Label 属性） */
const label = (name, text, size, color, x, y, opts = {}) => {
    const { active, ax, ay, ...labelOpts } = opts;
    return { name, x, y, active: active !== false, ax, ay, label: { text, size, color, ...labelOpts } };
};

const C = {
    bgDeep: '#12100D',
    bgPanel: '#1E1A15',
    bgRaise: '#2A241C',
    gold: '#C8A15A',
    goldSoft: '#D9C08C',
    red: '#B03A2E',
    green: '#3E6B5A',
    text: '#F2E6D0',
    textDim: '#B9A98E',
    textMuted: '#7A6A55',
    danger: '#C0392B',
    info: '#3D6E8F',
    dark: '#0B0907',
};

/** 九宫格按钮 */
function button(name, text, w, h, x, y, opts = {}) {
    const primary = opts.primary === true;
    return sprite(name, primary ? 'tex_btn_primary' : 'tex_btn', w, h, { x, y }, [
        label('label', text, opts.size ?? 20, opts.textColor ?? (primary ? C.bgDeep : C.text), 0, 0, { bold: true }),
    ]);
}

function switchNode(name, x, y) {
    return node(name, { x, y, w: 64, h: 32 }, [
        sprite('track', 'tex_solid', 64, 32, { color: C.bgDeep }),
        sprite('knob', 'tex_circle', 26, 26, { x: -15, color: C.textMuted }),
    ]);
}

function sliderNode(name, x, y, width) {
    return node(name, { x, y, w: width, h: 30 }, [
        sprite('track', 'tex_solid', width, 6, { color: C.bgDeep }),
        sprite('fill', 'tex_solid', width, 6, { x: -width / 2, ax: 0, color: C.gold }),
        sprite('knob', 'tex_circle', 22, 22, { x: -width / 2, color: C.goldSoft }),
    ]);
}
//#endregion

//#region 视图脚本 UUID 表
const SCRIPTS = {
    MainViewComp: { file: 'main/MainViewComp.ts', uuid: uuidFrom('sanguo:script:MainViewComp') },
    LevelSelectViewComp: { file: 'main/LevelSelectViewComp.ts', uuid: uuidFrom('sanguo:script:LevelSelectViewComp') },
    CodexViewComp: { file: 'main/CodexViewComp.ts', uuid: uuidFrom('sanguo:script:CodexViewComp') },
    SettingsViewComp: { file: 'main/SettingsViewComp.ts', uuid: uuidFrom('sanguo:script:SettingsViewComp') },
    BattleViewComp: { file: 'battle/view/BattleViewComp.ts', uuid: uuidFrom('sanguo:script:BattleViewComp') },
    PauseViewComp: { file: 'battle/view/PauseViewComp.ts', uuid: uuidFrom('sanguo:script:PauseViewComp') },
    ResultViewComp: { file: 'battle/view/ResultViewComp.ts', uuid: uuidFrom('sanguo:script:ResultViewComp') },
};

function writeScriptMetas() {
    for (const key of Object.keys(SCRIPTS)) {
        const script = SCRIPTS[key];
        const path = join(SCRIPT, script.file);
        writeFile(`${path}.meta`, JSON.stringify({
            ver: '4.0.24',
            importer: 'typescript',
            imported: true,
            uuid: script.uuid,
            files: [],
            subMetas: {},
            userData: {},
        }, null, 2));
    }
}
//#endregion

//#region 屏幕预制体定义
function rootSpec(name, script, children) {
    return {
        name,
        w: 1280,
        h: 720,
        widget: 'stretch',
        script: { uuid: SCRIPTS[script].uuid },
        children,
    };
}

/** 主界面 */
function mainPrefab() {
    const card = (name, glyph, title, tip, y) => sprite(name, 'tex_panel_raise', 470, 116, { x: 350, y }, [
        sprite('chip', 'tex_solid', 76, 76, { x: -180, color: C.bgDeep }),
        label('glyph', glyph, 36, C.gold, -180, 0, { bold: true }),
        label('title', title, 26, C.text, -122, 16, { bold: true, align: 'left', ax: 0 }),
        label('tip', tip, 14, C.textMuted, -120, -18, { align: 'left', ax: 0 }),
        label('arrow', '›', 34, C.gold, 202, 0),
    ]);

    const stat = (name, x, cap) => [
        label(name, '0', 32, C.goldSoft, x, -168, { bold: true }),
        label(`${name}_cap`, cap, 14, C.textMuted, x, -204),
    ];

    return rootSpec('main', 'MainViewComp', [
        sprite('bg', 'tex_bg', 1280, 720, { color: '#FFFFFF' }),
        sprite('band_bottom', 'tex_solid', 1280, 240, { y: -240, color: C.bgPanel, alpha: 170 }),
        sprite('band_bottom2', 'tex_solid', 1280, 130, { y: -300, color: C.bgRaise, alpha: 140 }),
        sprite('line_top', 'tex_solid', 1280, 2, { y: 348, color: C.gold, alpha: 60 }),
        sprite('line_bottom', 'tex_solid', 1280, 2, { y: -318, color: C.gold, alpha: 40 }),
        sprite('accent_line', 'tex_solid', 3, 210, { x: -604, y: 152, color: C.gold, alpha: 170 }),
        label('title', '', 72, C.gold, -580, 196, { bold: true, align: 'left', ax: 0 }),
        label('subtitle', '', 15, C.textMuted, -576, 140, { align: 'left', ax: 0 }),
        label('chapter', '', 16, C.goldSoft, -576, 104, { align: 'left', ax: 0 }),
        sprite('btn_continue', 'tex_btn', 430, 100, { x: -330, y: -20 }, [
            label('label_main', '', 30, C.text, 0, 16, { bold: true }),
            label('label_tip', '', 15, C.textDim, 0, -24),
        ]),
        ...stat('stat_clears', -540, ''),
        ...stat('stat_stars', -390, ''),
        ...stat('stat_kills', -240, ''),
        label('all_clear', '', 15, C.goldSoft, -580, -252, { align: 'left', ax: 0, active: false }),
        card('card_levels', '关', '', '', 168),
        card('card_codex', '鉴', '', '', 40),
        card('card_settings', '设', '', '', -88),
        sprite('footer_line', 'tex_solid', 460, 1, { x: 350, y: -176, color: C.textMuted, alpha: 80 }),
        label('lang', '', 13, C.textMuted, -585, -336, { align: 'left', ax: 0 }),
        label('version', '', 13, C.textMuted, 585, -336, { align: 'right', ax: 1 }),
    ]);
}

/** 关卡选择 */
function levelSelectPrefab() {
    const cond = (name, y) => label(name, '', 15, C.textDim, -160, y, { align: 'left', ax: 0 });
    return rootSpec('level_select', 'LevelSelectViewComp', [
        sprite('bg', 'tex_bg', 1280, 720, { color: '#FFFFFF' }),
        sprite('line_top', 'tex_solid', 1280, 2, { y: 336, color: C.gold, alpha: 60 }),
        button('btn_back', '', 108, 46, -560, 296, { size: 18 }),
        label('title', '', 34, C.gold, -460, 296, { bold: true, align: 'left', ax: 0 }),
        label('stars_total', '', 22, C.goldSoft, 580, 296, { align: 'right', ax: 1 }),
        sprite('divider', 'tex_solid', 1160, 1, { y: 262, color: C.textMuted, alpha: 70 }),
        node('grid', { x: -515, y: 184, w: 810, h: 420 }),
        sprite('detail', 'tex_panel', 380, 452, { x: 370, y: 40 }, [
            label('detail_name', '', 30, C.gold, -160, 186, { bold: true, align: 'left', ax: 0 }),
            label('detail_index', '', 13, C.textMuted, -160, 156, { align: 'left', ax: 0 }),
            sprite('detail_divider', 'tex_solid', 330, 1, { y: 136, color: C.textMuted, alpha: 60 }),
            cond('cond1', 108),
            cond('cond2', 82),
            cond('cond3', 56),
            label('enemies_title', '', 15, C.textMuted, -160, 12, { align: 'left', ax: 0 }),
            node('enemies', { y: -28, w: 340, h: 60 }),
            label('units_title', '', 15, C.textMuted, -160, -78, { align: 'left', ax: 0 }),
            node('units', { y: -118, w: 340, h: 52 }),
            label('tip', '', 13, C.textMuted, -160, -160, { align: 'left', ax: 0, ay: 1, wrap: true, width: 320 }),
        ]),
        button('btn_start', '', 380, 66, 370, -238, { primary: true, size: 24 }),
    ]);
}

/** 图鉴 */
function codexPrefab() {
    return rootSpec('codex', 'CodexViewComp', [
        sprite('bg', 'tex_bg', 1280, 720, { color: '#FFFFFF' }),
        sprite('line_top', 'tex_solid', 1280, 2, { y: 336, color: C.gold, alpha: 60 }),
        button('btn_back', '', 108, 46, -560, 296, { size: 18 }),
        label('title', '', 34, C.gold, -460, 296, { bold: true, align: 'left', ax: 0 }),
        label('tip', '', 14, C.textMuted, 580, 296, { align: 'right', ax: 1 }),
        button('tab_unit', '', 236, 48, -500, 210, { size: 19 }),
        button('tab_enemy', '', 236, 48, -240, 210, { size: 19 }),
        node('list', { x: -360, y: 20, w: 760, h: 420 }),
        sprite('detail', 'tex_panel', 340, 440, { x: 430, y: 20 }, [
            sprite('head_chip', 'tex_chip', 92, 92, { y: 146, color: C.bgRaise }),
            label('head_tag', '', 40, C.bgDeep, 0, 146, { bold: true }),
            label('head_name', '', 26, C.goldSoft, 0, 78, { bold: true }),
            label('head_kind', '', 14, C.textMuted, 0, 52),
            node('rows', { y: 20, w: 300, h: 180 }),
            label('desc', '', 14, C.textDim, -140, -132, { align: 'left', ax: 0, ay: 1, wrap: true, width: 280 }),
        ]),
    ]);
}

/** 设置 */
function settingsPrefab() {
    return rootSpec('settings', 'SettingsViewComp', [
        sprite('dim', 'tex_solid', 1280, 720, { color: '#000000', alpha: 170, blockInput: true }),
        sprite('panel', 'tex_panel', 640, 540, {}, [
            label('title', '', 30, C.gold, 0, 226, { bold: true }),
            sprite('divider1', 'tex_solid', 560, 1, { y: 192, color: C.textMuted, alpha: 60 }),
            label('music_label', '', 18, C.text, -280, 150, { align: 'left', ax: 0 }),
            switchNode('music_switch', 236, 150),
            sliderNode('music_slider', -20, 116, 480),
            label('sfx_label', '', 18, C.text, -280, 60, { align: 'left', ax: 0 }),
            switchNode('sfx_switch', 236, 60),
            sliderNode('sfx_slider', -20, 26, 480),
            sprite('divider2', 'tex_solid', 560, 1, { y: 6, color: C.textMuted, alpha: 50 }),
            label('auto_label', '', 18, C.text, -280, -30, { align: 'left', ax: 0 }),
            switchNode('auto_switch', 236, -30),
            label('speed_label', '', 18, C.text, -280, -72, { align: 'left', ax: 0 }),
            switchNode('speed_switch', 236, -72),
            label('lang_label', '', 18, C.text, -280, -112, { align: 'left', ax: 0 }),
            button('btn_lang', '', 150, 44, 196, -112, { size: 17 }),
            sprite('divider3', 'tex_solid', 560, 1, { y: -146, color: C.textMuted, alpha: 50 }),
            button('btn_clear', '', 220, 48, -240, -186, { size: 17 }),
            label('version', '', 13, C.textMuted, 290, -186, { align: 'right', ax: 1 }),
            button('btn_close', '', 260, 54, 0, -232, { primary: true, size: 20 }),
        ]),
    ]);
}
//#endregion

//#region 战斗预制体定义
const CELL_W = 96;
const CELL_H = 84;
const BOARD_W = CELL_W * 9;
const BOARD_H = CELL_H * 5;

function battlePrefab() {
    const cells = [];
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 9; col++) {
            const color = (row + col) % 2 === 0 ? '#2F4A3A' : '#274034';
            const x = -BOARD_W / 2 + CELL_W / 2 + col * CELL_W;
            const y = BOARD_H / 2 - CELL_H / 2 - row * CELL_H;
            cells.push(node(`cell_${row}_${col}`, { x, y, w: CELL_W - 2, h: CELL_H - 2 }, [
                sprite('bg', 'tex_solid', CELL_W - 2, CELL_H - 2, { color }),
                sprite('hl', 'tex_frame_gold', CELL_W - 4, CELL_H - 4, { active: false, color: '#FFFFFF' }),
            ]));
        }
    }

    const mowers = [];
    for (let row = 0; row < 5; row++) {
        const y = BOARD_H / 2 - CELL_H / 2 - row * CELL_H;
        mowers.push(sprite(`mower_${row}`, 'tex_chip', 62, 62, { x: -BOARD_W / 2 - 64, y, color: '#8A6B4F' }, [
            label('tag', '拒', 24, C.bgDeep, 0, 0, { bold: true }),
        ]));
    }

    return rootSpec('battle', 'BattleViewComp', [
        sprite('bg', 'tex_bg', 1280, 720, { color: '#FFFFFF' }),
        // 顶部 HUD
        sprite('food_chip', 'tex_circle', 52, 52, { x: -560, y: 318, color: C.gold }, [
            label('tag', '粮', 22, C.bgDeep, 0, 0, { bold: true }),
        ]),
        label('food_value', '0', 26, C.goldSoft, -524, 318, { bold: true, align: 'left', ax: 0 }),
        sprite('wave_bar_bg', 'tex_solid', 420, 10, { x: 30, y: 322, color: '#000000', alpha: 120 }),
        sprite('wave_bar_fill', 'tex_solid', 420, 10, { x: -180, y: 322, ax: 0, color: C.gold }),
        label('wave_text', '', 14, C.textDim, 30, 298),
        button('btn_pause', '', 88, 40, 486, 318, { size: 16 }),
        button('btn_speed', '', 88, 40, 582, 318, { size: 16 }),
        // 战场
        node('board', { x: -70, y: 10, w: BOARD_W, h: BOARD_H }, [
            sprite('wall', 'tex_solid', 104, BOARD_H, { x: -BOARD_W / 2 - 54, color: '#3A3128' }),
            sprite('wall_line', 'tex_solid', 3, BOARD_H, { x: -BOARD_W / 2 - 3, color: C.gold, alpha: 90 }),
            node('field', { w: BOARD_W, h: BOARD_H }, cells),
            node('mowers', { w: BOARD_W, h: BOARD_H }, mowers),
            node('actors', { w: BOARD_W, h: BOARD_H }),
            node('input', { w: BOARD_W, h: BOARD_H }),
        ]),
        // 底部（卡片栏居中于左侧可用区域，避免 12 张卡时超出 1280 设计宽度）
        node('cards', { x: -150, y: -300, w: 900, h: 110 }),
        button('btn_retreat', '', 130, 48, 400, -300, { size: 17 }),
        button('btn_cancel', '', 130, 48, 542, -300, { size: 17 }),
        label('hint', '', 14, C.textDim, 0, -366),
        // 大波横幅
        sprite('banner', 'tex_btn_primary', 460, 64, { y: 140, active: false }, [
            label('text', '', 30, C.bgDeep, 0, 0, { bold: true }),
        ]),
        // 新手引导
        sprite('guide', 'tex_panel', 620, 78, { y: -232, active: false }, [
            label('text', '', 15, C.text, -290, 0, { align: 'left', ax: 0, wrap: true, width: 560 }),
        ]),
        // 调试面板
        node('debug', { x: 470, y: 130, w: 300, h: 230, active: false }, [
            sprite('bg', 'tex_panel', 300, 230, { color: '#FFFFFF' }),
            button('btn_food', '+500 粮', 260, 40, 0, 78, { size: 15 }),
            button('btn_wave', '下一波', 260, 40, 0, 30, { size: 15 }),
            button('btn_kill', '全灭敌军', 260, 40, 0, -18, { size: 15 }),
            button('btn_grid', '显示网格', 260, 40, 0, -66, { size: 15 }),
        ]),
    ]);
}

function pausePrefab() {
    return rootSpec('pause', 'PauseViewComp', [
        sprite('dim', 'tex_solid', 1280, 720, { color: '#000000', alpha: 180, blockInput: true }),
        sprite('panel', 'tex_panel', 520, 480, {}, [
            label('title', '', 32, C.gold, 0, 190, { bold: true }),
            label('wave_text', '', 15, C.textDim, 0, 150),
            sprite('divider', 'tex_solid', 440, 1, { y: 120, color: C.textMuted, alpha: 60 }),
            button('btn_resume', '', 360, 58, 0, 60, { primary: true, size: 22 }),
            button('btn_restart', '', 360, 54, 0, -12, { size: 20 }),
            button('btn_settings', '', 360, 54, 0, -78, { size: 20 }),
            button('btn_quit', '', 360, 54, 0, -144, { size: 20 }),
        ]),
    ]);
}

function resultPrefab() {
    return rootSpec('result', 'ResultViewComp', [
        sprite('dim', 'tex_solid', 1280, 720, { color: '#000000', alpha: 185, blockInput: true }),
        sprite('panel', 'tex_panel', 560, 500, {}, [
            label('title', '', 40, C.gold, 0, 200, { bold: true }),
            label('level_name', '', 20, C.textDim, 0, 156),
            label('star1', '☆', 46, C.textMuted, -64, 92),
            label('star2', '☆', 46, C.textMuted, 0, 100),
            label('star3', '☆', 46, C.textMuted, 64, 92),
            label('time', '', 16, C.textDim, 0, 36),
            label('unlock', '', 16, C.goldSoft, 0, 4),
            button('btn_retry', '', 200, 52, -108, -96, { size: 19 }),
            button('btn_next', '', 200, 52, 108, -96, { primary: true, size: 19 }),
            button('btn_home', '', 300, 50, 0, -170, { size: 18 }),
        ]),
    ]);
}
//#endregion

//#region 列表项预制体
function levelCardPrefab() {
    return node('level_card', { w: 150, h: 112 }, [
        sprite('bg', 'tex_panel', 150, 112, { color: '#FFFFFF' }),
        sprite('frame', 'tex_frame_gold', 150, 112, { active: false }),
        label('index', '', 30, C.gold, -58, 24, { bold: true, align: 'left', ax: 0 }),
        label('name', '', 16, C.text, -58, -14, { align: 'left', ax: 0 }),
        label('lock', '', 14, C.textMuted, 60, 24, { align: 'right', ax: 1, active: false }),
        label('star1', '☆', 16, C.textMuted, -40, -42),
        label('star2', '☆', 16, C.textMuted, -16, -42),
        label('star3', '☆', 16, C.textMuted, 8, -42),
    ]);
}

function codexItemPrefab() {
    return node('codex_item', { w: 236, h: 66 }, [
        sprite('bg', 'tex_panel', 236, 66, { color: '#FFFFFF' }),
        sprite('frame', 'tex_frame_gold', 236, 66, { active: false }),
        sprite('chip', 'tex_chip', 44, 44, { x: -88, color: '#2A241C' }),
        label('tag', '', 20, C.bgDeep, -88, 0, { bold: true }),
        label('name', '', 17, C.text, -56, 12, { align: 'left', ax: 0 }),
        label('kind', '', 12, C.textMuted, -56, -14, { align: 'left', ax: 0 }),
    ]);
}

/** 通用兵种小标（敌军预览、我方缩略） */
function chipPrefab() {
    return node('chip', { w: 56, h: 56 }, [
        sprite('bg', 'tex_chip', 56, 56, { color: '#2A241C' }),
        label('tag', '', 22, C.bgDeep, 0, 0, { bold: true }),
    ]);
}

function detailRowPrefab() {
    return node('detail_row', { w: 280, h: 28 }, [
        label('key', '', 16, C.textDim, -140, 0, { align: 'left', ax: 0 }),
        label('value', '', 16, C.text, 140, 0, { align: 'right', ax: 1 }),
    ]);
}

function cardPrefab() {
    return node('card', { w: 92, h: 106 }, [
        sprite('bg', 'tex_panel', 92, 106, { color: '#FFFFFF' }),
        sprite('frame', 'tex_frame_gold', 92, 106, { active: false }),
        sprite('chip', 'tex_chip', 52, 52, { y: 18, color: '#E0B64A' }),
        label('tag', '', 24, C.bgDeep, 0, 18, { bold: true }),
        label('name', '', 12, C.textDim, 0, -16),
        label('cost', '', 14, C.goldSoft, 0, -34, { bold: true }),
        sprite('mask', 'tex_solid', 92, 106, { color: '#000000', alpha: 160, ay: 1, y: 53 }),
        label('mask_text', '', 13, C.textDim, 0, 0, { active: false }),
    ]);
}
//#endregion

//#region 战斗演员预制体
function actorUnitPrefab() {
    return node('actor_unit', { w: 80, h: 80 }, [
        sprite('chip', 'tex_chip', 64, 64, { color: '#6FBF73' }),
        label('tag', '', 26, C.bgDeep, 0, 0, { bold: true }),
        node('hp', { y: 36, w: 60, h: 6, active: false }, [
            sprite('bg', 'tex_solid', 60, 6, { color: '#0B0907', alpha: 210 }),
            sprite('fill', 'tex_solid', 60, 6, { ax: 0, x: -30, color: '#3E8E5A' }),
        ]),
    ]);
}

function actorEnemyPrefab() {
    return node('actor_enemy', { w: 80, h: 80 }, [
        sprite('chip', 'tex_chip', 58, 58, { color: '#8A9A6B' }),
        label('tag', '', 24, C.bgDeep, 0, 0, { bold: true }),
        node('hp', { y: 34, w: 56, h: 5 }, [
            sprite('bg', 'tex_solid', 56, 5, { color: '#0B0907', alpha: 210 }),
            sprite('fill', 'tex_solid', 56, 5, { ax: 0, x: -28, color: '#C0392B' }),
            sprite('armor', 'tex_solid', 56, 2, { ax: 0, x: -28, y: -4, color: '#3D6E8F', active: false }),
        ]),
    ]);
}

function actorBulletPrefab() {
    return node('actor_bullet', { w: 16, h: 16 }, [
        sprite('dot', 'tex_solid', 12, 12, { color: '#F2E6D0' }),
    ]);
}

function actorFoodPrefab() {
    return node('actor_food', { w: 40, h: 40, opacity: 255 }, [
        sprite('chip', 'tex_circle', 38, 38, { color: '#E0B64A' }),
        label('tag', '粮', 18, C.bgDeep, 0, 0, { bold: true }),
    ]);
}

function floatTextPrefab() {
    return node('float_text', { w: 80, h: 30, opacity: 255 }, [
        label('text', '', 18, C.goldSoft, 0, 0, { bold: true }),
    ]);
}

/** 爆炸/命中光圈 */
function fxBurstPrefab() {
    return node('fx_burst', { w: 120, h: 120, opacity: 220 }, [
        sprite('ring', 'tex_circle', 100, 100, { color: '#D9A441' }),
    ]);
}

function mowerPrefab() {
    return node('mower', { w: 62, h: 62 }, [
        sprite('chip', 'tex_chip', 62, 62, { color: '#8A6B4F' }),
        label('tag', '拒', 24, C.bgDeep, 0, 0, { bold: true }),
    ]);
}
//#endregion

const PREFABS = [
    { path: 'gui/main/main.prefab', builder: () => new PrefabBuilder('main').build(mainPrefab()) },
    { path: 'gui/main/level_select.prefab', builder: () => new PrefabBuilder('level_select').build(levelSelectPrefab()) },
    { path: 'gui/main/codex.prefab', builder: () => new PrefabBuilder('codex').build(codexPrefab()) },
    { path: 'gui/main/settings.prefab', builder: () => new PrefabBuilder('settings').build(settingsPrefab()) },
    { path: 'gui/battle/battle.prefab', builder: () => new PrefabBuilder('battle').build(battlePrefab()) },
    { path: 'gui/battle/pause.prefab', builder: () => new PrefabBuilder('pause').build(pausePrefab()) },
    { path: 'gui/battle/result.prefab', builder: () => new PrefabBuilder('result').build(resultPrefab()) },
    { path: 'gui/main/level_card.prefab', builder: () => new PrefabBuilder('level_card').build(levelCardPrefab()) },
    { path: 'gui/main/codex_item.prefab', builder: () => new PrefabBuilder('codex_item').build(codexItemPrefab()) },
    { path: 'gui/main/detail_row.prefab', builder: () => new PrefabBuilder('detail_row').build(detailRowPrefab()) },
    { path: 'gui/main/chip.prefab', builder: () => new PrefabBuilder('chip').build(chipPrefab()) },
    { path: 'gui/battle/card.prefab', builder: () => new PrefabBuilder('card').build(cardPrefab()) },
    { path: 'gui/battle/actor_unit.prefab', builder: () => new PrefabBuilder('actor_unit').build(actorUnitPrefab()) },
    { path: 'gui/battle/actor_enemy.prefab', builder: () => new PrefabBuilder('actor_enemy').build(actorEnemyPrefab()) },
    { path: 'gui/battle/actor_bullet.prefab', builder: () => new PrefabBuilder('actor_bullet').build(actorBulletPrefab()) },
    { path: 'gui/battle/actor_food.prefab', builder: () => new PrefabBuilder('actor_food').build(actorFoodPrefab()) },
    { path: 'gui/battle/float_text.prefab', builder: () => new PrefabBuilder('float_text').build(floatTextPrefab()) },
    { path: 'gui/battle/fx_burst.prefab', builder: () => new PrefabBuilder('fx_burst').build(fxBurstPrefab()) },
    { path: 'gui/battle/mower.prefab', builder: () => new PrefabBuilder('mower').build(mowerPrefab()) },
];

generateTextures();
writeScriptMetas();
for (const item of PREFABS) {
    writeFile(join(BUNDLE, item.path), item.builder());
}
console.log(`已生成 ${TEXTURES.length} 张占位贴图、${PREFABS.length} 个预制体、${Object.keys(SCRIPTS).length} 个脚本 meta`);
