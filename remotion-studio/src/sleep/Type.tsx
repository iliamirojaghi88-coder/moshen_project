import React from "react";
import * as THREE from "three";
import { FONT_FA } from "../lib/fonts";
import { Cam } from "./Stage";
import { clamp01, easeOut, span, V3 } from "./util";
import phrases from "./phrases.json";

// Persian typography in four modes:
//  A captions (screen space, bottom safe zone, word-by-word reveal)
//  B keyword emphasis (word lifted out of the line, scaled + coloured)
//  C object-attached labels (3D anchor projected to the screen each frame)
//  D cinematic emphasis (large display type, its own entrance/exit)

export const W = 1080;
export const H = 1920;
export type Phrase = { i: number; text: string; start: number; end: number; words: { text: string; start: number; end: number }[] };
export const PHRASES = phrases as Phrase[];

const proj = new THREE.PerspectiveCamera(40, W / H, 0.01, 200);
/** Screen position (px) of a world point for the camera description `cam`; null if behind. */
export const project = (cam: Cam, p: V3): [number, number] | null => {
  proj.fov = cam.fov;
  proj.position.set(...cam.pos);
  proj.up.set(0, 1, 0);
  proj.lookAt(new THREE.Vector3(...cam.target));
  if (cam.roll) proj.rotateZ(cam.roll);
  proj.updateProjectionMatrix();
  proj.updateMatrixWorld(true);
  const v = new THREE.Vector3(...p).project(proj);
  if (v.z > 1) return null;
  return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H];
};

const shadow = "0 4px 18px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.6)";

/* ---------------- Mode A: captions ---------------- */

