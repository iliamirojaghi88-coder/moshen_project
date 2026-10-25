import React, { useMemo } from "react";
import * as THREE from "three";
import { RoundedBox, useGLTF } from "@react-three/drei";
import { staticFile } from "remotion";
import { useMaterials } from "./materials";
import { curtainGeometry, duvetGeometry, pillowGeometry } from "./geometry";
import { Clock } from "./Clock";
import { lerp } from "./util";

// Bedroom set. World units are metres; floor y=0, back wall z=-2.45,
// window in the right wall (x=2.6). Mattress top at y=0.56.

export const BED = { top: 0.56, width: 1.62, zHead: -2.3, zFoot: -0.28 };
export const NIGHTSTAND = { x: 1.32, z: -2.02, top: 0.551 };
export const CLOCK_POS: [number, number, number] = [NIGHTSTAND.x + 0.08, NIGHTSTAND.top, NIGHTSTAND.z + 0.1];
export const CLOCK_YAW = 0.75;
/** Centre of the alarm-clock face and its facing direction (for camera moves). */
export const CLOCK_C: [number, number, number] = [CLOCK_POS[0], CLOCK_POS[1] + 0.087, CLOCK_POS[2]];
export const CLOCK_N: [number, number, number] = [Math.sin(CLOCK_YAW), 0, Math.cos(CLOCK_YAW)];
export const WINDOW = { x: 2.6, z: -0.75, y0: 0.85, y1: 2.35, w: 1.5 };

export type RoomLook = {
  /** 0 = night, 1 = daylight */
  day: number;
  /** warm bedside lamp 0..1 */
  lamp: number;
  /** curtains: 0 closed .. 1 open */
  curtain: number;
  /** sun shaft strength (morning sun) */
  sun: number;
};

const URLS = {
  table: staticFile("sleep/models/side_table_01.glb"),
  plant: staticFile("sleep/models/potted_plant_04.glb"),
};

const useModel = (url: string, shadows = true) => {
  const g = useGLTF(url);
  return useMemo(() => {
    const s = g.scene.clone(true);
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = shadows;
        m.receiveShadow = true;
      }
    });
    return s;
  }, [g, shadows]);
};

