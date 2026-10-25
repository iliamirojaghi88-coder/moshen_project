import React from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Bedroom, BED, CLOCK_C, CLOCK_N, MiniBed, RoomLook, WINDOW } from "./Bedroom";
import { Hero, HeroProps } from "./Hero";
import { Cam, CameraRig, Env, RoomLights } from "./Stage";
import { Backdrop, Brain, EnergyMeter, FlowLine, GlassCard, Icon3D, SleepBar } from "./Science";
import { Clock } from "./Clock";
import { Captions, DisplayText, Display, Tag, TagLabel, H, W } from "./Type";
import { clamp01, easeIn, easeInOut, easeOut, expoInOut, lerp, pathAt, smooth, span, V3, v3lerp, window01 } from "./util";

// «چرا بعد از ۸ ساعت خواب هنوز خسته‌ای؟» — 8 scenes on one continuous camera
// language. Every value below is a pure function of t (seconds); the phrase
// times come from the narration itself (src/sleep/phrases.json).

export const FPS = 30;
export const DURATION_S = 69.4857;
export const FILM_FRAMES = Math.ceil(DURATION_S * FPS);

const C = { s1: 3.25, s2: 9.2, s3: 19.15, s4: 29.0, s5: 38.6, s6: 48.45, s7: 58.35 };
const GAPS = [0.28, 0.55, 0.8];
const SD: V3 = [-0.2, 0.12, 0];
const SQ: V3 = [0.26, -0.38, -0.25];
const ST: V3 = [-0.18, -0.9, 0];
const BAR = { y: 1.42, z0: -0.4, z1: -2.2, t0: 19.6, t1: 27.0 };
const barZ = (u: number) => lerp(BAR.z0, BAR.z1, u);
const gapT = (g: number) => BAR.t0 + (BAR.t1 - BAR.t0) * g;

/* ---------------- camera helpers ---------------- */

type Key = { t: number; pos: V3; target: V3; fov: number; roll?: number };
const keys = (t: number, ks: Key[], ease = easeInOut): Cam => {
  if (t <= ks[0].t) return ks[0];
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i];
    const b = ks[i + 1];
    if (t <= b.t) {
      const u = ease((t - a.t) / (b.t - a.t));
      return { pos: v3lerp(a.pos, b.pos, u), target: v3lerp(a.target, b.target, u), fov: lerp(a.fov, b.fov, u), roll: lerp(a.roll ?? 0, b.roll ?? 0, u) };
    }
  }
  return ks[ks.length - 1];
};
const glide = (t: number, a: number, b: number, pos: V3[], tgt: V3[], fov: [number, number], ease = easeInOut): Cam => {
  const u = ease((t - a) / (b - a));
  return { pos: pathAt(pos, u), target: pathAt(tgt, u), fov: lerp(fov[0], fov[1], u) };
};
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const shakeAt = (t: number, times: number[], amp: number): V3 => {
  let s = 0;
  for (const g of times) if (t > g) s += Math.exp(-(t - g) * 7) * (t - g < 1.2 ? 1 : 0);
  return [Math.sin(t * 61) * amp * s, Math.sin(t * 47 + 1) * amp * s, Math.sin(t * 53 + 2) * amp * 0.5 * s];
};

// Slow-motion clock for the sleep-inertia beat.
const speedAt = (t: number) => 1 - 0.68 * window01(t, 41.5, 46.3, 0.6, 0.5);
const warp = (t: number, from = 40) => {
  let s = 0;
  const dt = 1 / 60;
  for (let x = from; x < t; x += dt) s += speedAt(x) * Math.min(dt, t - x);
  return from + s;
};

/* ---------------- anchors ---------------- */

const LYING = { position: [0, 0.6, -0.42] as V3, rotation: [-Math.PI / 2 + 0.035, 0, 0] as V3 };
const FACE_LYING: V3 = [0.0, 0.76, -2.02];
const SIT = { position: [0.55, 0.04, -1.2] as V3, rotation: [0, Math.PI / 2, 0] as V3 };
const HEAD_SIT: V3 = [0.62, 1.37, -1.2];
const METER: V3 = [0.8, 1.8, -0.98];
const HOURGLASS: V3 = [0.8, 1.82, -1.42];

const blinkAt = (t: number, seed = 0) => {
  // natural blinks every ~3.1 s, 0.16 s long
  const p = (t + seed) % 3.1;
  return p < 0.16 ? Math.sin((p / 0.16) * Math.PI) : 0;
};
const bump = (t: number, c: number, w: number) => Math.exp(-Math.pow((t - c) / w, 2));

/* ---------------- shot description ---------------- */

type Shot = {
  scene: number;
  cam: Cam;
};

