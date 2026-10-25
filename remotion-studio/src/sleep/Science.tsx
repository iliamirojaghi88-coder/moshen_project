import React, { useMemo } from "react";
import * as THREE from "three";
import { RoundedBox, useGLTF } from "@react-three/drei";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { staticFile } from "remotion";
import { rng, V3 } from "./util";

// Science-space pieces: backdrop, procedural brain, energy meter, glass icons,
// glowing connector lines and the sleep timeline bar.

/* ---------------- backdrop ---------------- */

export const Backdrop: React.FC<{ top: string; bottom: string; glow?: string; dust?: number; floorY?: number }> = ({
  top,
  bottom,
  glow = "#3b5bdb",
  dust = 1,
  floorY = -1.2,
}) => {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, glow: { value: new THREE.Color() } },
        vertexShader: `varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
        fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bottom; uniform vec3 glow;
          void main(){ float h=clamp(vP.y*0.5+0.5,0.0,1.0); vec3 c=mix(bottom,top,smoothstep(0.25,0.9,h));
          c+=glow*0.35*exp(-pow((h-0.47)/0.09,2.0)); gl_FragColor=vec4(c,1.0);} `,
        toneMapped: false,
      }),
    [],
  );
  mat.uniforms.top.value.set(top);
  mat.uniforms.bottom.value.set(bottom);
  mat.uniforms.glow.value.set(glow);
  const pts = useMemo(() => {
    const r = rng(7);
    const n = 700;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      a[i * 3] = (r() - 0.5) * 24;
      a[i * 3 + 1] = (r() - 0.3) * 12;
      a[i * 3 + 2] = (r() - 0.5) * 24;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(a, 3));
    return g;
  }, []);
  const floor = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { c: { value: new THREE.Color() } },
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
        fragmentShader: `varying vec2 vUv; uniform vec3 c; void main(){ float d=length(vUv-0.5)*2.0; float a=exp(-d*d*3.0)*0.55;
          float ring=smoothstep(0.004,0.0,abs(fract(d*6.0)-0.5)-0.49)*0.12*(1.0-d); gl_FragColor=vec4(c,a+ring);} `,
      }),
    [],
  );
  floor.uniforms.c.value.set(glow);
  return (
    <group>
      <mesh material={mat}>
        <sphereGeometry args={[60, 48, 24]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, 0]} material={floor}>
        <planeGeometry args={[14, 14]} />
      </mesh>
      {dust > 0 && (
        <points geometry={pts}>
          <pointsMaterial size={0.025} color="#cfe0ff" transparent opacity={0.35 * dust} sizeAttenuation depthWrite={false} />
        </points>
      )}
    </group>
  );
};

/* ---------------- 3D simplex-ish value noise (deterministic) ---------------- */

const perm = (() => {
  const r = rng(42);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return [...p, ...p];
})();
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const grad = (h: number, x: number, y: number, z: number) => {
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
};
export const noise3 = (x: number, y: number, z: number) => {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  z -= Math.floor(z);
  const u = fade(x);
  const v = fade(y);
  const w = fade(z);
  const A = perm[X] + Y;
  const AA = perm[A] + Z;
  const AB = perm[A + 1] + Z;
  const B = perm[X + 1] + Y;
  const BA = perm[B] + Z;
  const BB = perm[B + 1] + Z;
  const L = THREE.MathUtils.lerp;
  return L(
    L(L(grad(perm[AA] & 15, x, y, z), grad(perm[BA] & 15, x - 1, y, z), u), L(grad(perm[AB] & 15, x, y - 1, z), grad(perm[BB] & 15, x - 1, y - 1, z), u), v),
    L(
      L(grad(perm[AA + 1] & 15, x, y, z - 1), grad(perm[BA + 1] & 15, x - 1, y, z - 1), u),
      L(grad(perm[AB + 1] & 15, x, y - 1, z - 1), grad(perm[BB + 1] & 15, x - 1, y - 1, z - 1), u),
      v,
    ),
    w,
  );
};

/* ---------------- brain ---------------- */

