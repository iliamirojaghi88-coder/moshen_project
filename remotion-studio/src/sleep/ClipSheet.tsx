import React from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { useVideoConfig } from "remotion";
import { Clip, Hero } from "./Hero";
import { CameraRig, Env } from "./Stage";

// Debug sheet: one clip sampled at 8 times, side by side.
export const ClipSheet: React.FC<{ clip: Clip; t0: number; t1: number }> = ({ clip, t0, t1 }) => {
  const { width, height } = useVideoConfig();
  const n = 8;
  return (
    <ThreeCanvas width={width} height={height} gl={{ toneMapping: THREE.ACESFilmicToneMapping }} camera={{ fov: 40 }}>
      <CameraRig cam={{ pos: [0, 0.6, 8.2], target: [0, 0.6, 0], fov: 40 }} />
      <Env intensity={1} background="#2a2f3a" />
      <directionalLight position={[2, 4, 5]} intensity={2} />
      {Array.from({ length: n }, (_, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const tt = t0 + ((t1 - t0) * i) / (n - 1);
        return <Hero key={i} clip={clip} time={tt} position={[(col - 1.5) * 1.2, row === 0 ? 0.9 : -1.3, 0]} rotation={[0, 0.5, 0]} scale={0.95} />;
      })}
    </ThreeCanvas>
  );
};