const shotAt = (t: number): Shot => {
  // S01 — hook: through the window, past lamp and clock, ring, zoom, whip to the face
  if (t < C.s1) {
    const clockClose = add(CLOCK_C, CLOCK_N, 0.26);
    const faceCam: V3 = [0.32, 1.32, -1.74];
    let cam: Cam;
    if (t < 1.55)
      cam = glide(
        t,
        0,
        1.55,
        [
          [4.6, 1.5, -1.05],
          [2.95, 1.32, -1.1],
          [2.15, 1.1, -1.28],
          [1.8, 0.86, -1.44],
        ],
        [
          [0.6, 0.85, -1.5],
          [1.0, 0.78, -1.75],
          [1.3, 0.68, -1.92],
          CLOCK_C,
        ],
        [40, 42],
        (x) => smooth(x) * 0.6 + x * 0.4,
      );
    else if (t < 1.98) cam = keys(t, [{ t: 1.55, pos: [1.8, 0.86, -1.44], target: CLOCK_C, fov: 42 }, { t: 1.98, pos: clockClose, target: CLOCK_C, fov: 34 }], easeOut);
    else if (t < 2.32) {
      const u = expoInOut((t - 1.98) / 0.34);
      cam = { pos: v3lerp(clockClose, faceCam, u), target: v3lerp(CLOCK_C, FACE_LYING, u), fov: lerp(34, 32, u) };
    } else cam = keys(t, [{ t: 2.32, pos: faceCam, target: FACE_LYING, fov: 32 }, { t: C.s1, pos: [0.24, 1.24, -1.84], target: FACE_LYING, fov: 29 }], easeOut);
    return { scene: 1, cam };
  }
  // S02 — sitting on the bed edge, yawn, rub eyes; half orbit; into the energy meter
  if (t < C.s2) {
    let cam: Cam;
    if (t < 4.4) cam = keys(t, [{ t: C.s1, pos: add(HEAD_SIT, [0.36, 0.02, 0.3]), target: HEAD_SIT, fov: 30 }, { t: 4.4, pos: [1.85, 1.4, -0.35], target: [0.6, 1.25, -1.25], fov: 40 }], easeInOut);
    else if (t < 8.55)
      cam = glide(
        t,
        4.4,
        8.55,
        [
          [1.85, 1.4, -0.35],
          [2.45, 1.45, -1.0],
          [2.55, 1.5, -1.55],
          [2.3, 1.55, -1.1],
        ],
        [
          [0.6, 1.25, -1.25],
          [0.75, 1.3, -1.22],
          [0.8, 1.32, -1.2],
          [0.85, 1.5, -1.05],
        ],
        [40, 44],
        smooth,
      );
    else cam = keys(t, [{ t: 8.55, pos: [2.3, 1.55, -1.1], target: [0.85, 1.5, -1.05], fov: 44 }, { t: C.s2, pos: add(METER, [0.17, 0.0, 0.05]), target: METER, fov: 34 }], easeIn);
    return { scene: 2, cam };
  }
  // S03 — science space: duration vs quality vs timing
  if (t < C.s3) {
    let cam: Cam;
    if (t < 10.4) cam = keys(t, [{ t: C.s2, pos: [0.14, 0.05, 0.3], target: [0, 0, 0], fov: 38 }, { t: 10.4, pos: [0, 0.2, 3.3], target: [0, 0.12, 0], fov: 40 }], easeOut);
    else if (t < 15.8) cam = keys(t, [{ t: 10.4, pos: [0, 0.2, 3.3], target: [0, 0.12, 0], fov: 40 }, { t: 15.8, pos: [-0.3, 0.1, 2.9], target: [-0.05, -0.15, 0], fov: 40 }], smooth);
    else if (t < 18.4)
      cam = glide(
        t,
        15.8,
        18.4,
        [
          [-0.3, 0.1, 2.9],
          [0.15, 0.05, 2.1],
          [0.45, -0.4, 1.9],
          [-0.05, -0.7, 1.5],
        ],
        [
          [-0.05, -0.15, 0],
          [0.1, -0.2, -0.2],
          [0.2, -0.5, -0.2],
          ST,
        ],
        [40, 38],
        easeInOut,
      );
    else cam = keys(t, [{ t: 18.4, pos: [-0.05, -0.7, 1.5], target: ST, fov: 38 }, { t: C.s3, pos: add(ST, [0.01, 0.01, 0.13]), target: ST, fov: 30 }], easeIn);
    return { scene: 3, cam };
  }
  // S04 — interrupted sleep: night, floating timeline, short awakenings; then the tired morning
  if (t < C.s4) {
    let cam: Cam;
    const clockClose = add(CLOCK_C, CLOCK_N, 0.2);
    if (t < 19.95) cam = keys(t, [{ t: C.s3, pos: clockClose, target: CLOCK_C, fov: 34 }, { t: 19.95, pos: [1.95, 1.95, -0.15], target: [0.1, 1.05, -1.3], fov: 46 }], easeOut);
    else if (t < 26.0) {
      const u = clamp01((t - BAR.t0) / (BAR.t1 - BAR.t0));
      const z = barZ(Math.min(1, u + 0.05));
      const base = keys(t, [{ t: 19.95, pos: [1.95, 1.95, -0.15], target: [0.1, 1.05, -1.3], fov: 46 }, { t: 21.0, pos: [1.65, 1.78, -0.55], target: [0, 1.15, -0.9], fov: 44 }]);
      const follow: Cam = { pos: [1.35, 2.2, lerp(0.55, -0.45, smooth((t - 21) / 5))], target: [0, 0.98, lerp(-1.0, z, 0.5)], fov: 46 };
      const k = smooth((t - 20.6) / 0.8);
      cam = { pos: add(v3lerp(base.pos, follow.pos, k), shakeAt(t, GAPS.map(gapT), 0.012)), target: v3lerp(base.target, follow.target, k), fov: lerp(base.fov, follow.fov, k) };
    } else if (t < 27.3) cam = keys(t, [{ t: 26.0, pos: [1.35, 2.2, -0.45], target: [0, 0.98, -1.6], fov: 46 }, { t: 27.3, pos: [2.25, 2.15, 0.6], target: [0, 0.75, -1.3], fov: 48 }]);
    else if (t < 27.62) {
      const u = expoInOut((t - 27.3) / 0.32);
      cam = { pos: v3lerp([2.25, 2.15, 0.6], [1.9, 1.32, -0.55], u), target: v3lerp([0, 0.75, -1.3], HEAD_SIT, u), fov: lerp(48, 40, u) };
    } else if (t < 28.55) cam = keys(t, [{ t: 27.62, pos: [1.9, 1.32, -0.55], target: HEAD_SIT, fov: 40 }, { t: 28.55, pos: [1.6, 1.3, -0.8], target: add(HEAD_SIT, [0, -0.05, 0]), fov: 36 }], easeOut);
    else cam = keys(t, [{ t: 28.55, pos: [1.6, 1.3, -0.8], target: add(HEAD_SIT, [0, -0.05, 0]), fov: 36 }, { t: C.s4, pos: [3.6, 1.9, 0.6], target: [0.5, 1.0, -1.2], fov: 58 }], easeIn);
    return { scene: 4, cam };
  }
  // S05 — irregular rhythm: the body clock, three different bedtimes, spiral into the centre
  if (t < C.s5) {
    let cam: Cam;
    if (t < 29.9) cam = keys(t, [{ t: C.s4, pos: [0, 0.05, 1.5], target: [0, 0, 0], fov: 62 }, { t: 29.9, pos: [0.3, 0.12, 4.4], target: [0, 0, 0], fov: 44 }], easeOut);
    else if (t < 35.9) {
      const b = lerp(0.07, -0.4, smooth((t - 29.9) / 6));
      const y = lerp(0.12, 0.4, smooth((t - 29.9) / 6));
      cam = { pos: [4.4 * Math.sin(b), y, 4.4 * Math.cos(b)], target: [0, 0, 0], fov: 44 };
    } else {
      const u = clamp01((t - 35.9) / (C.s5 - 35.9));
      const r = lerp(4.4, 0.22, easeIn(u) * 0.35 + easeInOut(u) * 0.65);
      const b = -0.4 + 1.6 * easeInOut(u);
      cam = { pos: [r * Math.sin(b), lerp(0.4, 0.0, easeInOut(u)), r * Math.cos(b)], target: [0, 0, 0], fov: lerp(44, 36, u), roll: 0.8 * easeIn(u) };
    }
    return { scene: 5, cam };
  }
  // S06 — sleep inertia: into the head, the brain wakes slowly
  if (t < C.s6) {
    let cam: Cam;
    if (t < 40.12) cam = keys(t, [{ t: C.s5, pos: add(HEAD_SIT, [0.6, 0.06, 0.18]), target: HEAD_SIT, fov: 34 }, { t: 39.3, pos: add(HEAD_SIT, [0.42, 0.06, 0.12]), target: HEAD_SIT, fov: 32 }, { t: 40.12, pos: add(HEAD_SIT, [0.1, 0.1, 0.03]), target: add(HEAD_SIT, [0, 0.08, 0]), fov: 18 }], easeIn);
    else if (t < 42.3) cam = keys(t, [{ t: 40.12, pos: [0, 0.06, 3.4], target: [0, 0, 0], fov: 38 }, { t: 41.25, pos: [0, 0.06, 3.0], target: [0, 0, 0], fov: 38 }, { t: 42.3, pos: [0.25, 0.12, 1.65], target: [0.05, 0, 0], fov: 38 }], easeInOut);
    else {
      const tw = warp(t, 42.3) - 42.3;
      const b = 0.15 - tw * 0.11;
      const r = lerp(1.65, 1.45, smooth((t - 46.2) / 2));
      cam = { pos: [r * Math.sin(b) + 0.1, 0.12 + 0.05 * Math.sin(tw * 0.6), r * Math.cos(b)], target: [0.08, -0.02, 0], fov: 38 };
      if (t > 48.15) {
        const u = easeIn((t - 48.15) / (C.s6 - 48.15 + 1.2));
        cam = { ...cam, pos: add(cam.pos, [0, 0.4 * u, 6 * u]) };
      }
    }
    return { scene: 6, cam };
  }
  // S07 — solutions: regular hours → dark & calm room → morning light
  if (t < C.s7) {
    let cam: Cam;
    if (t < 53.25) {
      if (t < 49.9) cam = keys(t, [{ t: C.s6, pos: [0.1, 0.3, 2.0], target: [0, 0, 0], fov: 40 }, { t: 49.9, pos: [0.05, 0.3, 5.6], target: [0, 0.05, 0], fov: 40 }], easeOut);
      else if (t < 52.6) cam = keys(t, [{ t: 49.9, pos: [0.05, 0.3, 5.6], target: [0, 0.05, 0], fov: 40 }, { t: 52.6, pos: [0.15, 0.2, 3.9], target: [0.05, 0, 0], fov: 40 }], smooth);
      else cam = keys(t, [{ t: 52.6, pos: [0.15, 0.2, 3.9], target: [0.05, 0, 0], fov: 40 }, { t: 53.25, pos: [0.0, 0.0, 0.2], target: [0, 0, 0], fov: 30 }], easeIn);
      return { scene: 7, cam };
    }
    const clockClose = add(CLOCK_C, CLOCK_N, 0.2);
    if (t < 55.8)
      cam = keys(t, [{ t: 53.25, pos: clockClose, target: CLOCK_C, fov: 34 }, { t: 54.3, pos: [2.1, 1.6, 0.35], target: [0.3, 0.8, -1.3], fov: 46 }, { t: 55.8, pos: [1.9, 1.55, 0.6], target: [0.25, 0.75, -1.35], fov: 46 }], easeInOut);
    else if (t < 56.7) cam = keys(t, [{ t: 55.8, pos: [1.9, 1.55, 0.6], target: [0.25, 0.75, -1.35], fov: 46 }, { t: 56.7, pos: [0.35, 1.5, 2.0], target: [2.1, 1.25, -0.45], fov: 46 }], easeInOut);
    else if (t < 57.95) cam = keys(t, [{ t: 56.7, pos: [0.35, 1.5, 2.0], target: [2.1, 1.25, -0.45], fov: 46 }, { t: 57.95, pos: [0.75, 1.48, 1.45], target: [2.1, 1.28, -0.45], fov: 44 }], easeOut);
    else cam = keys(t, [{ t: 57.95, pos: [0.75, 1.48, 1.45], target: [2.1, 1.28, -0.45], fov: 44 }, { t: C.s7, pos: [2.0, 1.6, -0.55], target: [3.5, 1.6, -0.75], fov: 40 }], easeIn);
    return { scene: 8, cam };
  }
  // S08 — see a doctor if it persists; the three pillars; the closing line
  let cam: Cam;
  if (t < 65.35) cam = keys(t, [{ t: C.s7, pos: [0.75, 1.5, 3.4], target: [0.18, 1.28, 0], fov: 36 }, { t: 65.35, pos: [0.4, 1.45, 3.0], target: [0.15, 1.26, 0], fov: 36 }], smooth);
  else cam = keys(t, [{ t: 65.35, pos: [0.4, 1.45, 3.0], target: [0.15, 1.26, 0], fov: 36 }, { t: 67.4, pos: [0, 1.25, 4.6], target: [0, 0.95, 0], fov: 40 }, { t: 69.5, pos: [0, 1.22, 4.9], target: [0, 0.93, 0], fov: 40 }], easeInOut);
  return { scene: 9, cam };
};

