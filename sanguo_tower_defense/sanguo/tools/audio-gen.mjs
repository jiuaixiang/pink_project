/**
 * 占位音效生成器
 *
 * 生成 16bit 单声道 WAV 占位音频（无需外部素材即可听到声音），
 * 后续替换为正式音效时，保持同名文件即可零改代码。
 *
 * 用法：node tools/audio-gen.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'bundle', 'audios');
const RATE = 22050;

/** 生成 WAV 文件 */
function writeWav(name, samples) {
    const data = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i++) {
        const v = Math.max(-1, Math.min(1, samples[i]));
        data.writeInt16LE(Math.round(v * 32000), i * 2);
    }

    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(RATE, 24);
    header.writeUInt32LE(RATE * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(data.length, 40);

    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, `${name}.wav`), Buffer.concat([header, data]));
    console.log(`生成 ${name}.wav  ${(header.length + data.length) / 1024 | 0} KB`);
}

/** 简易包络 */
function env(t, attack, decay, sustain, release, dur) {
    if (t < attack) return t / attack;
    if (t < attack + decay) return 1 - (1 - sustain) * ((t - attack) / decay);
    if (t < dur - release) return sustain;
    if (t < dur) return sustain * (1 - (t - (dur - release)) / release);
    return 0;
}

/** 叠加一个音符 */
function addNote(buf, start, dur, freq, amp, shape = 'sine', attack = 0.01, release = 0.12) {
    const from = Math.floor(start * RATE);
    const count = Math.floor(dur * RATE);
    for (let i = 0; i < count; i++) {
        const idx = from + i;
        if (idx < 0 || idx >= buf.length) break;
        const t = i / RATE;
        const e = env(t, attack, 0.06, 0.7, release, dur) * amp;
        const phase = 2 * Math.PI * freq * t;
        let v;
        if (shape === 'tri') v = (2 / Math.PI) * Math.asin(Math.sin(phase));
        else if (shape === 'square') v = Math.sin(phase) >= 0 ? 0.6 : -0.6;
        else if (shape === 'noise') v = (Math.random() * 2 - 1) * 0.6;
        else v = Math.sin(phase);
        buf[idx] += v * e;
    }
}

/** 低音鼓 */
function addDrum(buf, start, amp = 0.5) {
    const count = Math.floor(0.22 * RATE);
    const from = Math.floor(start * RATE);
    for (let i = 0; i < count; i++) {
        const idx = from + i;
        if (idx >= buf.length) break;
        const t = i / RATE;
        const f = 90 * Math.exp(-t * 18) + 45;
        const e = Math.exp(-t * 16);
        buf[idx] += Math.sin(2 * Math.PI * f * t) * e * amp;
    }
}

/** 菜单 BGM：五声音阶缓拨 */
function menuBgm() {
    const dur = 8;
    const buf = new Float32Array(dur * RATE);
    const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
    const pattern = [0, 2, 4, 3, 1, 3, 5, 4];
    for (let bar = 0; bar < 2; bar++) {
        for (let i = 0; i < pattern.length; i++) {
            const start = bar * 4 + i * 0.5;
            addNote(buf, start, 0.75, scale[pattern[i]], 0.16, 'sine', 0.02, 0.3);
            addNote(buf, start, 0.9, scale[pattern[i]] / 2, 0.07, 'tri', 0.02, 0.4);
        }
    }
    return buf;
}

/** 战斗 BGM：鼓点 + 低音 + 快速音型 */
function battleBgm() {
    const dur = 8;
    const buf = new Float32Array(dur * RATE);
    const scale = [220.0, 261.63, 293.66, 329.63, 392.0];
    for (let i = 0; i < 16; i++) {
        addDrum(buf, i * 0.5, 0.35);
        if (i % 2 === 0) addDrum(buf, i * 0.5 + 0.25, 0.18);
    }
    for (let i = 0; i < 32; i++) {
        const start = i * 0.25;
        const note = scale[(i * 3) % scale.length];
        addNote(buf, start, 0.22, note, 0.1, 'square', 0.005, 0.12);
    }
    for (let i = 0; i < 8; i++) {
        addNote(buf, i * 1, 1.1, 110, 0.12, 'tri', 0.02, 0.4);
    }
    return buf;
}

const sounds = {
    sfx_click: () => {
        const b = new Float32Array(Math.floor(0.06 * RATE));
        addNote(b, 0, 0.05, 1200, 0.5, 'sine', 0.001, 0.03);
        return b;
    },
    sfx_plant: () => {
        const b = new Float32Array(Math.floor(0.2 * RATE));
        addNote(b, 0, 0.16, 330, 0.5, 'tri', 0.002, 0.1);
        addNote(b, 0.03, 0.14, 440, 0.3, 'sine', 0.002, 0.08);
        return b;
    },
    sfx_collect: () => {
        const b = new Float32Array(Math.floor(0.16 * RATE));
        addNote(b, 0, 0.07, 880, 0.45, 'sine', 0.001, 0.05);
        addNote(b, 0.06, 0.09, 1320, 0.4, 'sine', 0.001, 0.06);
        return b;
    },
    sfx_shoot: () => {
        const b = new Float32Array(Math.floor(0.09 * RATE));
        addNote(b, 0, 0.07, 0, 0.35, 'noise', 0.001, 0.05);
        addNote(b, 0, 0.05, 900, 0.2, 'square', 0.001, 0.04);
        return b;
    },
    sfx_hit: () => {
        const b = new Float32Array(Math.floor(0.1 * RATE));
        addNote(b, 0, 0.09, 160, 0.55, 'sine', 0.001, 0.07);
        addNote(b, 0, 0.04, 0, 0.2, 'noise', 0.001, 0.03);
        return b;
    },
    sfx_die: () => {
        const b = new Float32Array(Math.floor(0.3 * RATE));
        for (let i = 0; i < 4; i++) {
            addNote(b, i * 0.06, 0.1, 440 - i * 70, 0.35 - i * 0.06, 'tri', 0.002, 0.06);
        }
        return b;
    },
    sfx_wave: () => {
        const b = new Float32Array(Math.floor(0.7 * RATE));
        addNote(b, 0, 0.65, 196, 0.35, 'square', 0.03, 0.3);
        addNote(b, 0.12, 0.5, 294, 0.28, 'square', 0.03, 0.25);
        addNote(b, 0.24, 0.4, 392, 0.22, 'square', 0.03, 0.2);
        return b;
    },
    sfx_win: () => {
        const b = new Float32Array(Math.floor(0.9 * RATE));
        const notes = [392, 494, 587, 784];
        notes.forEach((f, i) => addNote(b, i * 0.14, 0.4, f, 0.32, 'sine', 0.01, 0.3));
        return b;
    },
    sfx_lose: () => {
        const b = new Float32Array(Math.floor(0.9 * RATE));
        const notes = [392, 330, 262, 196];
        notes.forEach((f, i) => addNote(b, i * 0.16, 0.45, f, 0.32, 'tri', 0.01, 0.3));
        return b;
    },
};

/** 归一化，避免叠加削波 */
function normalize(buf, peak = 0.85) {
    let max = 0;
    for (const v of buf) max = Math.max(max, Math.abs(v));
    if (max <= peak || max === 0) return buf;
    const k = peak / max;
    for (let i = 0; i < buf.length; i++) buf[i] *= k;
    return buf;
}

writeWav('menu_bgm', normalize(menuBgm()));
writeWav('battle_bgm', normalize(battleBgm()));
for (const [name, build] of Object.entries(sounds)) {
    writeWav(name, normalize(build()));
}

console.log('占位音频已生成到 assets/bundle/audios');
