/**
 * 离线合成预制体（仅用于排查渲染问题）
 *
 * 按 prefab 的节点顺序、位置、缩放、Sprite 颜色（乘算）、UIOpacity 合成一张 PNG，
 * 与 Cocos 的 UI 渲染顺序一致，用于确认「卡面为什么是黑的」。
 *
 * 用法：node tools/render-prefab.mjs gui/battle/get_hero card 460 620
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = join(ROOT, 'assets', 'bundle');

const rel = process.argv[2] ?? 'gui/battle/get_hero';
const targetName = process.argv[3] ?? 'card';
const outW = Number(process.argv[4] ?? 460);
const outH = Number(process.argv[5] ?? 620);

function readPng(file) {
    const buf = readFileSync(file);
    let off = 8, w = 0, h = 0, ct = 6;
    const idat = [];
    while (off < buf.length) {
        const len = buf.readUInt32BE(off);
        const type = buf.toString('ascii', off + 4, off + 8);
        const data = buf.slice(off + 8, off + 8 + len);
        if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
        else if (type === 'IDAT') idat.push(data);
        else if (type === 'IEND') break;
        off += 12 + len;
    }
    const ch = ct === 6 ? 4 : ct === 2 ? 3 : 1;
    const raw = inflateSync(Buffer.concat(idat));
    const stride = w * ch;
    const out = Buffer.alloc(w * h * 4);
    const prev = Buffer.alloc(stride);
    const line = Buffer.alloc(stride);
    const paeth = (a, b, c) => {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        return pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
    };
    for (let y = 0; y < h; y++) {
        const f = raw[y * (stride + 1)];
        const src = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let i = 0; i < stride; i++) {
            const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
            let v = src[i];
            if (f === 1) v = (v + a) & 255; else if (f === 2) v = (v + b) & 255;
            else if (f === 3) v = (v + ((a + b) >> 1)) & 255; else if (f === 4) v = (v + paeth(a, b, c)) & 255;
            line[i] = v;
        }
        for (let x = 0; x < w; x++) {
            const si = x * ch, di = (y * w + x) * 4;
            out[di] = line[si]; out[di + 1] = line[si + 1]; out[di + 2] = line[si + 2];
            out[di + 3] = ch === 4 ? line[si + 3] : 255;
        }
        line.copy(prev);
    }
    return { w, h, data: out };
}

function writePng(file, w, h, rgba) {
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (w * 4 + 1)] = 0;
        rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
    }
    const chunks = [];
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crcTable = [];
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            crcTable[n] = c >>> 0;
        }
        let crc = 0xffffffff;
        for (const b of body) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
        const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
        return Buffer.concat([len, body, crcBuf]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    chunks.push(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    chunks.push(chunk('IHDR', ihdr));
    chunks.push(chunk('IDAT', deflateSync(raw)));
    chunks.push(chunk('IEND', Buffer.alloc(0)));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.concat(chunks));
}

// 纹理索引：spriteFrame uuid -> 源 PNG
const texDir = join(BUNDLE, 'game', 'texture');
const sfToPng = new Map();
for (const file of readdirSync(texDir)) {
    if (!file.endsWith('.png.meta')) continue;
    const meta = JSON.parse(readFileSync(join(texDir, file), 'utf8'));
    sfToPng.set(`${meta.uuid}@f9941`, join(texDir, file.replace('.meta', '')));
}

const prefab = JSON.parse(readFileSync(join(BUNDLE, `${rel}.prefab`), 'utf8'));
const byId = prefab;
const rootIndex = 0;

function nodeOf(index) {
    return byId[index];
}

function comps(node, type) {
    return (node._components ?? []).map((c) => byId[c.__id__]).filter((c) => c != null && c.__type__ === type);
}

const target = prefab.find((o) => o.__type__ === 'cc.Node' && o._name === targetName);
if (target == null) {
    console.log('找不到节点', targetName);
    process.exit(1);
}

// 运行时会把卡面 UIOpacity 置 255，这里同步，否则整卡透明
for (const op of comps(target, 'cc.UIOpacity')) op._opacity = 255;

const out = Buffer.alloc(outW * outH * 4);
const scale = Math.min(outW / 260, outH / 340);

function drawNode(index, parentAlpha, parentPos) {
    const node = byId[index];
    if (node == null || node._active === false) return;

    const pos = node._lpos ?? { x: 0, y: 0 };
    const nodeX = parentPos.x + (pos.x ?? 0) * 1;
    const nodeY = parentPos.y + (pos.y ?? 0) * 1;

    const op = comps(node, 'cc.UIOpacity')[0];
    const alpha = parentAlpha * ((op?._opacity ?? 255) / 255);

    for (const sprite of comps(node, 'cc.Sprite')) {
        const sfUuid = sprite._spriteFrame?.__uuid__;
        const png = sfUuid != null ? sfToPng.get(sfUuid) : null;
        const color = sprite._color ?? { r: 255, g: 255, b: 255, a: 255 };
        const tr = comps(node, 'cc.UITransform')[0];
        const w = tr?._contentSize?.width ?? 0;
        const h = tr?._contentSize?.height ?? 0;

        const cx = outW / 2 + nodeX * scale;
        const cy = outH / 2 - nodeY * scale;
        const pw = w * scale;
        const ph = h * scale;

        const tex = png != null && existsSync(png) ? readPng(png) : null;
        const x0 = Math.round(cx - pw / 2), x1 = Math.round(cx + pw / 2);
        const y0 = Math.round(cy - ph / 2), y1 = Math.round(cy + ph / 2);

        if (process.env.LAYERS === '1') {
            const sx = Math.floor((x0 + x1) / 2);
            const sy = Math.floor((y0 + y1) / 2);
            let texel = '无贴图';
            if (tex != null) {
                const u = (sx - x0) / Math.max(1, x1 - x0);
                const v = (sy - y0) / Math.max(1, y1 - y0);
                const tx = Math.min(tex.w - 1, Math.max(0, Math.floor(u * tex.w)));
                const ty = Math.min(tex.h - 1, Math.max(0, Math.floor(v * tex.h)));
                const ti = (ty * tex.w + tx) * 4;
                texel = `${tex.data[ti]},${tex.data[ti + 1]},${tex.data[ti + 2]},${tex.data[ti + 3]}`;
            }
            console.log(
                node._name.padEnd(12),
                'tint', `${color.r},${color.g},${color.b},${color.a}`,
                'opacity', op?._opacity ?? 255,
                'size', `${Math.round(pw)}x${Math.round(ph)}`,
                'pos', `${Math.round(cx)},${Math.round(cy)}`,
                'texel', texel,
            );
        }

        for (let y = Math.max(0, y0); y < Math.min(outH, y1); y++) {
            for (let x = Math.max(0, x0); x < Math.min(outW, x1); x++) {
                let sr = color.r, sg = color.g, sb = color.b, sa = (color.a / 255) * alpha;
                if (tex != null) {
                    const u = (x - x0) / Math.max(1, x1 - x0);
                    const v = (y - y0) / Math.max(1, y1 - y0);
                    const tx = Math.min(tex.w - 1, Math.max(0, Math.floor(u * tex.w)));
                    const ty = Math.min(tex.h - 1, Math.max(0, Math.floor(v * tex.h)));
                    const ti = (ty * tex.w + tx) * 4;
                    sr = (color.r * tex.data[ti]) / 255;
                    sg = (color.g * tex.data[ti + 1]) / 255;
                    sb = (color.b * tex.data[ti + 2]) / 255;
                    sa = (color.a / 255) * alpha * (tex.data[ti + 3] / 255);
                }
                const oi = (y * outW + x) * 4;
                const da = out[oi + 3] / 255;
                const na = sa + da * (1 - sa);
                if (na <= 0) continue;
                out[oi] = Math.round((sr * sa + out[oi] * da * (1 - sa)) / na);
                out[oi + 1] = Math.round((sg * sa + out[oi + 1] * da * (1 - sa)) / na);
                out[oi + 2] = Math.round((sb * sa + out[oi + 2] * da * (1 - sa)) / na);
                out[oi + 3] = Math.round(na * 255);
            }
        }
    }

    for (const child of node._children ?? []) drawNode(child.__id__, alpha, { x: nodeX, y: nodeY });
}

drawNode(prefab.indexOf(target), 1, { x: 0, y: 0 });

const file = join(ROOT, 'tools', 'preview', `${targetName}.png`);
writePng(file, outW, outH, out);

const px = (x, y) => {
    const i = (y * outW + x) * 4;
    return [out[i], out[i + 1], out[i + 2], out[i + 3]].join(',');
};
console.log('已输出', file);
console.log('中心像素', px(outW >> 1, outH >> 1));
console.log('上部像素', px(outW >> 1, Math.round(outH * 0.2)));
console.log('左下像素', px(Math.round(outW * 0.15), Math.round(outH * 0.9)));