/* ---------------- room looks ---------------- */

const lookAt = (t: number, scene: number): RoomLook => {
  if (scene === 1) return { day: 0, lamp: 0.45 - 0.2 * span(t, 2.3, 3.2), curtain: 0.85, sun: 0 };
  if (scene === 2) return { day: 0.55, lamp: 0, curtain: 0.2, sun: 0 };
  if (scene === 4) {
    const morning = span(t, 27.38, 27.5);
    const flick = GAPS.reduce((s, g) => s + bump(t, gapT(g) + 0.05, 0.12), 0);
    return { day: morning * 0.55, lamp: (1 - morning) * (0.06 + 0.5 * flick), curtain: 0.2 + (1 - morning) * 0.5, sun: 0 };
  }
  if (scene === 6) return { day: 0.55, lamp: 0, curtain: 0.2, sun: 0 };
  if (scene === 8) {
    const on = 1 - span(t, 54.4, 54.95);
    const morning = span(t, 56.2, 57.4);
    return { day: morning, lamp: on, curtain: span(t, 56.0, 57.1), sun: morning };
  }
  return { day: 0.5, lamp: 0, curtain: 0.5, sun: 0 };
};

/* ---------------- hero states ---------------- */

const heroFor = (t: number, scene: number): (HeroProps & { show: boolean }) | null => {
  if (scene === 1 || (scene === 8 && t < 55.95) || (scene === 4 && t < 27.45)) {
    // asleep on his back; S04 tosses at each gap; S01 wakes at the alarm
    let eyes = 1;
    let head: V3 = [0.12, 0, 0];
    let roll = 0;
    const m: Record<string, number> = {};
    if (scene === 1) {
      const ring = window01(t, 1.6, 3.1, 0.1, 0.3);
      m.browDownLeft = m.browDownRight = 0.45 * ring;
      m.eyeSquintLeft = m.eyeSquintRight = 0.4 * ring;
      const wake = span(t, 2.38, 2.7);
      eyes = 1 - 0.47 * wake + 0.45 * bump(t, 2.92, 0.06);
      m.browInnerUp = 0.35 * wake;
      m.mouthFrownLeft = m.mouthFrownRight = 0.25 * wake;
      head = [0.12, 0.32 * span(t, 2.3, 3.1), 0];
    }
    if (scene === 4) {
      let yaw = 0;
      GAPS.forEach((g, i) => {
        const tg = gapT(g);
        const open = bump(t, tg + 0.35, 0.28);
        eyes = Math.min(eyes, 1 - 0.65 * open);
        yaw += (i % 2 === 0 ? 0.3 : -0.3) * span(t, tg, tg + 0.6) * (i === 0 ? 1 : 2) * 0.5;
        roll += (i % 2 === 0 ? 0.05 : -0.05) * span(t, tg, tg + 0.6);
      });
      m.browInnerUp = 1 - eyes;
      head = [0.12, yaw, 0];
    }
    m.eyeBlinkLeft = m.eyeBlinkRight = eyes;
    return {
      show: true,
      clip: "m_idle_breathe_01",
      time: t * 0.6,
      position: LYING.position,
      rotation: [LYING.rotation[0], LYING.rotation[1], roll],
      head,
      morphs: m,
    };
  }
  if (scene === 2 || scene === 4 || (scene === 6 && t < 40.12)) {
    const m: Record<string, number> = {};
    if (scene === 2) {
      const ct = 0.25 + (t - C.s1) * 0.95;
      const yawn = window01(ct, 1.6, 3.9, 0.6, 0.6);
      m.jawOpen = 0.85 * yawn;
      m.mouthFunnel = 0.2 * yawn;
      m.eyeSquintLeft = m.eyeSquintRight = 0.6 * yawn;
      m.browInnerUp = 0.5 * yawn + 0.25;
      const rub = window01(ct, 4.2, 5.6, 0.2, 0.3);
      const half = 0.5 + 0.1 * Math.sin(t * 1.3);
      m.eyeBlinkLeft = m.eyeBlinkRight = Math.max(0.85 * yawn, rub, half * (1 - yawn), blinkAt(t));
      return { show: true, clip: "m_sit_chair_idle_yawn", time: ct, ...SIT, morphs: m, head: [0.08, 0, 0] };
    }
    if (scene === 4) {
      m.eyeBlinkLeft = m.eyeBlinkRight = Math.max(0.55, blinkAt(t, 1));
      m.browInnerUp = 0.45;
      m.mouthFrownLeft = m.mouthFrownRight = 0.3;
      return { show: true, clip: "m_sit_chair_idle_touch_face", time: 0.6 + (t - 27.45) * 0.9, ...SIT, morphs: m, head: [0.12, 0, 0] };
    }
    m.eyeBlinkLeft = m.eyeBlinkRight = Math.max(0.5, blinkAt(t, 2));
    m.browInnerUp = 0.5;
    m.jawOpen = 0.08;
    return { show: true, clip: "m_sit_chair_breathe_01", time: t - 38.0, ...SIT, morphs: m, head: [0.18, 0.1, 0.05] };
  }
  if (scene === 8) {
    const m: Record<string, number> = { mouthSmileLeft: 0.3 * span(t, 57.2, 57.8), mouthSmileRight: 0.3 * span(t, 57.2, 57.8) };
    m.eyeBlinkLeft = m.eyeBlinkRight = blinkAt(t, 0.5);
    return { show: true, clip: "m_idle_stretch_arms_01", time: 0.2 + (t - 55.95) * 0.95, position: [2.05, 0, -0.15], rotation: [0, -1.25, 0], morphs: m };
  }
  if (scene === 9) {
    const m: Record<string, number> = { mouthSmileLeft: 0.32 * span(t, 59.6, 60.4), mouthSmileRight: 0.32 * span(t, 59.6, 60.4) };
    m.eyeBlinkLeft = m.eyeBlinkRight = blinkAt(t, 1.3);
    m.browInnerUp = 0.12;
    return { show: true, clip: "m_idle_breathe_01", time: t, position: [0, 0, 0], rotation: [0, 0.18, 0], morphs: m, gaze: [0.06 * Math.sin(t * 0.4), 0] };
  }
  return null;
};