export const Captions: React.FC<{ t: number; hidden: number[]; highlights: Record<number, { word: string; color: string }>; light?: boolean; top?: number }> = ({
  t,
  hidden,
  highlights,
  light = false,
  top = 1290,
}) => {
  const ph = PHRASES.find((p) => t >= p.start - 0.12 && t <= p.end + 0.35);
  if (!ph || hidden.includes(ph.i)) return null;
  const inA = span(t, ph.start - 0.12, ph.start + 0.08);
  const outA = 1 - span(t, ph.end + 0.15, ph.end + 0.35);
  const hl = highlights[ph.i];
  return (
    <div
      style={{
        position: "absolute",
        left: 90,
        right: 90,
        top,
        display: "flex",
        justifyContent: "center",
        opacity: Math.min(inA, outA),
        transform: `translateY(${(1 - inA) * 14}px)`,
      }}
    >
      <div
        dir="rtl"
        style={{
          fontFamily: FONT_FA,
          fontWeight: 900,
          fontSize: 58,
          lineHeight: 1.45,
          textAlign: "center",
          color: light ? "#16202e" : "#ffffff",
          background: light ? "rgba(255,255,255,0.72)" : "rgba(8,12,22,0.42)",
          borderRadius: 26,
          padding: "10px 30px 14px",
          textShadow: light ? "none" : shadow,
          boxShadow: light ? "0 10px 30px rgba(60,40,10,0.12)" : "none",
        }}
      >
        {ph.words.map((w, k) => {
          const a = clamp01((t - w.start + 0.12) / 0.16);
          const isHl = hl && w.text.includes(hl.word);
          return (
            <span
              key={k}
              style={{
                opacity: 0.25 + 0.75 * a,
                color: isHl ? hl.color : undefined,
                display: "inline-block",
                transform: `translateY(${(1 - easeOut(a)) * 8}px)`,
              }}
            >
              {w.text}
              {k < ph.words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
};

/* ---------------- Mode B / D: display type ---------------- */

export type Display = {
  text: string;
  a: number;
  b: number;
  x?: number;
  y: number;
  size: number;
  color?: string;
  accent?: { word: string; color: string };
  /** entrance style */
  enter?: "pop" | "rise" | "zoom" | "track";
  /** fly through the camera on exit */
  exit?: "fade" | "through" | "drop";
  weight?: number;
  stroke?: boolean;
  sub?: string;
};

export const DisplayText: React.FC<{ t: number; d: Display }> = ({ t, d }) => {
  if (t < d.a - 0.05 || t > d.b + 0.6) return null;
  const k = (t - d.a) / 0.38;
  const enter = easeOut(clamp01(k));
  const pop = d.enter === "pop" ? 1 + 0.18 * Math.exp(-Math.pow((k - 0.75) * 2.6, 2)) * (k > 0.3 ? 1 : 0) : 1;
  const exitK = clamp01((t - d.b) / (d.exit === "through" ? 0.45 : 0.3));
  let scale = 1;
  let opacity = enter;
  let ty = 0;
  let blur = 0;
  let tracking = 0;
  if (d.enter === "rise") ty = (1 - enter) * 60;
  if (d.enter === "zoom") scale = 0.6 + 0.4 * enter;
  if (d.enter === "pop") scale = (0.75 + 0.25 * enter) * pop;
  if (d.enter === "track") tracking = (1 - enter) * 0.25;
  if (exitK > 0) {
    if (d.exit === "through") {
      scale *= 1 + exitK * exitK * 5;
      opacity *= 1 - exitK;
      blur = exitK * 14;
    } else if (d.exit === "drop") {
      ty += exitK * exitK * 140;
      opacity *= 1 - exitK;
    } else opacity *= 1 - exitK;
  }
  const parts = d.accent ? d.text.split(d.accent.word) : [d.text];
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: d.y,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        transform: `translate(${d.x ?? 0}px, ${ty}px) scale(${scale})`,
        transformOrigin: "50% 50%",
        opacity,
        filter: blur > 0.3 ? `blur(${blur}px)` : undefined,
      }}
    >
      <div
        dir="rtl"
        style={{
          fontFamily: FONT_FA,
          fontWeight: d.weight ?? 900,
          fontSize: d.size,
          lineHeight: 1.25,
          letterSpacing: `${tracking}em`,
          color: d.color ?? "#ffffff",
          textAlign: "center",
          textShadow: d.stroke === false ? "none" : "0 10px 40px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35)",
          whiteSpace: "pre-line",
        }}
      >
        {parts.length === 2 ? (
          <>
            {parts[0]}
            <span style={{ color: d.accent!.color }}>{d.accent!.word}</span>
            {parts[1]}
          </>
        ) : (
          d.text
        )}
      </div>
      {d.sub && (
        <div dir="rtl" style={{ fontFamily: FONT_FA, fontWeight: 400, fontSize: d.size * 0.36, color: d.color ?? "#fff", opacity: 0.85, marginTop: 6, textShadow: "0 4px 18px rgba(0,0,0,0.4)" }}>
          {d.sub}
        </div>
      )}
    </div>
  );
};

/* ---------------- Mode C: object-attached label ---------------- */

export type Tag = { text: string; anchor: V3; a: number; b: number; color?: string; side?: "left" | "right" | "up"; size?: number; light?: boolean };

export const TagLabel: React.FC<{ t: number; cam: Cam; tag: Tag }> = ({ t, cam, tag }) => {
  if (t < tag.a || t > tag.b + 0.3) return null;
  const p = project(cam, tag.anchor);
  if (!p) return null;
  const a = Math.min(easeOut(clamp01((t - tag.a) / 0.35)), 1 - clamp01((t - tag.b) / 0.3));
  const side = tag.side ?? "right";
  const len = 70 * a;
  const size = tag.size ?? 50;
  const col = tag.color ?? "#ffd166";
  const dx = side === "right" ? 1 : side === "left" ? -1 : 0;
  const dy = side === "up" ? -1 : -0.55;
  const ex = p[0] + dx * len;
  const ey = p[1] + dy * len;
  // keep the whole pill on screen: estimate its width from the text length
  const est = tag.text.length * size * 0.56 + 48;
  const bx =
    side === "right" ? Math.max(40, Math.min(W - 40 - est - 14, ex)) : side === "left" ? Math.min(W - 40, Math.max(40 + est + 14, ex)) : Math.max(40 + est / 2, Math.min(W - 40 - est / 2, ex));
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, opacity: a, pointerEvents: "none" }}>
      <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
        <line x1={p[0]} y1={p[1]} x2={ex} y2={ey} stroke={col} strokeWidth={3} strokeLinecap="round" />
        <circle cx={p[0]} cy={p[1]} r={7} fill={col} />
        <circle cx={p[0]} cy={p[1]} r={14 + 6 * Math.sin(t * 5)} fill="none" stroke={col} strokeOpacity={0.5} strokeWidth={2} />
      </svg>
      <div
        dir="rtl"
        style={{
          position: "absolute",
          left: bx,
          top: ey,
          transform: `translate(${side === "left" ? "-100%" : side === "up" ? "-50%" : "0"}, -50%) translateX(${side === "left" ? -14 : side === "right" ? 14 : 0}px) translateY(${side === "up" ? -40 : 0}px)`,
          fontFamily: FONT_FA,
          fontWeight: 900,
          fontSize: size,
          color: tag.light ? "#1a2230" : "#ffffff",
          background: tag.light ? "rgba(255,255,255,0.85)" : "rgba(10,14,26,0.55)",
          border: `2px solid ${col}`,
          borderRadius: 18,
          padding: "4px 20px 8px",
          whiteSpace: "nowrap",
          textShadow: tag.light ? "none" : "0 2px 10px rgba(0,0,0,0.5)",
        }}
      >
        {tag.text}
      </div>
    </div>
  );
};
