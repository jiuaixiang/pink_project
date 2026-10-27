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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

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
                r = fillColor[0]; g = fillColor[1]; b = fillColor[2];
                a = fillColor[3] * inner;
            }
            if (borderColor && outer > inner) {
                const t = (outer - inner) / Math.max(0.001, outer);
                r = r * (1 - t) + borderColor[0] * t;
                g = g * (1 - t) + borderColor[1] * t;
                b = b * (1 - t) + borderColor[2] * t;
                a = Math.max(a, borderColor[3] * outer);
            }
            // 只描边（fill=null）时内部必须保持全透明，否则会变成一块实心黑
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

/** 径向渐变（RGBA）：内芯 → 中层 → 透明，用于金色光晕 */
function paintRadial(w, h, inner, mid, midStop = 0.4) {
    const buf = Buffer.alloc(w * h * 4);
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) / 2;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R;
            let r = 0, g = 0, b = 0, a = 0;
            if (d <= midStop) {
                const t = d / midStop;
                r = inner[0] + (mid[0] - inner[0]) * t;
                g = inner[1] + (mid[1] - inner[1]) * t;
                b = inner[2] + (mid[2] - inner[2]) * t;
                a = inner[3] + (mid[3] - inner[3]) * t;
            }
            else if (d < 1) {
                const t = (d - midStop) / (1 - midStop);
                const k = Math.pow(1 - t, 1.4);
                r = mid[0];
                g = mid[1];
                b = mid[2];
                a = mid[3] * k;
            }
            const i = (y * w + x) * 4;
            buf[i] = Math.round(r);
            buf[i + 1] = Math.round(g);
            buf[i + 2] = Math.round(b);
            buf[i + 3] = Math.round(Math.max(0, Math.min(255, a)));
        }
    }
    return buf;
}

/** 光芒：竖向长条，中线最亮、两端渐隐，横向柔和边缘 */
function paintRay(w, h) {
    const buf = Buffer.alloc(w * h * 4);
    const cx = w / 2;
    for (let y = 0; y < h; y++) {
        const vy = Math.abs((y + 0.5) / h - 0.5) * 2;      // 0 中心 → 1 两端
        const av = Math.pow(1 - vy, 1.35);
        for (let x = 0; x < w; x++) {
            const hx = Math.abs((x + 0.5) / w - 0.5) * 2;
            const ah = Math.pow(1 - hx, 1.8);
            const i = (y * w + x) * 4;
            buf[i] = 255;
            buf[i + 1] = 216;
            buf[i + 2] = 124;
            buf[i + 3] = Math.round(255 * av * ah);
        }
    }
    return buf;
}

/** 柔边点（星屑） */
function paintStar(size) {
    const buf = paintRadial(size, size, [255, 244, 190, 255], [255, 226, 150, 120], 0.28);
    return buf;
}

/** 扫光带：横向高斯亮带 + 纵向柔和 */
function paintSheen(w, h) {
    const buf = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
        const vy = Math.abs((y + 0.5) / h - 0.5) * 2;
        const av = Math.pow(1 - vy, 0.85);
        for (let x = 0; x < w; x++) {
            const hx = Math.abs((x + 0.5) / w - 0.5) * 2;
            const ah = Math.pow(1 - hx, 2.2);
            const i = (y * w + x) * 4;
            buf[i] = 255;
            buf[i + 1] = 255;
            buf[i + 2] = 255;
            buf[i + 3] = Math.round(255 * av * ah);
        }
    }
    return buf;
}

/** 解析 PNG 为 RGBA 像素（支持 8bit 的 6/2/0 类型、非隔行） */
function readPngRGBA(file) {
    const buf = readFileSync(file);
    let offset = 8;
    let width = 0, height = 0, colorType = 6, bitDepth = 8, interlace = 0;
    const idat = [];
    while (offset < buf.length) {
        const len = buf.readUInt32BE(offset);
        const type = buf.toString('ascii', offset + 4, offset + 8);
        const data = buf.slice(offset + 8, offset + 8 + len);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
            interlace = data[12];
        }
        else if (type === 'IDAT') idat.push(data);
        else if (type === 'IEND') break;
        offset += 12 + len;
    }
    if (bitDepth !== 8 || interlace !== 0) throw new Error(`不支持的 PNG 格式：depth=${bitDepth} interlace=${interlace}`);
    const channels = colorType === 6 ? 4 : (colorType === 2 ? 3 : 1);
    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const out = Buffer.alloc(width * height * 4);
    const prev = Buffer.alloc(stride);
    const line = Buffer.alloc(stride);

    const paeth = (a, b, c) => {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        if (pa <= pb && pa <= pc) return a;
        return pb <= pc ? b : c;
    };

    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const src = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let i = 0; i < stride; i++) {
            const a = i >= channels ? line[i - channels] : 0;
            const b = prev[i];
            const c = i >= channels ? prev[i - channels] : 0;
            let v = src[i];
            if (filter === 1) v = (v + a) & 255;
            else if (filter === 2) v = (v + b) & 255;
            else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
            else if (filter === 4) v = (v + paeth(a, b, c)) & 255;
            line[i] = v;
        }
        for (let x = 0; x < width; x++) {
            const si = x * channels;
            const di = (y * width + x) * 4;
            if (channels === 4) {
                out[di] = line[si]; out[di + 1] = line[si + 1]; out[di + 2] = line[si + 2]; out[di + 3] = line[si + 3];
            }
            else if (channels === 3) {
                out[di] = line[si]; out[di + 1] = line[si + 1]; out[di + 2] = line[si + 2]; out[di + 3] = 255;
            }
            else {
                out[di] = line[si]; out[di + 1] = line[si]; out[di + 2] = line[si]; out[di + 3] = 255;
            }
        }
        line.copy(prev);
    }
    return { w: width, h: height, data: out };
}

/** 参考稿内嵌的默认武将画像（透明底剪影） */
function loadPortrait() {
    try {
        return readPngRGBA(join(ROOT, 'tools', 'source', 'portrait_default.png'));
    }
    catch (e) {
        console.warn('默认武将画像缺失，跳过 portrait_default 贴图', e.message);
        return null;
    }
}

const PORTRAIT = loadPortrait();