const hemisphere = (side: number) => {
  const base = new THREE.IcosahedronGeometry(1, 56);
  base.deleteAttribute("normal");
  base.deleteAttribute("uv");
  const g = mergeVertices(base);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const region = new Float32Array(pos.count);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // ellipsoid hemisphere, flattened on the medial side and underneath
    let x = v.x * 0.62;
    let y = v.y * 0.72;
    const z = v.z * 1.0;
    if (x * side < 0) x *= 0.25;
    if (y < 0) y *= 0.75 + 0.2 * Math.max(0, z);
    // temporal lobe bulge
    y -= 0.08 * Math.exp(-Math.pow((z - 0.1) / 0.35, 2)) * Math.max(0, -v.y) * Math.abs(v.x);
    const p = new THREE.Vector3(x, y, z);
    // gyri: ridged noise, two octaves, folded along the long axis
    const f = 3.4;
    const n1 = 1 - Math.abs(noise3(p.x * f + side * 3, p.y * f * 1.1, p.z * f * 0.8));
    const n2 = 1 - Math.abs(noise3(p.x * f * 2.1 + 9, p.y * f * 2.1, p.z * f * 1.7));
    const ridge = Math.pow(n1, 3) * 0.75 + Math.pow(n2, 3) * 0.25;
    const medial = x * side < 0.02 ? 0.3 : 1;
    const d = (ridge - 0.35) * 0.11 * medial;
    p.multiplyScalar(1 + d);
    p.x += side * 0.03;
    pos.setXYZ(i, p.x, p.y, p.z);
    region[i] = 0.5 + 0.5 * noise3(p.x * 2.2 + 4, p.y * 2.2, p.z * 2.2);
  }
  g.setAttribute("region", new THREE.BufferAttribute(region, 1));
  g.computeVertexNormals();
  return g;
};

const glowMat = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { act: { value: 0 }, time: { value: 0 }, col: { value: new THREE.Color("#58d6ff") } },
    vertexShader: `attribute float region; varying float vR; varying vec3 vN; varying vec3 vP; varying vec3 vV;
      void main(){ vR=region; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); vP=position; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform float act; uniform float time; uniform vec3 col; varying float vR; varying vec3 vN; varying vec3 vP; varying vec3 vV;
      void main(){
        float fres=pow(1.0-max(dot(vN,vV),0.0),2.5);
        float wave=0.5+0.5*sin(vP.z*7.0-time*3.0+vR*9.0);
        float spark=smoothstep(0.82,0.95,fract(vR*13.0+time*0.35));
        float lit=smoothstep(1.0-act*1.15, 1.0-act*1.15+0.25, vR);
        float a=(fres*0.55+wave*0.25*lit+spark*lit*0.9)*act;
        gl_FragColor=vec4(col*a,a);
      }`,
  });

export const Brain: React.FC<{ act: number; time: number; position?: V3; rotation?: V3; scale?: number }> = ({ act, time, position, rotation, scale = 1 }) => {
  const geos = useMemo(() => [hemisphere(-1), hemisphere(1)], []);
  const mats = useMemo(
    () => ({
      base: new THREE.MeshPhysicalMaterial({
        color: "#e39aae",
        roughness: 0.38,
        clearcoat: 0.6,
        clearcoatRoughness: 0.25,
        sheen: 0.6,
        sheenColor: new THREE.Color("#ffd9e6"),
        emissive: new THREE.Color("#2a5bff"),
        emissiveIntensity: 0,
      }),
      glow: glowMat(),
      stem: new THREE.MeshPhysicalMaterial({ color: "#d9b2c0", roughness: 0.45, clearcoat: 0.4 }),
    }),
    [],
  );
  mats.base.emissiveIntensity = 0.12 * act;
  mats.base.color.set("#e39aae").multiplyScalar(0.55 + 0.45 * act);
  mats.glow.uniforms.act.value = act;
  mats.glow.uniforms.time.value = time;
  return (
    <group position={position} rotation={rotation} scale={scale}>
      {geos.map((g, i) => (
        <group key={i}>
          <mesh geometry={g} material={mats.base} castShadow receiveShadow />
          <mesh geometry={g} material={mats.glow} scale={1.012} />
        </group>
      ))}
      {/* cerebellum + stem */}
      <mesh material={mats.base} position={[0, -0.42, -0.62]} scale={[0.5, 0.26, 0.3]}>
        <sphereGeometry args={[1, 48, 32]} />
      </mesh>
      <mesh material={mats.stem} position={[0, -0.62, -0.35]} rotation={[0.45, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.075, 0.55, 32]} />
      </mesh>
    </group>
  );
};

