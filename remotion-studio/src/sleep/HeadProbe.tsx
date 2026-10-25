import React, { useLayoutEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { Clip, Hero } from "./Hero";

type P = { clip: Clip; time: number; position: [number, number, number]; rotation: [number, number, number] };
const Report: React.FC<{ n: number }> = ({ n }) => {
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    const out: string[] = [];
    let i = 0;
    scene.traverse((o) => {
      if (o.name === "Bip01_Head") {
        const p = o.getWorldPosition(new THREE.Vector3());
        out.push(`#${i++}:${p.toArray().map((x) => x.toFixed(3)).join(",")}`);
      }
    });
    if (out.length >= n) throw new Error("HEADS " + out.join(" "));
  });
  return null;
};
export const HeadProbe: React.FC<{ poses: P[] }> = ({ poses }) => (
  <ThreeCanvas width={200} height={200}>
    {poses.map((p, i) => (
      <Hero key={i} {...p} />
    ))}
    <Report n={poses.length} />
  </ThreeCanvas>
);