/** 贴图定义：文件名、尺寸、绘制函数、九宫格边框 */
const TEXTURES = [
    { name: 'tex_bg', w: 8, h: 256, paint: () => paintGradient(8, 256, [[0x1c, 0x18, 0x12], [0x0b, 0x09, 0x07]]), border: 0 },
    // 战争红金风（对齐参考稿：朱红底 + 赤金描边）
    { name: 'tex_bg_red', w: 8, h: 256, paint: () => paintGradient(8, 256, [[0x9e, 0x2f, 0x28], [0x5e, 0x15, 0x12]]), border: 0 },
    { name: 'tex_panel_rail', w: 64, h: 64, paint: () => paintRounded(64, 64, 10, ['#3D1A10', 255], '#8A5A2B', 2), border: 12 },
    // 获得武将演出用的渐变贴图（含透明通道）
    { name: 'tex_glow', w: 256, h: 256, paint: () => paintRadial(256, 256, [255, 230, 158, 255], [232, 158, 56, 150], 0.34), border: 0 },
    { name: 'tex_glow_warm', w: 256, h: 256, paint: () => paintRadial(256, 256, [232, 158, 56, 200], [120, 60, 10, 80], 0.42), border: 0 },
    { name: 'tex_ray', w: 32, h: 512, paint: () => paintRay(32, 512), border: 0 },
    { name: 'tex_star', w: 32, h: 32, paint: () => paintStar(32), border: 0 },
    { name: 'tex_sheen', w: 64, h: 512, paint: () => paintSheen(64, 512), border: 0 },
    { name: 'tex_btn_gold', w: 64, h: 64, paint: () => paintRounded(64, 64, 8, ['#C9A227', 255], '#6E5010', 2), border: 10 },
    { name: 'tex_panel', w: 64, h: 64, paint: () => paintRounded(64, 64, 16, ['#1E1A15', 255], '#3A3128', 1.2), border: 16 },
    { name: 'tex_panel_raise', w: 64, h: 64, paint: () => paintRounded(64, 64, 16, ['#2A241C', 255], '#4A3E2E', 1.4), border: 16 },
    { name: 'tex_frame_gold', w: 64, h: 64, paint: () => paintRounded(64, 64, 16, null, '#C8A15A', 2.4), border: 16 },
    { name: 'tex_btn', w: 64, h: 64, paint: () => paintRounded(64, 64, 14, ['#2A241C', 255], '#C8A15A', 1.6), border: 14 },
    { name: 'tex_btn_primary', w: 64, h: 64, paint: () => paintRounded(64, 64, 14, ['#C8A15A', 255], '#E8D6A8', 1.6), border: 14 },
    { name: 'tex_chip', w: 64, h: 64, paint: () => paintRounded(64, 64, 12, ['#FFFFFF', 255], null, 0), border: 12 },
    { name: 'tex_circle', w: 64, h: 64, paint: () => paintCircle(64, 64), border: 0 },
    { name: 'tex_solid', w: 8, h: 8, paint: () => paintSolid(8, 8), border: 0 },
    // 参考稿内嵌的默认武将画像（透明底剪影，600×1001）
    ...(PORTRAIT != null ? [{ name: 'portrait_default', w: PORTRAIT.w, h: PORTRAIT.h, paint: () => PORTRAIT.data, border: 0 }] : []),
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
                _enableOutline: l.outline === true,
                _outlineColor: (() => {
                    const oc = hexToRgba(l.outlineColor ?? '#000000', 255);
                    return { __type__: 'cc.Color', r: oc[0], g: oc[1], b: oc[2], a: oc[3] };
                })(),
                _outlineWidth: l.outlineWidth ?? 2,
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

        // 多语言：LanguageLabel（运行时按 dataID 覆盖文本，编辑器保留示例文案）
        if (spec.lang) {
            this.addComponent({
                __type__: FRAMEWORK.LanguageLabel,
                _name: '',
                _objFlags: 0,
                __editorExtras__: {},
                _enabled: true,
                _dataID: spec.lang,
                _params: [],
            }, nodeIndex, node);
        }

        // MVVM：VMLabel 数据绑定（watchPath 以 * 开头时由 VMParent 替换为实例 tag）
        if (spec.vm != null) {
            this.addComponent({
                __type__: FRAMEWORK.VMLabel,
                _name: '',
                _objFlags: 0,
                __editorExtras__: {},
                _enabled: true,
                templateMode: spec.vm.arr != null,
                watchPath: spec.vm.arr == null ? (spec.vm.path ?? '') : '',
                labelType: 'cc.Label',
                watchPathArr: spec.vm.arr ?? [],
            }, nodeIndex, node);
        }

        // MVVM：VMState 状态控制（NODE_VISIBLE：满足条件显示，不满足隐藏）
        if (spec.vmState != null) {
            this.addComponent({
                __type__: FRAMEWORK.VMState,
                _name: '',
                _objFlags: 0,
                __editorExtras__: {},
                _enabled: true,
                watchPath: spec.vmState.path ?? '',
                foreachChildMode: false,
                condition: spec.vmState.condition ?? 0,
                valueA: spec.vmState.valueA ?? 1,
                valueAction: spec.vmState.action ?? 1,
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

        // 附加业务脚本（同一节点多组件，如 VMParent 数据源）
        for (const extra of spec.scripts ?? []) {
            this.addComponent({
                __type__: compressUuid(extra.uuid),
                _name: '',
                _objFlags: 0,
                __editorExtras__: {},
                _enabled: true,
                ...(extra.props ?? {}),
            }, nodeIndex, node);
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
/**
 * 预制体默认示例文案（编辑器里预览布局用，运行时会被真实数据覆盖）
 *
 * 约定：人名用「张三/李四/王五」，数值用真实量级，说明文案以「示例」开头。
 */
const LABEL_DEFAULTS = {
    title: '标题',
    subtitle: '示例副标题',
    name: '张三',
    card_name: '张三',
    unit_name: '张三',
    unit_kind: '武将 · 示例定位',
    head_name: '张三',
    head_kind: '武将',
    head_tag: '张',
    tag: '张',
    kind: '武将',
    level_name: '第 1 关 · 示例关卡',
    speaker: '旁白',
    text: '这里是示例文本，运行时会替换为实际内容，可以多行换行展示。',
    tap: '点击继续',
    goal: '【守城目标】示例：敌军自右侧一波波压向城门，守住城门耐久即获胜（敌将砸墙一次扣 5 点）。',
    controls: '【操作】示例：点选左侧卡槽后点击战场亮起的格子部署武将；「解雇」可撤回并返还 60% 粮草。',
    terms: '【术语】粮草=部署资源；连击=2.5 秒内连杀 3 名额外得粮；拒马=每行一次保命清场。',
    desc: '示例描述：运行时会替换为天赋或装备的完整说明。',
    talent_name: '奋短兵',
    talent_desc: '示例天赋说明：运行时替换为该武将天赋的完整描述。',
    hint: '提示文案',
    tip: '示例提示：运行时替换为关卡或操作提示',
    cost: '100',
    value: '999',
    count: '3 / 8',
    time: '00:00',
    drop: '获得装备：示例宝物',
    unlock: '通关第 1 关解锁',
    best_wave: '无尽最佳 第 8 波',
    all_clear: '已通关全部关卡',
    bag_count: '背包 12',
    stats: '攻击 +10% · 生命 +8% · 攻速 +5% · 暴击 +4%',
    status: '已装备',
    state: '粮 150',
    food: '现有粮草 300',
    line1: '攻击 +10%',
    line2: '生命 +8%',
    line3: '攻速 +5%',
    line4: '暴击 +4%',
    stat1: '生命 1200',
    stat2: '攻击 300',
    stat3: '费用 100 粮',
    stat4: '冷却 5.0 秒',
    stat5: '攻击间隔 1.2 秒',
    meta: '品阶 T4 · 武器',
    key: '示例属性',
    mark: '已穿 2',
    tier: 'T4',
    mask_text: '冷却中',
    index: '01',
    detail_index: '01',
    detail_name: '示例条目',
    lock: '未解锁',
    chapter: '第一章 · 黄巾初起',
    cond1: '★ 通关该关卡',
    cond2: '★★ 150 秒内通关',
    cond3: '★★★ 不用拒马通关',
    enemies_title: '敌军 ×18',
    units_title: '我方 ×3',
    gate_value: '5',
    wave_text: '第 1 / 3 波',
    remain_text: '剩余 18',
    next_wave: '下一波 12s',
    bond_tag: '羁缘 ×2',
    stars_total: '★ 12',
    auto_label: '自动拾取',
    music_label: '音乐',
    sfx_label: '音效',
    lang: '中文',
    lang_label: '语言',
    label_main: '音乐',
    label_tip: '示例：开启后自动拾取战场掉落的军粮',
    version: 'v1.0.0',
    label: '按钮',
};

/** 按钮默认示例文案（key = 按钮节点名） */
const BTN_DEFAULTS = {
    btn_action: '装备',
    btn_all: '全选',
    btn_back: '返回',
    btn_clear: '清空',
    btn_close: '关闭',
    btn_home: '主页',
    btn_lang: '语言',
    btn_next: '继续',
    btn_quit: '退出',
    btn_restart: '重开',
    btn_resume: '恢复',
    btn_retry: '再来一局',
    btn_settings: '设置',
    btn_skip: '跳过',
    btn_start: '开始',
    btn_strat: '军师',
    tab_enemy: '敌军',
    tab_unit: '武将',
};

/** 战斗左栏竖排按钮的默认示例 */
const RAIL_DEFAULTS = {
    btn_retreat: '解雇',
    btn_cancel: '取消',
    btn_pause: '暂停',
    btn_speed: '×1',
    btn_mute: '音效',
    btn_help: '玩法',
};

const label = (name, text, size, color, x, y, opts = {}) => {
    // opacity / lang / vm / vmState 都是节点级属性，必须从 Label 参数里提升出来
    const { active, ax, ay, opacity, lang, vm, vmState, ...labelOpts } = opts;
    // 空文本填充默认示例：保证编辑器里打开预制体不是空白
    const shown = text !== '' ? text : (LABEL_DEFAULTS[name] ?? '示例文本');
    return {
        name, x, y,
        active: active !== false, ax, ay, opacity, lang, vm, vmState,
        label: { text: shown, size, color, ...labelOpts },
    };
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
    const shown = text !== '' ? text : (BTN_DEFAULTS[name] ?? '按钮');
    return sprite(name, primary ? 'tex_btn_primary' : 'tex_btn', w, h, { x, y }, [
        label('label', shown, opts.size ?? 20, opts.textColor ?? (primary ? C.bgDeep : C.text), 0, 0, { bold: true }),
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
/** oops 框架脚本的组件 __type__（压缩 uuid，从扩展 meta 读取，保证与编辑器一致） */
const FRAMEWORK = (() => {
    const id = (rel) => compressUuid(JSON.parse(readFileSync(join(ROOT, 'extensions', 'oops-plugin-framework', 'assets', 'libs', rel), 'utf8')).uuid);
    return {
        LanguageLabel: id(join('gui', 'language', 'LanguageLabel.ts.meta')),
        VMLabel: id(join('model-view', 'VMLabel.ts.meta')),
        VMState: id(join('model-view', 'VMState.ts.meta')),
    };
})();

const SCRIPTS = {
    MainViewModel: { file: 'main/MainViewModel.ts', uuid: uuidFrom('sanguo:script:MainViewModel') },
    MainViewComp: { file: 'main/MainViewComp.ts', uuid: uuidFrom('sanguo:script:MainViewComp') },
    LevelSelectViewComp: { file: 'main/LevelSelectViewComp.ts', uuid: uuidFrom('sanguo:script:LevelSelectViewComp') },
    CodexViewComp: { file: 'main/CodexViewComp.ts', uuid: uuidFrom('sanguo:script:CodexViewComp') },
    EquipViewComp: { file: 'main/EquipViewComp.ts', uuid: uuidFrom('sanguo:script:EquipViewComp') },
    DraftViewComp: { file: 'main/DraftViewComp.ts', uuid: uuidFrom('sanguo:script:DraftViewComp') },
    HelpViewComp: { file: 'main/HelpViewComp.ts', uuid: uuidFrom('sanguo:script:HelpViewComp') },
    EquipDetailViewComp: { file: 'main/EquipDetailViewComp.ts', uuid: uuidFrom('sanguo:script:EquipDetailViewComp') },
    StratViewComp: { file: 'battle/view/StratViewComp.ts', uuid: uuidFrom('sanguo:script:StratViewComp') },
    StoryViewComp: { file: 'battle/view/StoryViewComp.ts', uuid: uuidFrom('sanguo:script:StoryViewComp') },
    GetHeroViewComp: { file: 'battle/view/GetHeroViewComp.ts', uuid: uuidFrom('sanguo:script:GetHeroViewComp') },
    UnitDetailViewComp: { file: 'battle/view/UnitDetailViewComp.ts', uuid: uuidFrom('sanguo:script:UnitDetailViewComp') },
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
function rootSpec(name, script, children, extraScripts = []) {
    return {
        name,
        w: 1280,
        h: 720,
        widget: 'stretch',
        script: { uuid: SCRIPTS[script].uuid },
        scripts: extraScripts,
        children,
    };
}

/** 主界面 */
function mainPrefab() {
    const card = (name, glyph, title, tip, y, titleKey, tipKey) => sprite(name, 'tex_panel_raise', 470, 116, { x: 350, y }, [
        sprite('chip', 'tex_solid', 76, 76, { x: -180, color: C.bgDeep }),
        label('glyph', glyph, 36, C.gold, -180, 0, { bold: true }),
        label('title', title, 26, C.text, -122, 16, { bold: true, align: 'left', ax: 0, lang: titleKey }),
        label('tip', tip, 14, C.textMuted, -120, -18, { align: 'left', ax: 0, lang: tipKey }),
        label('arrow', '›', 34, C.gold, 202, 0),
    ]);

    const stat = (name, x, cap, capKey, vmPath) => [
        label(name, '0', 32, C.goldSoft, x, -168, { bold: true, vm: { path: vmPath } }),
        label(`${name}_cap`, cap, 14, C.textMuted, x, -204, { lang: capKey }),
    ];

    return rootSpec('main', 'MainViewComp', [
        sprite('bg', 'tex_bg', 1280, 720, { color: '#FFFFFF' }),
        sprite('band_bottom', 'tex_solid', 1280, 240, { y: -240, color: C.bgPanel, alpha: 170 }),
        sprite('band_bottom2', 'tex_solid', 1280, 130, { y: -300, color: C.bgRaise, alpha: 140 }),
        sprite('line_top', 'tex_solid', 1280, 2, { y: 348, color: C.gold, alpha: 60 }),
        sprite('line_bottom', 'tex_solid', 1280, 2, { y: -318, color: C.gold, alpha: 40 }),
        sprite('accent_line', 'tex_solid', 3, 210, { x: -604, y: 152, color: C.gold, alpha: 170 }),
        label('title', '三國志', 72, C.gold, -580, 196, { bold: true, align: 'left', ax: 0, lang: 'app_title' }),
        label('subtitle', '示例副标题', 15, C.textMuted, -576, 140, { align: 'left', ax: 0, lang: 'app_subtitle' }),
        label('chapter', '第一章 · 黄巾初起', 16, C.goldSoft, -576, 104, { align: 'left', ax: 0, vm: { path: '*.chapterText' } }),
        sprite('btn_continue', 'tex_btn', 430, 100, { x: -330, y: -20 }, [
            label('label_main', '继续征战', 30, C.text, 0, 16, { bold: true, lang: 'main_continue' }),
            label('label_tip', '第 1 关 · 黄巾初起', 15, C.textDim, 0, -24, { vm: { path: '*.continueTip' } }),
        ]),
        ...stat('stat_clears', -540, '通关', 'main_stat_clears', '*.statClears'),
        ...stat('stat_stars', -390, '星星', 'main_stat_stars', '*.statStars'),
        ...stat('stat_kills', -240, '杀敌', 'main_stat_kills', '*.statKills'),
        label('all_clear', '已通关全部关卡', 15, C.goldSoft, -580, -252, {
            align: 'left', ax: 0, lang: 'main_all_clear', vmState: { path: '*.allClearShow' },
        }),
        label('best_wave', '无尽最佳 第 8 波', 13, '#8FB8FF', -580, -288, {
            align: 'left', ax: 0, vm: { path: '*.bestWaveText' }, vmState: { path: '*.bestWaveShow' },
        }),
        card('card_levels', '关', '开始征战', '选择关卡，守城杀敌', 168, 'main_levels', 'main_levels_tip'),
        card('card_equip', '装', '装备', '整军经武， 强化武将', 40, 'main_equip', 'main_equip_tip'),
        card('card_codex', '鉴', '武将图鉴', '检阅诸将与敌兵', -88, 'main_codex', 'main_codex_tip'),
        card('card_settings', '设', '设置', '音律与存档', -216, 'main_settings', 'main_settings_tip'),
        sprite('footer_line', 'tex_solid', 460, 1, { x: 350, y: -292, color: C.textMuted, alpha: 80 }),
        label('lang', '中文 / EN', 13, C.textMuted, -585, -336, { align: 'left', ax: 0, vm: { path: '*.langText' } }),
        label('version', 'v1.0.0', 13, C.textMuted, 585, -336, { align: 'right', ax: 1, vm: { path: '*.versionText' } }),
    ], [{ uuid: SCRIPTS.MainViewModel.uuid }]);
}

/** 剧情对话（底部对话条，点任意处继续） */
function storyPrefab() {
    return rootSpec('story', 'StoryViewComp', [
        sprite('dim', 'tex_solid', 1280, 720, { color: '#000000', alpha: 150, blockInput: true }),
        button('btn_skip', '', 130, 46, 520, 300, { size: 16 }),
        sprite('panel', 'tex_panel', 1120, 250, { y: -170, blockInput: true }, [
            label('speaker', '', 20, C.gold, -520, 84, { bold: true, align: 'left', ax: 0 }),
            label('text', '', 16, C.text, -520, 40, { align: 'left', ax: 0, ay: 1, wrap: true, width: 1040 }),
            label('tap', '', 12, C.textMuted, 500, -100, { align: 'right', ax: 1 }),
        ]),
    ]);
}

/**
 * 获得武将演出（逐帧驱动，节点全部来自预制体）
 *
 * 结构对齐参考稿画布版：
 *   dim（黑幕）· glow/glow_inner（双层金色背光）· rays（14 道旋转光芒）
 *   star_root（星屑容器，运行时从 get_hero_star 实例化）· card（金框 + 内底 + 白闪 + 扫光 + 四角饰）
 *   title（获得武将）· name（名号）· talent（天赋）· hint（轻触继续）
 */
function getHeroPrefab() {
    // 7 根贯通长条 = 视觉上 14 道光芒（与参考稿 14 道等分一致：镜像后间距 25.7°）
    const rays = [];
    for (let i = 0; i < 7; i++) {
        rays.push(sprite(`r${i}`, 'tex_ray', 30, 520, { color: '#FFFFFF', opacity: 0 }));
    }

    return rootSpec('get_hero', 'GetHeroViewComp', [
        sprite('dim', 'tex_solid', 1280, 720, { color: '#080402', opacity: 0, blockInput: true }),
        // 双层背光：外层暖橙扩散 + 内芯奶白金（对应参考稿径向渐变两段）
        sprite('glow', 'tex_glow_warm', 1000, 1000, { y: 36, color: '#FFFFFF', opacity: 0 }),
        sprite('glow_inner', 'tex_glow', 620, 620, { y: 36, color: '#FFFFFF', opacity: 0 }),
        node('rays', { y: 36, w: 520, h: 520, opacity: 0 }, rays),
        node('star_root', { y: 36, w: 1280, h: 700, opacity: 0 }),
        sprite('card', 'tex_panel_rail', 210, 300, { y: 36, opacity: 255 }, [
            // 卡下投影（参考稿 bx+3, by+5 的暗影）
            sprite('shadow', 'tex_panel_rail', 210, 300, { x: 4, y: -6, color: '#000000', alpha: 140 }),
            // 纯白 solid 纸底：tex_solid 是 100% 白，染纸色最可靠，任何情况下都不会变黑
            sprite('paper', 'tex_solid', 210, 300, { color: '#E6D3AE' }),
            // 必须用「白色」贴图做染色底：Sprite 颜色与贴图颜色是乘算，
            // 深色贴图（如 tex_panel_rail）染纸色会变成近黑。
            sprite('inner', 'tex_chip', 180, 270, { color: '#DCC49B' }),
            // 浅色纸底：默认画像是近黑剪影，参考稿用「卡面纸底透出」的方式承托
            sprite('backdrop', 'tex_chip', 180, 300, { color: '#E6D3AE' }),
            // 与源图 600×1001 同比例（180×300）；不透明度压到 215，
            // 万一贴图 alpha 被引擎忽略，也只会变成灰色块而不是纯黑
            sprite('portrait', 'portrait_default', 180, 300, { color: '#FFFFFF', opacity: 215 }),
            sprite('chip', 'tex_chip', 150, 150, { color: '#2A241C', active: false }),
            label('tag', '张', 64, '#F4D98A', 0, 0, { bold: true, active: false }),
            label('card_name', '张三', 16, '#3B2410', 0, -120, {
                bold: true, outline: true, outlineColor: '#F2E0BC', outlineWidth: 2,
            }),
            sprite('flash', 'tex_solid', 210, 300, { color: '#FFFFFF', opacity: 0 }),
            sprite('sweep', 'tex_sheen', 60, 420, { color: '#FFFFFF', opacity: 0 }),
            sprite('c1', 'tex_solid', 20, 14, { color: '#FFE9A8', x: -95, y: 143 }),
            sprite('c2', 'tex_solid', 20, 14, { color: '#FFE9A8', x: 95, y: 143 }),
            sprite('c3', 'tex_solid', 20, 14, { color: '#FFE9A8', x: -95, y: -143 }),
            sprite('c4', 'tex_solid', 20, 14, { color: '#FFE9A8', x: 95, y: -143 }),
            sprite('frame', 'tex_frame_gold', 210, 300),
        ]),
        label('title', '获 得 武 将', 26, '#FFD24A', 0, 246, {
            bold: true, opacity: 255, outline: true, outlineColor: '#3C1A04', outlineWidth: 4,
        }),
        label('name', '张三', 30, '#FFF6DC', 0, -165, {
            bold: true, opacity: 255, outline: true, outlineColor: '#321404', outlineWidth: 4,
        }),
        label('talent', '天赋 · 奋短兵', 14, '#FFE2A0', 0, -204, { opacity: 255 }),
        label('hint', '轻 触 继 续', 15, '#FFE6A8', 0, -296, { bold: true, opacity: 255 }),
    ]);
}

/**
 * 获得武将卡面（独立预制体）
 *
 * 演出层若检测不到画像节点，会用本预制体补建，保证任何情况下都能看到画像 + 阵营色底。
 */
function heroPortraitPrefab() {
    return node('hero_portrait', { w: 180, h: 300 }, [
        sprite('paper', 'tex_solid', 180, 300, { color: '#E6D3AE' }),
        sprite('backdrop', 'tex_chip', 180, 300, { color: '#E6D3AE' }),
        sprite('portrait', 'portrait_default', 180, 300, { color: '#FFFFFF', opacity: 215 }),
    ]);
}

/** 星屑粒子（获得武将演出用） */
function getHeroStarPrefab() {
    return node('get_hero_star', { w: 12, h: 12, opacity: 0 }, [
        sprite('dot', 'tex_star', 12, 12, { color: '#FFFFFF' }),
    ]);
}

/** 卡片详情 */
function unitDetailPrefab() {
    return rootSpec('unit_detail', 'UnitDetailViewComp', [
        sprite('dim', 'tex_solid', 1280, 720, { color: '#000000', alpha: 185, blockInput: true }),
        sprite('panel', 'tex_panel', 640, 560, {}, [
            label('name', '', 28, C.gold, 0, 232, { bold: true }),
            label('kind', '', 14, C.textMuted, 0, 198),
            label('stat1', '', 15, C.text, 0, 142),
            label('stat2', '', 15, C.text, 0, 106),
            label('stat3', '', 15, C.text, 0, 70),
            label('stat4', '', 15, C.text, 0, 34),
            label('stat5', '', 15, C.text, 0, -2),
            label('talent_name', '', 17, C.goldSoft, 0, -62, { bold: true }),
            label('talent_desc', '', 13, C.textDim, 0, -152, { wrap: true, width: 560, ay: 1 }),
            button('btn_close', '', 240, 52, 0, -240, { primary: true, size: 19 }),
        ]),
    ]);
}

/** 玩法说明 */
function helpPrefab() {
    return rootSpec('help', 'HelpViewComp', [
        sprite('dim', 'tex_solid', 1280, 720, { color: '#000000', alpha: 180, blockInput: true }),
        sprite('panel', 'tex_panel', 980, 600, {}, [
            label('title', '', 32, C.gold, 0, 250, { bold: true }),
            label('goal', '', 15, C.text, -440, 180, { align: 'left', ax: 0, ay: 1, wrap: true, width: 880 }),
            label('controls', '', 15, C.text, -440, 60, { align: 'left', ax: 0, ay: 1, wrap: true, width: 880 }),
            label('terms', '', 15, C.textDim, -440, -70, { align: 'left', ax: 0, ay: 1, wrap: true, width: 880 }),
            button('btn_close', '', 260, 54, 0, -252, { primary: true, size: 20 }),
        ]),
    ]);
}

/** 军师计略 */
function stratPrefab() {
    const opt = (name, y, title, desc, cost) => sprite(`opt_${name}`, 'tex_panel_raise', 560, 84, { y }, [
        label('name', title, 18, C.gold, -250, 18, { bold: true, align: 'left', ax: 0 }),
        label('desc', desc, 13, C.textDim, -250, -16, { align: 'left', ax: 0, wrap: true, width: 380 }),
        label('state', cost, 15, C.goldSoft, 250, 0, { bold: true, align: 'right', ax: 1 }),
    ]);

    return rootSpec('strat', 'StratViewComp', [
        sprite('dim', 'tex_solid', 1280, 720, { color: '#000000', alpha: 180, blockInput: true }),
        sprite('panel', 'tex_panel', 640, 520, {}, [
            label('title', '', 30, C.gold, 0, 210, { bold: true }),
            label('food', '', 14, C.textMuted, 0, 176),
            opt('fire', 96, '火计', '全场敌军立即受到 300 点伤害', '粮 150'),
            opt('gate', 6, '坚守', '城门耐久恢复 2 点', '粮 200'),
            opt('slow', -84, '缓兵', '全场敌军减速 50%，持续 6 秒', '粮 100'),
            label('hint', '', 12, C.textMuted, 0, -150),
            button('btn_close', '', 240, 52, 0, -208, { primary: true, size: 19 }),
        ]),
    ]);
}

/** 装备词条详情 */
function equipDetailPrefab() {
    return rootSpec('equip_detail', 'EquipDetailViewComp', [
        sprite('dim', 'tex_solid', 1280, 720, { color: '#000000', alpha: 185, blockInput: true }),
        sprite('panel', 'tex_panel', 600, 560, {}, [
            label('name', '', 26, C.gold, 0, 222, { bold: true }),
            label('meta', '', 14, C.textMuted, 0, 188),
            label('line1', '', 15, C.text, 0, 140),
            label('line2', '', 15, C.text, 0, 106),
            label('line3', '', 15, C.text, 0, 72),
            label('line4', '', 15, C.text, 0, 38),
            label('desc', '', 13, C.textDim, 0, -46, { wrap: true, width: 520, ay: 1 }),
            label('status', '', 13, C.goldSoft, 0, -132),
            button('btn_action', '', 220, 52, 0, -186, { primary: true, size: 18 }),
            button('btn_close', '', 220, 46, 0, -246, { size: 17 }),
        ]),
    ]);
}

/** 选将（出战阵容）界面 */
function draftPrefab() {
    return rootSpec('draft', 'DraftViewComp', [
        sprite('bg', 'tex_bg', 1280, 720, { color: '#FFFFFF' }),
        sprite('line_top', 'tex_solid', 1280, 2, { y: 336, color: C.gold, alpha: 60 }),
        button('btn_back', '', 108, 46, -560, 296, { size: 18 }),
        label('title', '', 34, C.gold, -460, 296, { bold: true, align: 'left', ax: 0 }),
        label('level_name', '', 20, C.goldSoft, 0, 232),
        label('tip', '', 13, C.textMuted, 0, 196),
        node('grid', { x: 0, y: 20, w: 1020, h: 300 }, [
            // 示例条目（编辑器预览用，运行时 buildGrid 会先清空再填充）
            draftItemSpec('sample_1', { tag: '张', name: '张三', cost: '100', chip: '#A0524A' }),
            draftItemSpec('sample_2', { tag: '李', name: '李四', cost: '150', chip: '#5B8F5B' }),
            draftItemSpec('sample_3', { tag: '王', name: '王五', cost: '200', chip: '#4E6E9E' }),
        ]),
        label('count', '', 16, C.goldSoft, 0, -198, { bold: true }),
        button('btn_all', '', 170, 46, -300, -262, { size: 16 }),
        button('btn_clear', '', 170, 46, -110, -262, { size: 16 }),
        button('btn_start', '', 240, 56, 200, -262, { primary: true, size: 20 }),
    ]);
}

/** 选将卡片（sample：编辑器示例数据，运行时覆盖） */
function draftItemSpec(nodeName = 'draft_item', sample = {}) {
    return node(nodeName, { w: 150, h: 112 }, [
        sprite('bg', 'tex_panel_raise', 150, 112, { color: sample.bg ?? '#FFFFFF' }),
        sprite('frame', 'tex_frame_gold', 150, 112, { active: false }),
        sprite('chip', 'tex_chip', 40, 66, { x: -50, y: 22, color: sample.chip ?? '#2A241C' }),
        sprite('portrait', 'portrait_default', 36, 60, { x: -50, y: 24, color: '#FFFFFF' }),
        label('tag', sample.tag ?? '', 18, C.textMuted, -50, -34, { bold: true }),
        label('name', sample.name ?? '', 16, C.text, 24, 30, { bold: true }),
        label('cost', sample.cost ?? '', 14, C.goldSoft, 24, 6),
        label('check', '✓', 22, '#6AD06A', 56, -34, { active: false }),
    ]);
}

function draftItemPrefab() {
    return draftItemSpec();
}

/** 装备界面 */
function equipPrefab() {
    const slot = (name, y) => sprite(name, 'tex_panel_raise', 480, 46, { y }, [
        label('name', '', 15, C.text, -220, 0, { align: 'left', ax: 0 }),
        label('value', '未装备', 13, C.goldSoft, 220, 0, { align: 'right', ax: 1 }),
    ]);

    return rootSpec('equip', 'EquipViewComp', [
        sprite('bg', 'tex_bg', 1280, 720, { color: '#FFFFFF' }),
        sprite('line_top', 'tex_solid', 1280, 2, { y: 336, color: C.gold, alpha: 60 }),
        button('btn_back', '', 108, 46, -560, 296, { size: 18 }),
        label('title', '', 34, C.gold, -460, 296, { bold: true, align: 'left', ax: 0 }),
        label('bag_count', '', 14, C.textMuted, 580, 296, { align: 'right', ax: 1 }),
        node('unit_list', { x: -400, y: -20, w: 380, h: 520 }, [
            // 示例行（运行时 buildUnits 会先清空再填充）
            equipRowSpec('sample_u1', { name: '张三', mark: '已穿 2' }),
            equipRowSpec('sample_u2', { name: '李四', mark: '' }),
            equipRowSpec('sample_u3', { name: '王五', mark: '已穿 1' }),
        ]),
        sprite('panel', 'tex_panel', 520, 420, { x: 330, y: 60 }, [
            label('unit_name', '', 24, C.gold, 0, 170, { bold: true }),
            label('unit_kind', '', 13, C.textMuted, 0, 140),
            slot('slot_weapon', 92),
            slot('slot_armor', 42),
            slot('slot_horse', -8),
            slot('slot_treasure', -58),
            label('stats', '', 13, C.textDim, 0, -112, { wrap: true, width: 470 }),
            label('hint', '', 12, C.textMuted, 0, -172),
        ]),
        node('bag_list', { x: 330, y: -258, w: 540, h: 190 }, [
            // 示例装备（运行时 buildBag 会先清空再填充）
            equipItemSpec('sample_b1', { name: '示例装备·壹', tier: 'T1' }),
            equipItemSpec('sample_b2', { name: '示例装备·贰', tier: 'T2' }),
            equipItemSpec('sample_b3', { name: '示例装备·叁', tier: 'T3' }),
            equipItemSpec('sample_b4', { name: '示例装备·肆', tier: 'T4' }),
            equipItemSpec('sample_b5', { name: '示例装备·伍', tier: 'T5' }),
        ]),
    ]);
}

/** 装备界面的武将行 */
function equipRowSpec(nodeName = 'equip_row', sample = {}) {
    return node(nodeName, { w: 180, h: 40 }, [
        sprite('bg', 'tex_panel', 180, 40, { color: sample.bg ?? '#FFFFFF' }),
        label('name', sample.name ?? '', 14, C.text, -84, 0, { align: 'left', ax: 0 }),
        label('mark', sample.mark ?? '', 11, C.goldSoft, 84, 0, { align: 'right', ax: 1 }),
    ]);
}

function equipRowPrefab() {
    return equipRowSpec();
}

/** 装备界面的装备条目 */
function equipItemSpec(nodeName = 'equip_item', sample = {}) {
    return node(nodeName, { w: 100, h: 42 }, [
        sprite('bg', 'tex_panel', 100, 42, { color: '#FFFFFF' }),
        label('name', sample.name ?? '', 11, C.text, -44, 0, { align: 'left', ax: 0 }),
        label('tier', sample.tier ?? '', 10, C.gold, 44, 0, { align: 'right', ax: 1 }),
    ]);
}

function equipItemPrefab() {
    return equipItemSpec({ name: '示例装备', tier: 'T4' });
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
        node('grid', { x: -515, y: 184, w: 810, h: 420 }, [
            // 示例关卡卡（运行时 buildGrid 会先清空再填充）
            levelCardSpec('sample_l1', { index: '01', name: '第 1 关' }),
            levelCardSpec('sample_l2', { index: '02', name: '第 2 关' }),
            levelCardSpec('sample_l3', { index: '03', name: '第 3 关' }),
            levelCardSpec('sample_l4', { index: '04', name: '第 4 关' }),
        ]),
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
        node('list', { x: -240, y: 20, w: 760, h: 420 }, [
            // 示例条目（运行时 refreshList 会先清空再填充）
            codexItemSpec('sample_c1', { tag: '张', name: '张三', kind: '武将', chip: '#A0524A' }),
            codexItemSpec('sample_c2', { tag: '李', name: '李四', kind: '武将', chip: '#5B8F5B' }),
            codexItemSpec('sample_c3', { tag: '王', name: '王五', kind: '武将', chip: '#4E6E9E' }),
        ]),
        sprite('detail', 'tex_panel', 340, 440, { x: 430, y: 20 }, [
            sprite('head_chip', 'tex_chip', 76, 124, { y: 150, color: C.bgRaise }),
            sprite('head_portrait', 'portrait_default', 72, 120, { y: 150, color: '#FFFFFF' }),
            label('head_tag', '', 30, C.goldSoft, 0, 88, { bold: true }),
            label('head_name', '', 26, C.goldSoft, 0, 78, { bold: true }),
            label('head_kind', '', 14, C.textMuted, 0, 52),
            node('rows', { y: 20, w: 300, h: 180 }, [
                // 示例属性行（运行时先清空再填充）
                detailRowSpec('sample_r1', { key: '生命', value: '1200' }),
                detailRowSpec('sample_r2', { key: '攻击', value: '300' }),
                detailRowSpec('sample_r3', { key: '天赋', value: '奋短兵' }),
            ]),
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

    // 参考稿布局：左侧栏（粮草/斩获 → 竖排卡槽 → 操作按钮）+ 右侧（细顶栏 + 战场）
    const railBtn = (name, x, y) => sprite(name, 'tex_btn_gold', 64, 42, { x, y }, [
        label('label', RAIL_DEFAULTS[name] ?? '按钮', 13, '#3A2408', 0, 0, { bold: true }),
    ]);

    return rootSpec('battle', 'BattleViewComp', [
        sprite('bg', 'tex_bg_red', 1280, 720, { color: '#FFFFFF' }),

        //#region 左侧栏
        sprite('rail_bg', 'tex_panel_rail', 214, 704, { x: -530, y: 0, alpha: 235 }),
        sprite('stats_panel', 'tex_panel_rail', 198, 60, { x: -530, y: 302 }, [
            label('logo', '三國志', 13, C.gold, -92, 0, { bold: true, align: 'left', ax: 0 }),
            label('food_icon', '粮', 15, C.goldSoft, -22, 0),
            label('food_value', '0', 16, '#F4D98A', 2, 0, { bold: true, align: 'left', ax: 0 }),
            label('kills_icon', '⚔', 14, C.textMuted, 52, 0),
            label('kills_value', '0', 15, '#F4D98A', 68, 0, { bold: true, align: 'left', ax: 0 }),
        ]),
        label('bond_tag', '', 11, '#8FB8FF', -530, 268, { bold: true, active: false }),
        node('cards', { x: -530, y: 20, w: 200, h: 430 }, [
            // 示例卡槽（运行时 buildCards 会先清空再填充）
            cardSpec('sample_card_1', { tag: '张', name: '张三', cost: '100', chip: '#A0524A' }),
            cardSpec('sample_card_2', { tag: '李', name: '李四', cost: '150', chip: '#5B8F5B' }),
        ]),
        railBtn('btn_retreat', -596, -286),
        railBtn('btn_cancel', -530, -286),
        railBtn('btn_pause', -464, -286),
        railBtn('btn_speed', -596, -334),
        railBtn('btn_mute', -530, -334),
        railBtn('btn_help', -464, -334),
        //#endregion

        //#region 顶栏：关卡 / 波次 / 余敌 / 波次进度 / 城门
        sprite('topbar', 'tex_panel_rail', 1040, 50, { x: 110, y: 320 }, [
            label('level_name', '', 14, '#F4D98A', -498, 0, { bold: true, align: 'left', ax: 0 }),
            label('wave_text', '', 13, C.textDim, -336, 0, { align: 'left', ax: 0 }),
            label('remain_text', '', 12, '#F0C060', -216, 0, { align: 'left', ax: 0 }),
            sprite('wave_bar_bg', 'tex_solid', 210, 12, { x: -40, y: 0, color: '#20100A' }),
            sprite('wave_fill', 'tex_solid', 210, 12, { x: -145, y: 0, ax: 0, color: '#6AD06A' }),
            label('gate_label', '城门', 12, C.textDim, 112, 0),
            sprite('gate_bar_bg', 'tex_solid', 120, 12, { x: 196, y: 0, color: '#20100A' }),
            sprite('gate_fill', 'tex_solid', 120, 12, { x: 136, y: 0, ax: 0, color: '#E8B84A' }),
            label('gate_value', '', 13, '#F4D98A', 288, 0, { bold: true }),
            node('wave_flags', { x: -40, y: 0, w: 210, h: 18 }),
            label('next_wave', '', 10, '#9FD0A0', -40, -16, { align: 'left', ax: 0 }),
            button('btn_strat', '', 108, 36, 420, 0, { size: 14 }),
        ]),
        //#endregion

        //#region 战场
        node('board', { x: 110, y: 20, w: BOARD_W, h: BOARD_H }, [
            sprite('wall', 'tex_solid', 104, BOARD_H, { x: -BOARD_W / 2 - 54, color: '#5A3A28' }),
            // 城墙破损分档（只切换预制体节点的显隐，不在运行时绘制）
            sprite('wall_crack_1', 'tex_solid', 58, 70, { x: -BOARD_W / 2 - 48, y: 120, color: '#120C08', alpha: 210, active: false }),
            sprite('wall_crack_2', 'tex_solid', 70, 96, { x: -BOARD_W / 2 - 60, y: -20, color: '#120C08', alpha: 210, active: false }),
            sprite('wall_crack_3', 'tex_solid', 84, 130, { x: -BOARD_W / 2 - 44, y: -140, color: '#120C08', alpha: 220, active: false }),
            sprite('wall_fire', 'tex_solid', 96, BOARD_H, { x: -BOARD_W / 2 - 54, color: '#B33A22', alpha: 90, active: false }),
            sprite('wall_line', 'tex_solid', 3, BOARD_H, { x: -BOARD_W / 2 - 3, color: C.gold, alpha: 110 }),
            node('field', { w: BOARD_W, h: BOARD_H }, cells),
            node('mowers', { w: BOARD_W, h: BOARD_H }, mowers),
            node('actors', { w: BOARD_W, h: BOARD_H }),
            node('input', { w: BOARD_W, h: BOARD_H }),
        ]),
        label('hint', '', 13, '#E8CF95', 110, -250),
        // 浓雾关：右侧两列视觉遮蔽
        sprite('fog', 'tex_solid', 192, BOARD_H, { x: 446, y: 20, color: '#0B0907', alpha: 210, active: false }),
        //#endregion

        // 大波横幅
        sprite('banner', 'tex_btn_gold', 460, 64, { x: 110, y: 150, active: false }, [
            label('text', '', 30, '#3A2408', 0, 0, { bold: true }),
        ]),
        // 新手引导：战场顶部提示带（参考稿 guideHint 位置）
        sprite('guide', 'tex_panel_rail', 780, 62, { x: 110, y: 252, active: false }, [
            label('text', '', 14, '#FFE9B0', -370, 0, { align: 'left', ax: 0, wrap: true, width: 720 }),
        ]),
        // 调试面板
        node('debug', { x: 460, y: 120, w: 300, h: 230, active: false }, [
            sprite('bg', 'tex_panel_rail', 300, 230, { color: '#FFFFFF' }),
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
            label('drop', '', 15, '#8FB8FF', 0, -36, { bold: true }),
            button('btn_retry', '', 200, 52, -108, -96, { size: 19 }),
            button('btn_next', '', 200, 52, 108, -96, { primary: true, size: 19 }),
            button('btn_home', '', 300, 50, 0, -170, { size: 18 }),
        ]),
    ]);
}
//#endregion

//#region 列表项预制体
function levelCardSpec(nodeName = 'level_card', sample = {}) {
    return node(nodeName, { w: 150, h: 112 }, [
        sprite('bg', 'tex_panel', 150, 112, { color: sample.bg ?? '#FFFFFF' }),
        sprite('frame', 'tex_frame_gold', 150, 112, { active: false }),
        label('index', sample.index ?? '', 30, C.gold, -58, 24, { bold: true, align: 'left', ax: 0 }),
        label('name', sample.name ?? '', 16, C.text, -58, -14, { align: 'left', ax: 0 }),
        label('lock', '', 14, C.textMuted, 60, 24, { align: 'right', ax: 1, active: false }),
        label('star1', '☆', 16, C.textMuted, -40, -42),
        label('star2', '☆', 16, C.textMuted, -16, -42),
        label('star3', '☆', 16, C.textMuted, 8, -42),
    ]);
}

function levelCardPrefab() {
    return levelCardSpec();
}

function codexItemSpec(nodeName = 'codex_item', sample = {}) {
    // 23 名武将需要 4 列 × 6 行展示，条目相应收窄
    return node(nodeName, { w: 180, h: 56 }, [
        sprite('bg', 'tex_panel', 180, 56, { color: '#FFFFFF' }),
        sprite('frame', 'tex_frame_gold', 180, 56, { active: false }),
        sprite('chip', 'tex_chip', 28, 46, { x: -72, color: sample.chip ?? '#2A241C' }),
        sprite('portrait', 'portrait_default', 24, 40, { x: -72, color: '#FFFFFF' }),
        label('tag', sample.tag ?? '', 14, C.textMuted, -72, -25, { bold: true }),
        label('name', sample.name ?? '', 14, C.text, -44, 8, { align: 'left', ax: 0 }),
        label('kind', sample.kind ?? '', 11, C.textMuted, -44, -10, { align: 'left', ax: 0 }),
    ]);
}

function codexItemPrefab() {
    return codexItemSpec();
}

/** 通用兵种小标（敌军预览、我方缩略） */
function chipPrefab() {
    return node('chip', { w: 56, h: 56 }, [
        sprite('bg', 'tex_chip', 56, 56, { color: '#2A241C' }),
        label('tag', '', 22, C.bgDeep, 0, 0, { bold: true }),
    ]);
}

function detailRowSpec(nodeName = 'detail_row', sample = {}) {
    return node(nodeName, { w: 280, h: 28 }, [
        label('key', sample.key ?? '', 16, C.textDim, -140, 0, { align: 'left', ax: 0 }),
        label('value', sample.value ?? '', 16, C.text, 140, 0, { align: 'right', ax: 1 }),
    ]);
}

function detailRowPrefab() {
    return detailRowSpec();
}

/** 左栏竖排卡槽卡：横向「种子包」样式（画像 + 名号 + 费用 + 冷却遮罩） */
function cardSpec(nodeName = 'card', sample = {}) {
    return node(nodeName, { w: 96, h: 68 }, [
        sprite('bg', 'tex_panel', 96, 68, { color: '#FFFFFF' }),
        sprite('frame', 'tex_frame_gold', 96, 68, { active: false }),
        // 先垫阵营色块，再叠近黑剪影
        sprite('chip', 'tex_chip', 34, 56, { x: -27, y: 10, color: sample.chip ?? '#E0B64A' }),
        sprite('portrait', 'portrait_default', 30, 50, { x: -27, y: 10, color: '#FFFFFF' }),
        label('tag', sample.tag ?? '', 15, '#F4D98A', -27, -17, { bold: true }),
        label('name', sample.name ?? '', 12, C.text, 10, 12),
        label('cost', sample.cost ?? '', 12, C.goldSoft, 10, -12, { bold: true }),
        sprite('mask', 'tex_solid', 96, 68, { color: '#000000', alpha: 170, ay: 1, y: 34 }),
        label('mask_text', '', 12, C.textDim, 0, 0, { active: false }),
    ]);
}

function cardPrefab() {
    return cardSpec();
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

/** 波次旗标 */
function waveFlagPrefab() {
    return node('wave_flag', { w: 6, h: 22 }, [
        sprite('bar', 'tex_solid', 2, 18, { color: '#CAA84A' }),
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
    { path: 'gui/battle/get_hero.prefab', builder: () => new PrefabBuilder('get_hero').build(getHeroPrefab()) },
    { path: 'gui/battle/get_hero_star.prefab', builder: () => new PrefabBuilder('get_hero_star').build(getHeroStarPrefab()) },
    { path: 'gui/battle/hero_portrait.prefab', builder: () => new PrefabBuilder('hero_portrait').build(heroPortraitPrefab()) },
    { path: 'gui/battle/story.prefab', builder: () => new PrefabBuilder('story').build(storyPrefab()) },
    { path: 'gui/battle/unit_detail.prefab', builder: () => new PrefabBuilder('unit_detail').build(unitDetailPrefab()) },
    { path: 'gui/main/help.prefab', builder: () => new PrefabBuilder('help').build(helpPrefab()) },
    { path: 'gui/battle/strat.prefab', builder: () => new PrefabBuilder('strat').build(stratPrefab()) },
    { path: 'gui/main/draft.prefab', builder: () => new PrefabBuilder('draft').build(draftPrefab()) },
    { path: 'gui/main/draft_item.prefab', builder: () => new PrefabBuilder('draft_item').build(draftItemPrefab()) },
    { path: 'gui/main/equip.prefab', builder: () => new PrefabBuilder('equip').build(equipPrefab()) },
    { path: 'gui/main/equip_detail.prefab', builder: () => new PrefabBuilder('equip_detail').build(equipDetailPrefab()) },
    { path: 'gui/main/equip_row.prefab', builder: () => new PrefabBuilder('equip_row').build(equipRowPrefab()) },
    { path: 'gui/main/equip_item.prefab', builder: () => new PrefabBuilder('equip_item').build(equipItemPrefab()) },
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
    { path: 'gui/battle/wave_flag.prefab', builder: () => new PrefabBuilder('wave_flag').build(waveFlagPrefab()) },
    { path: 'gui/battle/mower.prefab', builder: () => new PrefabBuilder('mower').build(mowerPrefab()) },
];

generateTextures();
writeScriptMetas();
for (const item of PREFABS) {
    writeFile(join(BUNDLE, item.path), item.builder());
}
console.log(`已生成 ${TEXTURES.length} 张占位贴图、${PREFABS.length} 个预制体、${Object.keys(SCRIPTS).length} 个脚本 meta`);