/* ---------------- icons (icon3d GLBs) ---------------- */

export const ICONS = ["duration", "quality", "timing", "sun", "moon", "medical", "energy"] as const;
export type IconName = (typeof ICONS)[number];
const iconUrl = (n: IconName) => staticFile(`sleep/icons/${n}.glb`);

export const Icon3D: React.FC<{ name: IconName; position?: V3; rotation?: V3; scale?: number; glow?: number }> = ({ name, position, rotation, scale = 1, glow = 0 }) => {
  const g = useGLTF(iconUrl(name));
  const obj = useMemo(() => {
    const s = g.scene.clone(true);
    // centre + normalise to a 1-unit icon
    const box = new THREE.Box3().setFromObject(s);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const k = 1 / Math.max(size.x, size.y, size.z);
    s.position.sub(c.multiplyScalar(k));
    s.scale.setScalar(k);
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        mat.envMapIntensity = 1.3;
        m.material = mat;
      }
    });
    const w = new THREE.Group();
    w.add(s);
    return w;
  }, [g]);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.emissive = mat.color.clone();
      mat.emissiveIntensity = glow;
    }
  });
  return <primitive object={obj} position={position} rotation={rotation} scale={scale} />;
};
ICONS.forEach((n) => useGLTF.preload(iconUrl(n)));

/* ---------------- energy meter ---------------- */

export const EnergyMeter: React.FC<{ level: number; t: number; position?: V3; rotation?: V3; scale?: number }> = ({ level, t, position, rotation, scale = 1 }) => {
  const mats = useMemo(
    () => ({
      glass: new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.08, transparent: true, opacity: 0.18, clearcoat: 1, envMapIntensity: 2.5, depthWrite: false }),
      liquid: new THREE.MeshPhysicalMaterial({ color: "#ff4d4d", emissive: new THREE.Color("#ff3b3b"), emissiveIntensity: 0.8, roughness: 0.2, clearcoat: 1 }),
      cap: new THREE.MeshPhysicalMaterial({ color: "#d6d9de", metalness: 1, roughness: 0.25 }),
      tick: new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55 }),
    }),
    [],
  );
  const lv = THREE.MathUtils.clamp(level, 0.03, 1);
  const col = new THREE.Color("#ff3b3b").lerp(new THREE.Color("#ffc23d"), THREE.MathUtils.smoothstep(lv, 0.2, 0.5)).lerp(new THREE.Color("#3ddc84"), THREE.MathUtils.smoothstep(lv, 0.5, 0.85));
  mats.liquid.color.copy(col);
  mats.liquid.emissive.copy(col);
  mats.liquid.emissiveIntensity = 0.6 + 0.25 * Math.sin(t * 4);
  const H = 0.62;
  const R = 0.11;
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh material={mats.glass} renderOrder={2}>
        <capsuleGeometry args={[R, H, 16, 48]} />
      </mesh>
      <mesh material={mats.liquid} position={[0, -H / 2 - R * 0.55 + (lv * (H + R)) / 2, 0]}>
        <capsuleGeometry args={[R * 0.78, Math.max(0.001, lv * (H + R) - R * 0.6), 12, 32]} />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} material={mats.tick} position={[0, -H / 2 + (i + 0.5) * (H / 5), R + 0.002]}>
          <planeGeometry args={[0.07, 0.006]} />
        </mesh>
      ))}
      <mesh material={mats.cap} position={[0, H / 2 + R + 0.015, 0]}>
        <cylinderGeometry args={[0.045, 0.05, 0.04, 32]} />
      </mesh>
      <pointLight color={col} intensity={0.8} distance={1.2} position={[0, -0.1, 0.25]} />
    </group>
  );
};

/* ---------------- glowing connector line ---------------- */