/* ---------------- 3D scenes ---------------- */

const RoomScene: React.FC<{ t: number; scene: number }> = ({ t, scene }) => {
  const look = lookAt(t, scene);
  const hero = heroFor(t, scene);
  let hours = 23;
  let ring = 0;
  if (scene === 1) {
    hours = 23 + 8 * easeInOut(t / 1.55) + (t > 1.55 ? (t - 1.55) / 3600 : 0);
    ring = window01(t, 1.55, 3.2, 0.04, 0.35);
  } else if (scene === 2) hours = 7 + (t - C.s1) / 60;
  else if (scene === 4) hours = t < 27.45 ? 23 + 7.6 * smooth((t - C.s3) / (27.4 - C.s3)) : 7 + 2 / 60 + (t - 27.45) / 3600;
  else if (scene === 6) hours = 7 + 6 / 60;
  else if (scene === 8) hours = t < 56 ? 23 : 7 + (t - 56) / 3600;
  const sleeper = !!hero && hero.clip === "m_idle_breathe_01" && scene !== 9;
  return (
    <>
      <Env intensity={lerp(0.18, 0.55, look.day)} background="#04060c" />
      <Backdrop top={look.day > 0.5 ? "#8fb4e8" : "#0a1226"} bottom={look.day > 0.5 ? "#f2dcc0" : "#04070f"} glow={look.day > 0.5 ? "#ffd9a0" : "#1d2b55"} dust={0} floorY={-0.02} />
      <RoomLights look={look} />
      <Bedroom look={look} clockHours={hours} ring={ring} t={t} sleeper={sleeper} />
      {hero && <Hero {...hero} />}
      {scene === 2 && <EnergyMeter level={0.17 + 0.03 * Math.sin(t * 2)} t={t} position={METER} scale={0.4 * easeOut(clamp01((t - 4.3) / 0.5))} rotation={[0, 1.1 + 0.1 * Math.sin(t * 0.7), 0.06]} />}
      {scene === 2 && <Icon3D name="duration" position={add(HOURGLASS, [0, 0.02 * Math.sin(t * 1.4), 0])} scale={0.2 * easeOut(clamp01((t - 3.9) / 0.5))} rotation={[0.05, 1.3 + 0.2 * Math.sin(t * 0.6), 0]} />}
      {scene === 4 && t < 27.45 && (
        <group>
          <SleepBar progress={clamp01((t - BAR.t0) / (BAR.t1 - BAR.t0))} gaps={GAPS} flash={GAPS.reduce((s, g) => s + bump(t, gapT(g) + 0.1, 0.18), 0)} position={[0, BAR.y, (BAR.z0 + BAR.z1) / 2]} rotation={[0, Math.PI / 2, 0]} length={BAR.z0 - BAR.z1} />
          <Icon3D name="moon" position={[0, BAR.y, BAR.z0 + 0.16]} scale={0.14} rotation={[0, 1.2, 0]} glow={0.15} />
          <Icon3D name="sun" position={[0, BAR.y, BAR.z1 - 0.16]} scale={0.15} rotation={[0, 1.2, 0]} glow={0.1} />
        </group>
      )}
    </>
  );
};