/** Sleeper bump under the duvet, matching the hero lying on his back (head at -z). */
export const sleeperBump = (lean = 0) => (x: number, z: number) => {
  const torso = Math.exp(-Math.pow(Math.abs(x - lean * 0.05) / 0.4, 2.6)) * 0.27 * smoothStep(-1.8, -1.55, z) * (1 - smoothStep(-1.05, -0.85, z));
  const hips = Math.exp(-Math.pow(Math.abs(x) / 0.25, 2.4)) * 0.2 * smoothStep(-1.1, -0.95, z) * (1 - smoothStep(-0.75, -0.6, z));
  const legs =
    (Math.exp(-Math.pow(Math.abs(x - 0.1) / 0.11, 2)) + Math.exp(-Math.pow(Math.abs(x + 0.1) / 0.11, 2))) *
    0.13 *
    smoothStep(-0.9, -0.7, z) *
    (1 - smoothStep(-0.42, -0.32, z));
  const feet = Math.exp(-Math.pow(Math.abs(x) / 0.2, 2.2)) * 0.17 * Math.exp(-Math.pow((z + 0.46) / 0.1, 2));
  return Math.max(torso, hips, legs, feet);
};
const smoothStep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const Bedroom: React.FC<{
  look: RoomLook;
  clockHours: number;
  ring?: number;
  t: number;
  /** null = empty bed (duvet flat), otherwise the sleeper bump */
  sleeper?: boolean;
  duvetTop?: number;
}> = ({ look, clockHours, ring = 0, t, sleeper = true, duvetTop = -1.68 }) => {
  const { make } = useMaterials();
  const table = useModel(URLS.table);
  const plant = useModel(URLS.plant);

  const m = useMemo(
    () => ({
      floor: make("wood_floor", { repeat: [4, 4], roughness: 0.75, normalScale: 0.6 }),
      wall: make("white_plaster_02", { repeat: [2, 1.5], color: "#e6e0d6", roughness: 0.95, normalScale: 0.15 }),
      wallBack: make("white_plaster_02", { repeat: [2, 1.5], color: "#b9c4d0", roughness: 0.95, normalScale: 0.15 }),
      sheet: make("rough_linen", { repeat: [3, 3], color: "#f1efe9", sheen: 0.6, normalScale: 0.5 }),
      duvet: make("rough_linen", { repeat: [1.2, 1.2], color: "#c7d3e3", sheen: 0.8, sheenColor: "#e9f0ff", normalScale: 0.7 }),
      pillow: make("rough_linen", { repeat: [1.5, 1.5], color: "#f5f3ee", sheen: 0.6, normalScale: 0.5 }),
      throwBlanket: make("knitted_fleece", { repeat: [1.5, 1.5], color: "#d7b98f", sheen: 1, normalScale: 1 }),
      upholstery: make("rough_linen", { repeat: [2, 2], color: "#5d6878", sheen: 0.7, sheenColor: "#a9b4c4", normalScale: 0.8 }),
      frame: new THREE.MeshPhysicalMaterial({ color: "#2b2f36", roughness: 0.4, metalness: 0.6 }),
      winGlass: new THREE.MeshPhysicalMaterial({ color: "#a8c4e6", roughness: 0.05, transparent: true, opacity: 0.1, envMapIntensity: 1.5 }),
      curtain: make("rough_linen", { repeat: [1, 1], color: "#e8e2d6", sheen: 0.9, normalScale: 0.6 }),
      lampBase: new THREE.MeshPhysicalMaterial({ color: "#e9e4dc", roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.12 }),
      lampShade: make("rough_linen", { repeat: [2, 1], color: "#f3e6cf", normalScale: 0.4 }),
      brass: new THREE.MeshPhysicalMaterial({ color: "#c9a36a", metalness: 1, roughness: 0.3 }),
      rug: make("knitted_fleece", { repeat: [3, 2], color: "#8c8f96", sheen: 1, normalScale: 0.8 }),
      art: new THREE.MeshPhysicalMaterial({ color: "#d9d2c5", roughness: 0.9 }),
    }),
    [make],
  );
  m.lampShade.emissive = new THREE.Color("#ffb766");
  m.lampShade.emissiveIntensity = 0.9 * look.lamp;

  const duvetGeo = useMemo(
    () =>
      duvetGeometry({
        width: BED.width,
        zTop: duvetTop,
        zFoot: BED.zFoot,
        top: BED.top,
        drop: 0.3,
        body: sleeper ? sleeperBump() : (x, z) => 0.03 * Math.exp(-Math.pow(x / 0.5, 2)) * Math.exp(-Math.pow((z + 1.0) / 0.5, 2)),
      }),
    [sleeper, duvetTop],
  );
  const pillowGeo = useMemo(() => pillowGeometry(0.62, 0.16, 0.42, 1), []);
  const pillowGeo2 = useMemo(() => pillowGeometry(0.62, 0.15, 0.42, 3), []);
  const curtainGeo = useMemo(() => curtainGeometry(1.0, 2.55, 10), []);

  // window wall with an opening (four boxes around the hole)
  const W = WINDOW;
  const wallX = 2.6;
  const zMin = -2.45;
  const zMax = 3.2;
  const H = 2.9;
  const zl = W.z - W.w / 2;
  const zr = W.z + W.w / 2;
  const gather = lerp(1, 0.32, look.curtain);

  return (
    <group>
      {/* floor + rug */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.3]} material={m.floor} receiveShadow>
        <planeGeometry args={[5.2, 5.6]} />
      </mesh>
      <RoundedBox args={[2.6, 0.012, 1.7]} radius={0.005} position={[0, 0.006, -0.55]} material={m.rug} receiveShadow />
      {/* back wall */}
      <mesh position={[0, H / 2, zMin]} material={m.wallBack} receiveShadow castShadow>
        <boxGeometry args={[5.4, H, 0.1]} />
      </mesh>
      {/* left wall */}
      <mesh position={[-2.65, H / 2, 0.3]} material={m.wall} receiveShadow>
        <boxGeometry args={[0.1, H, 5.6]} />
      </mesh>
      {/* right wall with window opening */}
      <group>
        <mesh position={[wallX, H / 2, (zMin + zl) / 2]} material={m.wall} castShadow receiveShadow>
          <boxGeometry args={[0.12, H, zl - zMin]} />
        </mesh>
        <mesh position={[wallX, H / 2, (zr + zMax) / 2]} material={m.wall} castShadow receiveShadow>
          <boxGeometry args={[0.12, H, zMax - zr]} />
        </mesh>
        <mesh position={[wallX, W.y0 / 2, W.z]} material={m.wall} castShadow receiveShadow>
          <boxGeometry args={[0.12, W.y0, W.w]} />
        </mesh>
        <mesh position={[wallX, (W.y1 + H) / 2, W.z]} material={m.wall} castShadow receiveShadow>
          <boxGeometry args={[0.12, H - W.y1, W.w]} />
        </mesh>
        {/* slim aluminium frame + mullion */}
        {[
          [0, W.y0 + 0.015, W.z, 0.03, W.w],
          [0, W.y1 - 0.015, W.z, 0.03, W.w],
        ].map((b, i) => (
          <mesh key={i} position={[wallX, b[1], b[2]]} material={m.frame} castShadow>
            <boxGeometry args={[0.07, b[3], b[4]]} />
          </mesh>
        ))}
        {[zl + 0.015, W.z, zr - 0.015].map((z, i) => (
          <mesh key={i} position={[wallX, (W.y0 + W.y1) / 2, z]} material={m.frame} castShadow>
            <boxGeometry args={[0.07, W.y1 - W.y0, 0.03]} />
          </mesh>
        ))}
        <mesh position={[wallX + 0.01, (W.y0 + W.y1) / 2, W.z]} rotation={[0, -Math.PI / 2, 0]} material={m.winGlass}>
          <planeGeometry args={[W.w, W.y1 - W.y0]} />
        </mesh>
        {/* sill */}
        <mesh position={[wallX - 0.08, W.y0 - 0.01, W.z]} material={m.lampBase} castShadow receiveShadow>
          <boxGeometry args={[0.2, 0.025, W.w + 0.1]} />
        </mesh>
        {/* curtain rod + two pleated panels that gather to the sides */}
        <mesh position={[wallX - 0.14, W.y1 + 0.22, W.z]} rotation={[Math.PI / 2, 0, 0]} material={m.frame}>
          <cylinderGeometry args={[0.012, 0.012, W.w + 0.9, 16]} />
        </mesh>
        <group position={[wallX - 0.16, W.y1 + 0.2, zl - 0.38]} rotation={[0, -Math.PI / 2, 0]}>
          <mesh geometry={curtainGeo} material={m.curtain} scale={[gather, 1, 1 / Math.sqrt(gather)]} castShadow receiveShadow />
        </group>
        <group position={[wallX - 0.16, W.y1 + 0.2, zr + 0.38]} rotation={[0, Math.PI / 2, 0]}>
          <mesh geometry={curtainGeo} material={m.curtain} scale={[gather, 1, 1 / Math.sqrt(gather)]} castShadow receiveShadow />
        </group>
      </group>
      {/* minimal framed art over the bed */}
      <group position={[0, 1.78, zMin + 0.07]}>
        <RoundedBox args={[0.95, 0.62, 0.03]} radius={0.008} material={m.frame} castShadow />
        <mesh position={[0, 0, 0.016]} material={m.art}>
          <planeGeometry args={[0.87, 0.54]} />
        </mesh>
        <mesh position={[-0.12, -0.05, 0.018]} material={m.upholstery}>
          <circleGeometry args={[0.16, 64]} />
        </mesh>
        <mesh position={[0.14, 0.06, 0.019]} material={m.brass}>
          <circleGeometry args={[0.07, 64]} />
        </mesh>
      </group>

      {/* bed: upholstered platform, channel-tufted headboard */}
      <RoundedBox args={[BED.width + 0.16, 0.3, 2.22]} radius={0.04} smoothness={4} position={[0, 0.2, (BED.zHead + BED.zFoot) / 2 - 0.02]} material={m.upholstery} castShadow receiveShadow />
      {[-0.84, 0.84].map((x) =>
        [-2.25, -0.25].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.03, z]} material={m.frame}>
            <cylinderGeometry args={[0.02, 0.02, 0.06, 12]} />
          </mesh>
        )),
      )}
      {Array.from({ length: 6 }, (_, i) => (
        <RoundedBox
          key={i}
          args={[0.3, 1.0, 0.11]}
          radius={0.05}
          smoothness={5}
          position={[-0.79 + i * 0.316, 0.86, BED.zHead - 0.07]}
          material={m.upholstery}
          castShadow
          receiveShadow
        />
      ))}
      <RoundedBox args={[BED.width, 0.2, BED.zFoot - BED.zHead]} radius={0.06} smoothness={5} position={[0, BED.top - 0.1, (BED.zHead + BED.zFoot) / 2]} material={m.sheet} castShadow receiveShadow />
      <mesh geometry={pillowGeo} material={m.pillow} position={[-0.38, BED.top + 0.07, -2.05]} rotation={[0.18, 0.04, 0]} castShadow receiveShadow />
      <mesh geometry={pillowGeo2} material={m.pillow} position={[0.36, BED.top + 0.07, -2.06]} rotation={[0.2, -0.05, 0]} castShadow receiveShadow />
      <mesh geometry={duvetGeo} material={m.duvet} castShadow receiveShadow />

      {/* nightstand + lamp + clock + plant */}
      <primitive object={table} position={[NIGHTSTAND.x, 0, NIGHTSTAND.z]} />
      <group position={[NIGHTSTAND.x - 0.1, NIGHTSTAND.top, NIGHTSTAND.z - 0.08]}>
        <mesh material={m.lampBase} position={[0, 0.13, 0]} castShadow>
          <sphereGeometry args={[0.11, 48, 32]} />
        </mesh>
        <mesh material={m.brass} position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.16, 12]} />
        </mesh>
        <mesh material={m.lampShade} position={[0, 0.42, 0]} castShadow>
          <cylinderGeometry args={[0.13, 0.16, 0.2, 64, 1, true]} />
        </mesh>
        <mesh position={[0, 0.38, 0]}>
          <sphereGeometry args={[0.03, 16, 8]} />
          <meshBasicMaterial color={new THREE.Color("#ffd8a0").multiplyScalar(0.2 + 2.5 * look.lamp)} toneMapped={false} />
        </mesh>
        <pointLight position={[0, 0.4, 0.05]} intensity={look.lamp * 2.4} distance={4.5} decay={2} color="#ffb36b" />
      </group>
      <Clock hours={clockHours} ring={ring} t={t} position={CLOCK_POS} rotation={[0, CLOCK_YAW, 0]} glow={0.08 * (1 - look.day)} />
      <primitive object={plant} position={[NIGHTSTAND.x + 0.16, NIGHTSTAND.top, NIGHTSTAND.z - 0.12]} scale={1.1} />
    </group>
  );
};

