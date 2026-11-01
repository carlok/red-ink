/**
 * Build the CC0 one-shots and loops. Peaks are normalised here.
 * Hits land at -6 dBFS. Music stems land at -18 dBFS.
 * Usage: node tools/make-audio.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 16000;
const HIT = 10 ** (-6 / 20);
const MUSIC = 10 ** (-18 / 20);
const ROOM = 10 ** (-32 / 20);
const UI = 10 ** (-12 / 20);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function noise(n, seed) {
  const r = mulberry32(seed);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  return out;
}

function env(n, dur) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    out[i] = t >= dur ? 0 : Math.exp(-t / (dur * 0.28));
  }
  return out;
}

function tone(n, f0, f1, dur) {
  const out = new Float32Array(n);
  const e = env(n, dur);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const f = f0 * Math.pow(f1 / f0, Math.min(1, (i / RATE) / dur));
    phase += 2 * Math.PI * f / RATE;
    out[i] = Math.sin(phase) * e[i];
  }
  return out;
}

function mix(parts) {
  const n = Math.max(...parts.map((p) => p.length));
  const out = new Float32Array(n);
  for (const p of parts) for (let i = 0; i < p.length; i++) out[i] += p[i];
  return out;
}

function normalize(samples, peak) {
  let m = 0;
  for (let i = 0; i < samples.length; i++) m = Math.max(m, Math.abs(samples[i]));
  const g = peak / (m || 1);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * g;
  return out;
}

function seconds(s) { return Math.ceil(RATE * s); }

function loopTone(sec, f, trem) {
  const n = seconds(sec);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    phase += 2 * Math.PI * f / RATE;
    const a = 0.65 + 0.35 * Math.sin(2 * Math.PI * trem * t);
    out[i] = Math.sin(phase) * a;
  }
  return out;
}

const N = {
  jab: seconds(0.2),
  heavy: seconds(0.36),
  block: seconds(0.12),
  whoosh: seconds(0.16),
  ko: seconds(0.7),
  ui: seconds(0.06),
  room: seconds(1.5),
  crowd: seconds(1.5),
  calm: seconds(2),
  tense: seconds(2),
  finish: seconds(2),
};

const clips = {
  jab: normalize(mix([
    tone(N.jab, 160, 55, 0.16),
    noise(N.jab, 3).map((x, i) => x * Math.exp(-i / RATE / 0.02) * (i / RATE < 0.05 ? 1 : 0)),
    tone(N.jab, 90, 70, 0.1).map((x) => x * 0.6),
  ]), HIT),
  jab2: normalize(mix([
    tone(N.jab, 148, 62, 0.15),
    noise(N.jab, 7).map((x, i) => x * Math.exp(-i / RATE / 0.018) * (i / RATE < 0.04 ? 1 : 0)),
    tone(N.jab, 110, 75, 0.09).map((x) => x * 0.55),
  ]), HIT),
  jab3: normalize(mix([
    tone(N.jab, 172, 48, 0.17),
    noise(N.jab, 17).map((x, i) => x * Math.exp(-i / RATE / 0.022) * (i / RATE < 0.06 ? 1 : 0)),
    tone(N.jab, 80, 65, 0.11).map((x) => x * 0.5),
  ]), HIT),
  heavy: normalize(mix([
    tone(N.heavy, 90, 32, 0.3),
    tone(N.heavy, 50, 30, 0.34).map((x) => x * 0.8),
    noise(N.heavy, 9).map((x, i) => x * Math.exp(-i / RATE / 0.04)),
  ]), HIT),
  heavy2: normalize(mix([
    tone(N.heavy, 82, 38, 0.28),
    tone(N.heavy, 44, 26, 0.32).map((x) => x * 0.75),
    noise(N.heavy, 19).map((x, i) => x * Math.exp(-i / RATE / 0.035)),
  ]), HIT),
  block: normalize(mix([
    tone(N.block, 640, 220, 0.08),
    noise(N.block, 11).map((x, i) => x * Math.exp(-i / RATE / 0.012)),
  ]), HIT),
  block2: normalize(mix([
    tone(N.block, 580, 260, 0.07),
    noise(N.block, 23).map((x, i) => x * Math.exp(-i / RATE / 0.014)),
  ]), HIT),
  whoosh: normalize(noise(N.whoosh, 13).map((x, i) => {
    const t = i / RATE;
    return x * Math.sin(Math.PI * Math.min(1, t / 0.16)) * 0.8;
  }), 10 ** (-14 / 20)),
  ko: normalize(mix([
    tone(N.ko, 70, 28, 0.62),
    tone(N.ko, 40, 22, 0.66).map((x) => x * 0.7),
  ]), HIT),
  ui: normalize(tone(N.ui, 880, 440, 0.05), UI),
  room: normalize(noise(N.room, 21).map((x, i) => {
    const t = i / N.room;
    const edge = Math.sin(Math.PI * t);
    return x * edge;
  }), ROOM),
  crowd: normalize(noise(N.crowd, 33).map((x, i) => {
    const t = i / RATE;
    return x * (0.6 + 0.4 * Math.sin(2 * Math.PI * 2 * t));
  }), 10 ** (-24 / 20)),
  calm: normalize(mix([
    loopTone(2, 196, 0.25),
    loopTone(2, 294, 0.2).map((x) => x * 0.45),
  ]), MUSIC),
  calm2: normalize(mix([
    loopTone(2, 207, 0.31),
    loopTone(2, 311, 0.17).map((x) => x * 0.38),
  ]), MUSIC),
  tense: normalize(mix([
    loopTone(2, 155, 2.2),
    loopTone(2, 164, 3.1).map((x) => x * 0.7),
  ]), MUSIC),
  tense2: normalize(mix([
    loopTone(2, 147, 2.6),
    loopTone(2, 174, 2.8).map((x) => x * 0.65),
  ]), MUSIC),
  finish: normalize(mix([
    loopTone(2, 98, 0.5),
    tone(N.finish, 392, 98, 1.6).map((x) => x * 0.4),
  ]), MUSIC),
  hub: normalize(mix([
    loopTone(2, 220, 0.12),
    loopTone(2, 330, 0.08).map((x) => x * 0.35),
  ]), MUSIC),
  dock: normalize(mix([
    loopTone(2, 130, 3.4),
    noise(N.room, 41).map((x, i) => x * (0.15 + 0.1 * Math.sin(i / RATE * 40))),
  ]), MUSIC),
};

function peakOf(samples) {
  let m = 0;
  for (let i = 0; i < samples.length; i++) m = Math.max(m, Math.abs(samples[i]));
  return m;
}

function wav(samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

function db(peak) { return Math.round(20 * Math.log10(peak) * 100) / 100; }

const peaks = {};
const b64 = {};
for (const [name, samples] of Object.entries(clips)) {
  const file = wav(samples);
  let m = 0;
  for (let i = 0; i < samples.length; i++) {
    const q = Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767) / 32767;
    m = Math.max(m, Math.abs(q));
  }
  peaks[name] = db(m || peakOf(samples));
  b64[name] = file.toString("base64");
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "audio"), { recursive: true });
const body = `/* CC0. Generated by tools/make-audio.mjs. Do not edit. Peaks dBFS: ${JSON.stringify(peaks)} */\nwindow.SUBLEVEL_AUDIO=${JSON.stringify({ rate: RATE, clips: b64 })};\n`;
writeFileSync(join(root, "audio", "samples.js"), body);
writeFileSync(join(root, "audio", "CC0.txt"), `The sounds in samples.js were generated for Sublevel Three and are released under CC0 1.0.\nhttps://creativecommons.org/publicdomain/zero/1.0/\n`);
const kb = Math.round(Buffer.byteLength(body) / 1024);
console.log(JSON.stringify({ kb, peaks }, null, 2));