const ScienceScene: React.FC<{ t: number }> = ({ t }) => {
  const meterOut = span(t, 11.8, 12.8);
  const pop = (a: number) => {
    const k = clamp01((t - a) / 0.5);
    return easeOut(k) * (1 + 0.12 * Math.sin(k * Math.PI));
  };
  const spin = (s: number) => [0.08 * Math.sin(t * 0.8 + s), -0.3 + 0.25 * Math.sin(t * 0.5 + s), 0] as V3;
  const D: V3 = SD;
  const Q: V3 = SQ;
  const T: V3 = ST;
  return (
    <>
      <Env intensity={0.7} background="#03060f" />
      <Backdrop top="#0d1838" bottom="#02040b" glow="#3b5bdb" floorY={-0.75} />
      <ambientLight intensity={0.25} color="#8fa8ff" />
      <directionalLight position={[2.5, 3, 3]} intensity={2.2} color="#e7eeff" />
      <directionalLight position={[-3, 1, -2]} intensity={1.6} color="#5c7cfa" />
      <pointLight position={[0, 1.2, 1.4]} intensity={2.5} distance={6} color="#ffd8a8" />
      {meterOut < 1 && <EnergyMeter level={0.17} t={t} position={v3lerp([0, 0, 0], [0, 0.6, -3], meterOut)} scale={1.5 * (1 - 0.6 * meterOut)} rotation={[0, 0.4, 0]} />}
      <Icon3D name="duration" position={add(D, [0, 0.03 * Math.sin(t * 1.3), 0])} scale={0.45 * pop(10.3) * (1 + 0.25 * window01(t, 13.4, 14.6, 0.3, 0.4))} rotation={spin(0)} glow={0.06 * window01(t, 13.4, 14.6)} />
      {t > 15.9 && <Icon3D name="quality" position={add(Q, [0, 0.03 * Math.sin(t * 1.2 + 1), 0])} scale={0.45 * pop(16.05)} rotation={spin(1)} />}
      {t > 16.95 && <Icon3D name="timing" position={add(T, [0, 0.03 * Math.sin(t * 1.1 + 2), 0])} scale={0.45 * pop(17.1)} rotation={spin(2)} />}
      <FlowLine points={[add(D, [0.18, -0.12, 0]), [0.32, 0.22, -0.1], add(Q, [0.02, 0.2, 0])]} draw={span(t, 15.85, 16.6)} t={t} color="#74c0fc" />
      <FlowLine points={[add(Q, [-0.05, -0.2, 0]), [0.18, -0.55, -0.1], add(T, [0.2, 0.05, 0])]} draw={span(t, 16.9, 17.6)} t={t} color="#63e6be" />
      <FlowLine points={[add(T, [-0.2, 0.05, 0]), [-0.5, -0.15, 0.1], add(D, [-0.2, -0.12, 0])]} draw={span(t, 17.9, 18.5)} t={t} color="#ffd43b" />
    </>
  );
};

const BodyClockScene: React.FC<{ t: number }> = ({ t }) => {
  // hands: steady → three different bedtimes → out of sync
  let hours = 22 + (t - C.s4) * 0.35;
  let minutes: number | undefined;
  const nights = [
    { at: 32.7, h: 22 },
    { at: 33.6, h: 25.5 },
    { at: 34.5, h: 23.75 },
  ];
  if (t > 32.5) {
    let h = 22 + (32.5 - C.s4) * 0.35;
    for (const n of nights) h = lerp(h, n.h + (n.h < h - 6 ? 24 : 0), easeInOut((t - n.at + 0.2) / 0.5));
    hours = h;
  }
  if (t > 35.4) {
    const k = span(t, 35.4, 36.2);
    hours += k * ((t - 35.4) * 0.9 + 0.35 * Math.sin(t * 2.3));
    minutes = hours * 60 + k * ((t - 35.4) * 160 + 40 * Math.sin(t * 5.1));
  }
  const chaos = span(t, 35.4, 36.4);
  const a = (t - C.s4) * 0.55 + chaos * 0.6 * Math.sin(t * 1.7);
  const dios = [
    { p: [-0.42, 0.98, 0.5] as V3, at: 32.7, r: [0.45, 0.95, 0] as V3 },
    { p: [0.42, 0.98, 0.5] as V3, at: 33.6, r: [0.45, -0.95, 0] as V3 },
    { p: [0, -1.05, 0.55] as V3, at: 34.5, r: [0.4, 0.75, 0] as V3 },
  ];
  return (
    <>
      <Env intensity={0.6} background="#05040d" />
      <Backdrop top="#1a1240" bottom="#04030b" glow="#7048e8" floorY={-1.9} />
      <ambientLight intensity={0.3} color="#b197fc" />
      <directionalLight position={[2, 3, 4]} intensity={2.4} color="#f3f0ff" castShadow={false} />
      <directionalLight position={[-3, -1, 2]} intensity={1.2} color="#748ffc" />
      <Clock hours={hours} minutes={minutes} t={t} bells={false} body="#3a4256" face="#141c38" accent="#ffd43b" tickColor="#c5d0ff" glow={0.5} position={[0, -0.61, 0]} scale={7} rotation={[0, 0, 0.02 * chaos * Math.sin(t * 9)]} />
      <Icon3D name="moon" position={[0.72 * Math.cos(a + Math.PI), 0.72 * Math.sin(a + Math.PI), 0.4]} scale={0.2} rotation={[0, 0.3, 0]} glow={0.12} />
      <Icon3D name="sun" position={[0.72 * Math.cos(a), 0.72 * Math.sin(a), 0.4]} scale={0.22} rotation={[0, -0.3, 0]} glow={0.12} />
      {dios.map((d, i) => {
        const on = span(t, d.at - 0.1, d.at + 0.35);
        const s = (0.21 + 0.05 * on) * easeOut(clamp01((t - 31.0 - i * 0.35) / 0.6));
        if (s <= 0.001) return null;
        return (
          <group key={i} position={d.p} rotation={d.r} scale={s}>
            <group position={[0, 0, 1.3]}>
              <MiniBed duvet={["#a5b4fc", "#99e9f2", "#ffd8a8"][i]} />
              <Hero clip="m_idle_breathe_01" time={t * 0.6 + i} position={LYING.position} rotation={[LYING.rotation[0], 0, 0.04 * Math.sin(t + i)]} head={[0.12, [0.2, -0.25, 0.1][i], 0]} morphs={{ eyeBlinkLeft: 1, eyeBlinkRight: 1 }} />
              <pointLight position={[0, 2.2, -1]} intensity={6 * (0.3 + on)} distance={5} color={["#bac8ff", "#99e9f2", "#ffd8a8"][i]} />
            </group>
          </group>
        );
      })}
    </>
  );
};