export const FlowLine: React.FC<{ points: V3[]; draw: number; t: number; color?: string; radius?: number; opacity?: number }> = ({
  points,
  draw,
  t,
  color = "#7fd3ff",
  radius = 0.012,
  opacity = 1,
}) => {
  const key = JSON.stringify(points);
  const geo = useMemo(() => {
    const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, "centripetal");
    return new THREE.TubeGeometry(c, 200, radius, 12, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, radius]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { draw: { value: 0 }, time: { value: 0 }, col: { value: new THREE.Color() }, op: { value: 1 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
        fragmentShader: `varying vec2 vUv; uniform float draw; uniform float time; uniform vec3 col; uniform float op;
          void main(){ if(vUv.x>draw) discard; float head=exp(-pow((vUv.x-draw)*30.0,2.0));
          float dash=0.55+0.45*smoothstep(0.3,0.7,fract(vUv.x*26.0-time*1.4));
          float a=(dash*0.75+head*1.6)*op; gl_FragColor=vec4(col*a,a);} `,
        toneMapped: false,
      }),
    [],
  );
  mat.uniforms.draw.value = draw;
  mat.uniforms.time.value = t;
  mat.uniforms.col.value.set(color);
  mat.uniforms.op.value = opacity;
  return <mesh geometry={geo} material={mat} />;
};

/* ---------------- floating sleep timeline ---------------- */

/** Night timeline: continuous sleep with short breaks at `gaps` (0..1 positions). */
export const SleepBar: React.FC<{ progress: number; gaps: number[]; flash: number; position?: V3; rotation?: V3; length?: number }> = ({
  progress,
  gaps,
  flash,
  position,
  rotation,
  length = 1.7,
}) => {
  const mats = useMemo(
    () => ({
      shell: new THREE.MeshPhysicalMaterial({ color: "#dfe8ff", roughness: 0.12, transparent: true, opacity: 0.16, clearcoat: 1, depthWrite: false, envMapIntensity: 2 }),
      sleep: new THREE.MeshPhysicalMaterial({ color: "#5c7cfa", emissive: new THREE.Color("#4c6ef5"), emissiveIntensity: 1.1, roughness: 0.3 }),
      wake: new THREE.MeshPhysicalMaterial({ color: "#ffb347", emissive: new THREE.Color("#ff9f1c"), emissiveIntensity: 1.6, roughness: 0.3 }),
    }),
    [],
  );
  mats.wake.emissiveIntensity = 1.4 + flash * 2.5;
  const gw = 0.035;
  const segs: { a: number; b: number; kind: "s" | "w" }[] = [];
  let cur = 0;
  for (const g of gaps) {
    segs.push({ a: cur, b: g - gw / 2, kind: "s" });
    segs.push({ a: g - gw / 2, b: g + gw / 2, kind: "w" });
    cur = g + gw / 2;
  }
  segs.push({ a: cur, b: 1, kind: "s" });
  const L = length;
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={[L + 0.06, 0.07, 0.07]} radius={0.034} smoothness={6} material={mats.shell} renderOrder={2} />
      {segs.map((s, i) => {
        const a = Math.min(s.a, progress);
        const b = Math.min(s.b, progress);
        if (b <= a + 0.0005) return null;
        const w = (b - a) * L;
        return (
          <RoundedBox
            key={i}
            args={[Math.max(0.004, w - 0.006), s.kind === "s" ? 0.04 : 0.055, s.kind === "s" ? 0.04 : 0.055]}
            radius={0.012}
            smoothness={3}
            position={[-L / 2 + (a + b) / 2 * L, 0, 0]}
            material={s.kind === "s" ? mats.sleep : mats.wake}
          />
        );
      })}
    </group>
  );
};

/* ---------------- glass card (for the inset in the brain scene) ---------------- */

export const GlassCard: React.FC<{ w: number; h: number; position?: V3; rotation?: V3; opacity?: number; children?: React.ReactNode }> = ({ w, h, position, rotation, opacity = 1, children }) => {
  const mats = useMemo(
    () => ({
      back: new THREE.MeshPhysicalMaterial({ color: "#26354f", roughness: 0.6, transparent: true }),
      rim: new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.1, transparent: true, clearcoat: 1, envMapIntensity: 2 }),
    }),
    [],
  );
  mats.back.opacity = 0.95 * opacity;
  mats.rim.opacity = 0.12 * opacity;
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={[w, h, 0.02]} radius={0.06} smoothness={6} material={mats.back} position={[0, 0, -0.25]} receiveShadow />
      <RoundedBox args={[w + 0.03, h + 0.03, 0.6]} radius={0.07} smoothness={6} material={mats.rim} position={[0, 0, 0.02]} renderOrder={3} />
      {children}
    </group>
  );
};
