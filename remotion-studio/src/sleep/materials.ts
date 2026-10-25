import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { staticFile } from "remotion";

// Poly Haven PBR sets (CC0) arrive as sample GLBs; we lift their maps and
// build tiled physical materials from them.
const TEX = ["rough_linen", "wood_floor", "white_plaster_02", "knitted_fleece"] as const;
type TexName = (typeof TEX)[number];
const urls = TEX.map((t) => staticFile(`sleep/tex/${t}.glb`));

const findMat = (g: { scene: THREE.Object3D }) => {
  let m: THREE.MeshStandardMaterial | null = null;
  g.scene.traverse((o) => {
    const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!m && mm && (mm.map || mm.normalMap)) m = mm;
  });
  return m as unknown as THREE.MeshStandardMaterial;
};

const tile = (t: THREE.Texture | null, rx: number, ry: number) => {
  if (!t) return null;
  const c = t.clone();
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(rx, ry);
  c.offset.set(0, 0);
  c.center.set(0, 0);
  c.rotation = 0;
  c.anisotropy = 8;
  c.needsUpdate = true;
  return c;
};

export type MatOpts = {
  color?: string;
  repeat?: [number, number];
  roughness?: number;
  normalScale?: number;
  sheen?: number;
  sheenColor?: string;
  keepColorMap?: boolean;
};

export const useMaterials = () => {
  const gltfs = useGLTF(urls);
  return useMemo(() => {
    const src = {} as Record<TexName, THREE.MeshStandardMaterial>;
    TEX.forEach((t, i) => {
      src[t] = findMat(gltfs[i]);
    });
    const make = (name: TexName, o: MatOpts = {}) => {
      const s = src[name];
      const [rx, ry] = o.repeat ?? [1, 1];
      const m = new THREE.MeshPhysicalMaterial({
        map: o.keepColorMap === false ? null : tile(s.map, rx, ry),
        normalMap: tile(s.normalMap, rx, ry),
        roughnessMap: tile(s.roughnessMap, rx, ry),
        color: new THREE.Color(o.color ?? "#ffffff"),
        roughness: o.roughness ?? 1,
        metalness: 0,
        sheen: o.sheen ?? 0,
        sheenColor: new THREE.Color(o.sheenColor ?? "#ffffff"),
        sheenRoughness: 0.6,
      });
      const ns = o.normalScale ?? 1;
      m.normalScale = new THREE.Vector2(ns, ns);
      return m;
    };
    return { make };
  }, [gltfs]);
};

urls.forEach((u) => useGLTF.preload(u));