Object.values(URLS).forEach((u) => useGLTF.preload(u));

/** Bed alone (for floating dioramas): same proportions and soft goods as the room's bed. */
export const MiniBed: React.FC<{ duvet?: string }> = ({ duvet = "#c7d3e3" }) => {
  const { make } = useMaterials();
  const m = useMemo(
    () => ({
      sheet: make("rough_linen", { repeat: [3, 3], color: "#f1efe9", sheen: 0.6, normalScale: 0.5 }),
      duvet: make("rough_linen", { repeat: [1.2, 1.2], color: duvet, sheen: 0.8, sheenColor: "#e9f0ff", normalScale: 0.7 }),
      pillow: make("rough_linen", { repeat: [1.5, 1.5], color: "#f5f3ee", sheen: 0.6, normalScale: 0.5 }),
      upholstery: make("rough_linen", { repeat: [2, 2], color: "#5d6878", sheen: 0.7, sheenColor: "#a9b4c4", normalScale: 0.8 }),
    }),
    [make, duvet],
  );
  const duvetGeo = useMemo(() => duvetGeometry({ width: BED.width, zTop: -1.62, zFoot: BED.zFoot, top: BED.top, drop: 0.26, body: sleeperBump() }), []);
  const pillowGeo = useMemo(() => pillowGeometry(0.62, 0.16, 0.42, 1), []);
  return (
    <group>
      <RoundedBox args={[BED.width + 0.16, 0.3, 2.22]} radius={0.04} smoothness={4} position={[0, 0.2, (BED.zHead + BED.zFoot) / 2 - 0.02]} material={m.upholstery} castShadow receiveShadow />
      <RoundedBox args={[BED.width + 0.2, 0.9, 0.1]} radius={0.05} smoothness={4} position={[0, 0.8, BED.zHead - 0.07]} material={m.upholstery} castShadow receiveShadow />
      <RoundedBox args={[BED.width, 0.2, BED.zFoot - BED.zHead]} radius={0.06} smoothness={4} position={[0, BED.top - 0.1, (BED.zHead + BED.zFoot) / 2]} material={m.sheet} castShadow receiveShadow />
      <mesh geometry={pillowGeo} material={m.pillow} position={[0, BED.top + 0.07, -2.05]} rotation={[0.18, 0, 0]} castShadow receiveShadow />
      <mesh geometry={duvetGeo} material={m.duvet} castShadow receiveShadow />
    </group>
  );
};
