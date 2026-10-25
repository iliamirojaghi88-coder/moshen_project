import React, { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { staticFile } from "remotion";

// Rocketbox Male_Adult_02 (MIT) — 80-bone Biped, 52 ARKit + 15 viseme shapes.
// Every pose is a pure function of the props: clip time is set with
// mixer.setTime(), so renders are frame-exact and order-independent.

export const CLIPS = [
  "m_idle_breathe_01",
  "m_idle_neutral_01",
  "m_idle_scratch_head_01",
  "m_idle_stretch_arms_01",
  "m_idle_touch_face_01",
  "m_idle_touch_face_02",
  "m_idle_yawn_01",
  "m_sit_chair_breathe_01",
  "m_sit_chair_idle_relaxed_01",
  "m_sit_chair_idle_scratch_head",
  "m_sit_chair_idle_touch_face",
  "m_sit_chair_idle_yawn",
] as const;
export type Clip = (typeof CLIPS)[number];

const HERO_URL = staticFile("sleep/models/hero.glb");
const CLIP_URLS = CLIPS.map((c) => staticFile(`sleep/anims/${c}.glb`));

export type HeroProps = {
  clip: Clip;
  time: number;
  /** Optional second clip cross-faded in with weight `blend`. */
  clipB?: Clip;
  timeB?: number;
  blend?: number;
  morphs?: Record<string, number>;
  /** Extra head rotation in the character's own frame (radians). */
  head?: [number, number, number];
  /** Extra spine bend (pitch, yaw, roll), spread over the spine bones. */
  spine?: [number, number, number];
  /** Eye gaze offset (yaw, pitch) in radians. */
  gaze?: [number, number];
  /** Messy-hair amount: tilts the hair cards a touch. */
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  castShadow?: boolean;
};

const qTmp = new THREE.Quaternion();
const qRoot = new THREE.Quaternion();
const qParent = new THREE.Quaternion();
const qBone = new THREE.Quaternion();
const eTmp = new THREE.Euler();

/** Rotate `bone` by `euler`, expressed in the axes of `root` (axis-agnostic for Biped bones). */
const rotateInRootFrame = (root: THREE.Object3D, bone: THREE.Object3D, euler: [number, number, number]) => {
  if (!bone.parent) return;
  root.getWorldQuaternion(qRoot);
  qTmp.setFromEuler(eTmp.set(euler[0], euler[1], euler[2], "YXZ"));
  // delta in world = qRoot * d * qRoot^-1
  const dWorld = qRoot.clone().multiply(qTmp).multiply(qRoot.clone().invert());
  bone.getWorldQuaternion(qBone);
  const newWorld = dWorld.multiply(qBone);
  bone.parent.getWorldQuaternion(qParent);
  bone.quaternion.copy(qParent.invert().multiply(newWorld));
  bone.updateMatrixWorld(true);
};

export const useHeroAssets = () => {
  const hero = useGLTF(HERO_URL);
  const clipGltfs = useGLTF(CLIP_URLS);
  const { clips, armature } = useMemo(() => {
    const m = {} as Record<Clip, THREE.AnimationClip>;
    const a = {} as Record<Clip, THREE.Object3D>;
    CLIPS.forEach((c, i) => {
      // Pelvis scale tracks would undo the cm→m armature scale: drop them.
      const clip = clipGltfs[i].animations[0].clone();
      clip.tracks = clip.tracks.filter((tr) => !tr.name.endsWith(".scale") && !tr.name.includes("Nub"));
      m[c] = clip;
      // Each clip carries its own armature transform (pelvis height, facing).
      a[c] = clipGltfs[i].scene.getObjectByName("RB_Armature") ?? new THREE.Object3D();
    });
    return { clips: m, armature: a };
  }, [clipGltfs]);
  return { hero, clips, armature };
};

export const Hero: React.FC<HeroProps> = (p) => {
  const { hero, clips, armature } = useHeroAssets();
  const { root, mixer, meshes, bones, arm } = useMemo(() => {
    const r = skeletonClone(hero.scene) as THREE.Group;
    // The avatar GLB bakes the armature into the pelvis; the clips keep it
    // separate. Re-insert an armature node so clip pelvis data lands right.
    const pelvis = r.getObjectByName("Bip01_Pelvis") ?? r.getObjectByName("Bip01 Pelvis");
    const armNode = new THREE.Object3D();
    armNode.name = "RB_Armature_rt";
    if (pelvis?.parent) {
      pelvis.parent.add(armNode);
      armNode.add(pelvis);
      pelvis.position.set(0, 0, 0);
      pelvis.scale.set(1, 1, 1);
    }
    const m: THREE.SkinnedMesh[] = [];
    const b: Record<string, THREE.Bone> = {};
    r.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
        const sm = o as THREE.SkinnedMesh;
        sm.frustumCulled = false;
        sm.castShadow = true;
        sm.receiveShadow = true;
        const isArr = Array.isArray(sm.material);
        const mats = isArr ? (sm.material as THREE.Material[]) : [sm.material as THREE.Material];
        const out = mats.map((mat) => {
          const c = (mat as THREE.MeshStandardMaterial).clone();
          if (c.name.includes("opacity")) {
            // eyelashes / hair cards: alpha-tested so they sort cleanly
            c.transparent = false;
            c.alphaTest = 0.4;
            c.side = THREE.DoubleSide;
          } else {
            c.roughness = c.name.includes("head") ? 0.62 : 0.85;
            c.metalness = 0;
          }
          c.envMapIntensity = 0.9;
          return c;
        });
        sm.material = isArr ? out : out[0];
        if (sm.morphTargetDictionary) m.push(sm);
      }
      if ((o as THREE.Bone).isBone) b[o.name] = o as THREE.Bone;
    });
    return { root: r, mixer: new THREE.AnimationMixer(r), meshes: m, bones: b, arm: armNode };
  }, [hero]);

  useLayoutEffect(() => {
    mixer.stopAllAction();
    const a = mixer.clipAction(clips[p.clip]);
    a.reset().play();
    const w = p.clipB ? THREE.MathUtils.clamp(p.blend ?? 0, 0, 1) : 0;
    a.setEffectiveWeight(1 - w);
    const dur = clips[p.clip].duration;
    a.time = ((p.time % dur) + dur) % dur;
    if (p.clipB) {
      const b = mixer.clipAction(clips[p.clipB]);
      b.reset().play();
      b.setEffectiveWeight(w);
      const db = clips[p.clipB].duration;
      const tb = p.timeB ?? p.time;
      b.time = ((tb % db) + db) % db;
    }
    mixer.update(0);
    const A = armature[p.clip];
    arm.position.copy(A.position);
    arm.quaternion.copy(A.quaternion);
    arm.scale.copy(A.scale);
    if (p.clipB && (p.blend ?? 0) > 0) {
      const B = armature[p.clipB];
      const w = THREE.MathUtils.clamp(p.blend ?? 0, 0, 1);
      arm.position.lerp(B.position, w);
      arm.quaternion.slerp(B.quaternion, w);
    }
    root.updateMatrixWorld(true);
    const find = (n: string) => bones[n] ?? bones[n.replace(/ /g, "_")];
    if (p.spine) {
      const s = p.spine;
      for (const n of ["Bip01 Spine", "Bip01 Spine1", "Bip01 Spine2"]) {
        const bone = find(n);
        if (bone) rotateInRootFrame(root, bone, [s[0] / 3, s[1] / 3, s[2] / 3]);
      }
    }
    if (p.head) {
      const h = p.head;
      const neck = find("Bip01 Neck");
      const head = find("Bip01 Head");
      if (neck) rotateInRootFrame(root, neck, [h[0] * 0.4, h[1] * 0.4, h[2] * 0.4]);
      if (head) rotateInRootFrame(root, head, [h[0] * 0.6, h[1] * 0.6, h[2] * 0.6]);
    }
    if (p.gaze) {
      for (const n of ["Bip01 LEye", "Bip01 REye"]) {
        const bone = find(n);
        if (bone) rotateInRootFrame(root, bone, [p.gaze[1], p.gaze[0], 0]);
      }
    }
    for (const mesh of meshes) {
      if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) continue;
      const inf = mesh.morphTargetInfluences;
      inf.fill(0);
      for (const [k, v] of Object.entries(p.morphs ?? {})) {
        const i = mesh.morphTargetDictionary[k];
        if (i !== undefined) inf[i] = THREE.MathUtils.clamp(v, 0, 1);
      }
    }
  });

  return (
    <group position={p.position} rotation={p.rotation} scale={p.scale ?? 1}>
      <primitive object={root} />
    </group>
  );
};

useGLTF.preload(HERO_URL);
CLIP_URLS.forEach((u) => useGLTF.preload(u));