const BrainScene: React.FC<{ t: number }> = ({ t }) => {
  const tw = warp(t, 40);
  const act = t < 46.2 ? 0.22 + 0.1 * Math.sin(tw * 1.3) * span(t, 41.6, 42.4) : lerp(0.25, 1, easeInOut((t - 46.25) / 1.1));
  const out = span(t, C.s6, 49.4); // zoom-out into the bright solutions space
  const card = window01(t, 42.0, 46.7, 0.6, 0.5);
  const bright = span(t, 48.3, 48.8);
  return (
    <>
      <Env intensity={lerp(0.6, 1.0, bright)} background="#02040a" />
      <Backdrop top={bright > 0.5 ? "#fff6ea" : "#0b1430"} bottom={bright > 0.5 ? "#ffe0bd" : "#02040b"} glow={bright > 0.5 ? "#ffb347" : "#1c7ed6"} floorY={-0.95} dust={1 - bright} />
      <ambientLight intensity={0.2 + bright} color="#a5d8ff" />
      <directionalLight position={[2, 2.5, 3]} intensity={2.2 + bright} color="#e3f2ff" />
      <directionalLight position={[-2.5, 0.5, -2]} intensity={2.4} color="#3bc9db" />
      <pointLight position={[0, -0.6, 1.0]} intensity={1.5 + 3 * act} distance={4} color="#4dabf7" />
      {out < 1 && <Brain act={act} time={tw} scale={0.22 * (1 - out * 0.85)} rotation={[0.12, -0.6 + (tw - 40) * 0.12, 0]} position={[0, 0.22 + 0.02 * Math.sin(tw), 0]} />}
      {card > 0.01 && (
        <GlassCard w={0.42} h={0.5} position={[0.02, -0.5, 0.35]} rotation={[0, -0.12, 0]} opacity={card}>
          <group scale={0.26 * card} position={[0, -0.23, -0.1]}>
            <Hero clip="m_idle_scratch_head_01" time={1.4 + (tw - 42) * 0.8} position={[0, 0, 0]} rotation={[0, 0.25, 0]} morphs={{ eyeBlinkLeft: 0.55, eyeBlinkRight: 0.55, browInnerUp: 0.6, mouthFrownLeft: 0.3, mouthFrownRight: 0.3 }} />
          </group>
          <directionalLight position={[0.5, 1, 1]} intensity={1.5} />
        </GlassCard>
      )}
    </>
  );
};

const SolutionClockScene: React.FC<{ t: number }> = ({ t }) => {
  // hands settle from chaotic into calm, regular ticking
  const settle = span(t, 49.9, 52.2);
  const hours = lerp(23 + 3 * Math.sin(t * 2.2), 23 + 8 * settle, settle);
  const s = easeOut(clamp01((t - 49.55) / 0.6));
  const moon: V3 = [-0.55, 0.98, 0.3];
  const sun: V3 = [0.55, 0.98, 0.3];
  return (
    <>
      <Env intensity={1.1} background="#fff6ea" />
      <Backdrop top="#fff8ef" bottom="#ffe3c2" glow="#ffc078" floorY={-0.95} dust={0} />
      <ambientLight intensity={0.8} color="#fff4e6" />
      <directionalLight position={[2, 3, 4]} intensity={2.2} color="#fff1dc" />
      <directionalLight position={[-3, 1, 1]} intensity={0.8} color="#ffd8a8" />
      <group scale={s}>
        <Clock hours={hours} t={t} body="#e6e1d8" face="#ffffff" accent="#ff7a3d" position={[0, -0.61, 0]} scale={7} />
        <Icon3D name="moon" position={add(moon, [0, 0.03 * Math.sin(t * 1.4), 0])} scale={0.36} rotation={[0, 0.4, 0]} />
        <Icon3D name="sun" position={add(sun, [0, 0.03 * Math.sin(t * 1.2), 0])} scale={0.4} rotation={[0, -0.4, 0]} />
      </group>
      <FlowLine points={[add(moon, [-0.12, -0.18, 0]), [-0.72, -0.2, 0.35], [0, -0.88, 0.5], [0.72, -0.2, 0.35], add(sun, [0.12, -0.18, 0])]} draw={span(t, 50.1, 51.6)} t={t} color="#ff922b" radius={0.014} />
    </>
  );
};

const StudioScene: React.FC<{ t: number }> = ({ t }) => {
  const hero = heroFor(t, 9)!;
  const row = (i: number) => easeOut(clamp01((t - 65.7 - i * 0.3) / 0.55));
  return (
    <>
      <Env intensity={0.9} background="#fbf6ef" />
      <Backdrop top="#fffaf3" bottom="#efe4d6" glow="#ffd8a8" floorY={0} dust={0} />
      <hemisphereLight args={["#fff6ec", "#d9cbb8", 0.8]} />
      <directionalLight
        position={[2.5, 4.5, 3.5]}
        intensity={2.6}
        color="#fff3e2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-3, 2, 1]} intensity={0.9} color="#ffe8cc" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <shadowMaterial opacity={0.18} />
      </mesh>
      <Hero {...hero} />
      <Icon3D name="medical" position={[0.45, 1.55 + 0.04 * Math.sin(t * 1.3), 0.25]} scale={0.36 * easeOut(clamp01((t - 58.9) / 0.6)) * (1 - span(t, 65.2, 65.7))} rotation={[0.1, -0.5 + 0.35 * Math.sin(t * 0.6), 0]} glow={0.04} />
      {t > 65.6 &&
        (["duration", "quality", "timing"] as const).map((n, i) => (
          <Icon3D key={n} name={n} position={[(i - 1) * 0.5, 0.45 + 0.03 * Math.sin(t * 1.3 + i), 1.05]} scale={0.28 * row(i)} rotation={[0.05, -0.35 + i * 0.35, 0]} />
        ))}
    </>
  );
};

/* ---------------- overlay text plan ---------------- */

const AMBER = "#ffc94d";
const CORAL = "#ff8787";
const BLUE = "#91a7ff";
const TEAL = "#63e6be";
const CYAN = "#66d9ff";

const HIDE = [0, 9, 13, 17, 18, 21, 22, 29, 30];
const HL: Record<number, { word: string; color: string }> = {
  1: { word: "هشت", color: AMBER },
  4: { word: "نخوابیدی", color: CORAL },
  6: { word: "کافی", color: AMBER },
  7: { word: "مدت", color: AMBER },
  8: { word: "کیفیت", color: BLUE },
  10: { word: "قطع", color: AMBER },
  12: { word: "کیفیت", color: BLUE },
  14: { word: "نامنظم", color: CORAL },
  16: { word: "زیستی", color: TEAL },
  19: { word: "مغزت", color: CYAN },
  20: { word: "هوشیار", color: CYAN },
  21: { word: "موقتیه", color: TEAL },
  23: { word: "منظم", color: "#e8590c" },
  24: { word: "تاریک", color: BLUE },
  25: { word: "نور", color: "#e8590c" },
  27: { word: "خسته‌ای", color: "#e03131" },
  28: { word: "پزشک", color: "#e03131" },
};

const DISPLAYS: Display[] = [
  { text: "۸ ساعت خواب!", a: 0.5, b: 1.85, y: 300, size: 132, enter: "pop", exit: "through", accent: { word: "۸ ساعت", color: AMBER } },
  { text: "هنوز خسته‌ای؟", a: 1.98, b: 3.05, y: 1180, size: 128, enter: "zoom", exit: "fade", accent: { word: "خسته‌ای", color: CORAL } },
  { text: "دلیل اول", sub: "خواب منقطع", a: 19.4, b: 20.6, y: 260, size: 104, enter: "rise", exit: "fade" },
  { text: "کیفیت استراحت ↓", a: 26.3, b: 28.5, y: 300, size: 92, enter: "pop", exit: "drop", color: "#dbe4ff", accent: { word: "کیفیت", color: BLUE } },
  { text: "دلیل دوم", sub: "ساعت خواب نامنظم", a: 29.2, b: 30.9, y: 250, size: 104, enter: "rise", exit: "fade" },
  { text: "دلیل سوم", a: 38.75, b: 39.95, y: 300, size: 104, enter: "rise", exit: "fade" },
  { text: "اینرسی خواب", a: 40.16, b: 41.45, y: 760, size: 150, enter: "track", exit: "through", color: "#e7f5ff", accent: { word: "اینرسی", color: CYAN } },
  { text: "معمولاً موقتیه", a: 46.25, b: 48.1, y: 280, size: 96, enter: "pop", exit: "fade", color: "#e6fcf5", accent: { word: "موقتیه", color: TEAL } },
  { text: "حالا چیکار کنی؟", a: 48.6, b: 49.75, y: 300, size: 116, enter: "pop", exit: "through", color: "#2b2118", stroke: false, accent: { word: "چیکار", color: "#e8590c" } },
  { text: "خواب خوب،\nفقط ۸ ساعت نیست!", a: 66.65, b: 69.9, y: 250, size: 104, enter: "rise", exit: "fade", color: "#2b2118", stroke: false, accent: { word: "۸ ساعت", color: "#e8590c" } },
];

const TAGS: Tag[] = [
  { text: "۸ ساعت خواب", anchor: add(HOURGLASS, [0, 0.12, 0]), a: 4.1, b: 8.4, color: AMBER, side: "up", size: 44 },
  { text: "انرژی", anchor: add(METER, [0, 0.2, 0]), a: 4.8, b: 8.6, color: CORAL, side: "up", size: 44 },
  { text: "مدت خواب", anchor: [-0.42, 0.12, 0], a: 14.4, b: 18.9, color: AMBER, side: "left" },
  { text: "کیفیت خواب", anchor: [0.5, -0.38, -0.25], a: 16.2, b: 18.9, color: BLUE, side: "right" },
  { text: "زمان خواب", anchor: [-0.4, -0.9, 0], a: 17.25, b: 18.5, color: TEAL, side: "left" },
  { text: "خواب منقطع", anchor: [0, BAR.y + 0.05, barZ(GAPS[0])], a: 21.8, b: 25.9, color: "#ffa94d", side: "up" },
  { text: "۲۲:۰۰", anchor: [-0.42, 1.22, 0.6], a: 32.75, b: 37.9, color: "#bac8ff", side: "left", size: 44 },
  { text: "۰۱:۳۰", anchor: [0.42, 1.22, 0.6], a: 33.65, b: 37.9, color: "#99e9f2", side: "right", size: 44 },
  { text: "۲۳:۴۵", anchor: [0.18, -0.92, 0.6], a: 34.55, b: 37.9, color: "#ffd8a8", side: "right", size: 44 },
  { text: "ساعت زیستی", anchor: [0, 0.55, 0.15], a: 35.6, b: 37.6, color: TEAL, side: "up", size: 56 },
  { text: "هوشیاری پایین", anchor: [-0.15, 0.36, 0.1], a: 43.9, b: 46.1, color: CYAN, side: "left", size: 46 },
  { text: "۲۳:۰۰", anchor: [-0.55, 1.18, 0.3], a: 50.2, b: 53.0, color: "#5f3dc4", side: "up", size: 44, light: true },
  { text: "۰۷:۰۰", anchor: [0.55, 1.2, 0.3], a: 50.6, b: 53.0, color: "#e8590c", side: "up", size: 44, light: true },
  { text: "تاریک و آرام", anchor: [0.95, 1.0, -2.1], a: 54.6, b: 55.8, color: BLUE, side: "up", size: 50 },
  { text: "نور طبیعی صبح", anchor: [2.58, 1.95, -0.75], a: 56.9, b: 58.0, color: "#e8590c", side: "left", size: 50, light: true },
  { text: "مدت خواب", anchor: [-0.5, 0.3, 1.05], a: 66.0, b: 69.9, color: "#e8590c", side: "up", size: 36, light: true },
  { text: "کیفیت خواب", anchor: [0, 0.3, 1.05], a: 66.3, b: 69.9, color: "#3b5bdb", side: "up", size: 36, light: true },
  { text: "نظم خواب", anchor: [0.5, 0.3, 1.05], a: 66.6, b: 69.9, color: "#0ca678", side: "up", size: 36, light: true },
];

/* ---------------- blur / flash ---------------- */

const blurAt = (t: number) =>
  26 * bump(t, 2.15, 0.07) +
  9 * bump(t, 9.12, 0.06) +
  10 * bump(t, 19.1, 0.07) +
  24 * bump(t, 27.46, 0.07) +
  10 * window01(t, 28.8, 29.25, 0.2, 0.25) +
  12 * bump(t, 40.08, 0.08) +
  7 * bump(t, 48.7, 0.15) +
  10 * bump(t, 53.2, 0.07);

const flashAt = (t: number): [string, number] => {
  const w = 0.85 * bump(t, 19.15, 0.09);
  const c = 0.8 * bump(t, 40.12, 0.09);
  const n = window01(t, 38.2, 38.86, 0.3, 0.26);
  const l = 1.0 * bump(t, 58.35, 0.22);
  const p = 0.65 * bump(t, 53.25, 0.06);
  if (n > 0.01) return ["#0c1430", n];
  if (c > 0.01) return ["#d0f4ff", c];
  if (l > 0.01) return ["#fffaf0", l];
  if (p > 0.01) return ["#ffffff", p];
  return ["#ffffff", w];
};

/* ---------------- composition ---------------- */

export const SleepFilm: React.FC<{ withAudio?: boolean; at?: number[] }> = ({ withAudio = true, at }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = at ? at[Math.min(frame, at.length - 1)] : frame / FPS;
  const { scene, cam } = shotAt(t);
  const blur = blurAt(t);
  const [flashColor, flash] = flashAt(t);
  const light = (t > 49.6 && t < 53.25) || t > 56.9;
  const brainSet = scene === 6 && t >= 40.12;
  const solutionClock = scene === 7;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <filter id="whip">
          <feGaussianBlur stdDeviation={`${blur} ${blur * 0.15}`} />
        </filter>
      </svg>
      <AbsoluteFill style={{ filter: blur > 0.4 ? "url(#whip)" : undefined }}>
        <ThreeCanvas
          width={width}
          height={height}
          shadows
          gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0, antialias: false, outputColorSpace: THREE.SRGBColorSpace }}
          camera={{ fov: 40, near: 0.01, far: 200 }}
        >
          <CameraRig cam={cam} />
          {(scene === 1 || scene === 2 || scene === 4 || scene === 8 || (scene === 6 && !brainSet)) && <RoomScene t={t} scene={scene} />}
          {scene === 3 && <ScienceScene t={t} />}
          {scene === 5 && <BodyClockScene t={t} />}
          {brainSet && <BrainScene t={t} />}
          {solutionClock && (t < 49.55 ? <BrainScene t={t} /> : <SolutionClockScene t={t} />)}
          {scene === 9 && <StudioScene t={t} />}
        </ThreeCanvas>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 60% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,${light ? 0.22 : 0.5}) 100%)` }} />
      {/* overlays */}
      <AbsoluteFill style={{ width: W, height: H }}>
        {TAGS.map((tag, i) => (
          <TagLabel key={i} t={t} cam={cam} tag={tag} />
        ))}
        {DISPLAYS.map((d, i) => (
          <DisplayText key={i} t={t} d={d} />
        ))}
        <EightHours t={t} />
        <PlusRow t={t} />
        <Captions t={t} hidden={HIDE} highlights={HL} light={light} top={t > 41.5 && t < 46.3 ? 250 : 1290} />
      </AbsoluteFill>
      {flash > 0.005 && <AbsoluteFill style={{ background: flashColor, opacity: flash }} />}
      {withAudio && <Audio src={staticFile("sleep/mix.wav")} />}
    </AbsoluteFill>
  );
};

/** S03: «۸ ساعت» — appears, swells on «فقط مدت خواب», then steps aside for the other two factors. */
const EightHours: React.FC<{ t: number }> = ({ t }) => {
  if (t < 10.2 || t > 16.4) return null;
  const inK = easeOut(clamp01((t - 10.25) / 0.4));
  const swell = window01(t, 13.35, 14.7, 0.35, 0.5);
  const step = span(t, 14.7, 15.4);
  const out = span(t, 15.85, 16.35);
  const scale = (0.7 + 0.3 * inK) * (1 + 0.35 * swell) * (1 - 0.45 * step);
  const y = lerp(150, 120, step);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, display: "flex", justifyContent: "center", opacity: inK * (1 - out), transform: `scale(${scale})` }}>
      <div dir="rtl" style={{ fontFamily: "Vazirmatn", fontWeight: 900, fontSize: 210, color: AMBER, textShadow: "0 12px 50px rgba(255,180,60,0.35), 0 4px 10px rgba(0,0,0,0.5)" }}>
        ۸ ساعت
        <span style={{ fontSize: 90, color: "#fff", marginRight: 18 }}>{t > 12.0 ? "؟" : ""}</span>
      </div>
    </div>
  );
};

/** S08: plus signs between the three pillars. */
const PlusRow: React.FC<{ t: number }> = ({ t }) => {
  const a = easeOut(clamp01((t - 66.4) / 0.4));
  if (a <= 0) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 1250, display: "flex", justifyContent: "center", gap: 300, opacity: a }}>
      {[0, 1].map((i) => (
        <div key={i} style={{ fontFamily: "Vazirmatn", fontWeight: 900, fontSize: 64, color: "#b08968" }}>
          +
        </div>
      ))}
    </div>
  );
};

export { shotAt, BED, WINDOW };
