import React, { useMemo } from "react";
import * as THREE from "three";

// Modern twin-bell alarm clock, built from lathe/extrude primitives with
// brushed-metal, ceramic-face and glass materials. `hours` drives the hands
// (e.g. 23 → 31 shows a night passing); `ring` 0..1 shakes it.

type Props = {
  hours: number;
  ring?: number;
  t?: number;
  bells?: boolean;
  /** Body colour; the bio-clock uses a darker glass-and-metal variant. */
  body?: string;
  face?: string;
  accent?: string;
  glow?: number;
  tickColor?: string;
  /** Overrides the minute-hand angle (in minutes) so the hands can disagree. */
  minutes?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
};

export const Clock: React.FC<Props> = ({
  hours,
  ring = 0,
  t = 0,
  bells = true,
  body = "#c9ccd1",
  face = "#f4f1ea",
  accent = "#ff7a3d",
  glow = 0,
  tickColor = "#2a2e35",
  minutes,
  position,
  rotation,
  scale = 1,
}) => {
  const mats = useMemo(() => {
    return {
      metal: new THREE.MeshPhysicalMaterial({ color: body, metalness: 1, roughness: 0.28, clearcoat: 0.4, clearcoatRoughness: 0.2 }),
      dark: new THREE.MeshPhysicalMaterial({ color: "#1e2229", metalness: 0.6, roughness: 0.35 }),
      face: new THREE.MeshPhysicalMaterial({ color: face, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, emissive: new THREE.Color(face), emissiveIntensity: 0 }),
      tick: new THREE.MeshStandardMaterial({ color: tickColor, roughness: 0.5, emissive: new THREE.Color(tickColor), emissiveIntensity: 0.2 }),
      hand: new THREE.MeshPhysicalMaterial({ color: "#1b1e24", metalness: 0.5, roughness: 0.3 }),
      accent: new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.3, clearcoat: 1, emissive: new THREE.Color(accent), emissiveIntensity: 0.15 }),
      glass: new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.02, transparent: true, opacity: 0.12, clearcoat: 1, metalness: 0, envMapIntensity: 2.2 }),
    };
  }, [body, face, accent, tickColor]);
  mats.face.emissiveIntensity = glow;

  const R = 0.075;
  const D = 0.042;
  const hourA = -((hours % 12) / 12) * Math.PI * 2;
  const minA = -(((minutes ?? hours * 60) % 60) / 60) * Math.PI * 2;
  const secA = -((hours * 3600) % 60) / 60 * Math.PI * 2;
  // ring: fast rattle + small hop
  const shake = ring * Math.sin(t * 95) * 0.06;
  const hop = ring * Math.abs(Math.sin(t * 47)) * 0.004;
  const hammer = ring * Math.sin(t * 120) * 0.5;

  const ticks = useMemo(() => Array.from({ length: 12 }, (_, i) => i), []);
  const bellGeo = useMemo(() => new THREE.SphereGeometry(0.034, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), []);
  const rimGeo = useMemo(() => new THREE.TorusGeometry(R, 0.007, 24, 96), []);
  const bodyGeo = useMemo(() => new THREE.CylinderGeometry(R, R, D, 96, 1), []);

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <group position={[0, hop, 0]} rotation={[0, 0, shake]}>
        <group position={[0, R + 0.012, 0]}>
          {/* body (axis along z) */}
          <mesh geometry={bodyGeo} material={mats.metal} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow />
          <mesh geometry={rimGeo} material={mats.metal} position={[0, 0, D / 2]} castShadow />
          <mesh position={[0, 0, D / 2 + 0.0005]} material={mats.face}>
            <circleGeometry args={[R - 0.004, 96]} />
          </mesh>
          {ticks.map((i) => {
            const a = (i / 12) * Math.PI * 2;
            const big = i % 3 === 0;
            return (
              <mesh key={i} material={mats.tick} position={[Math.sin(a) * (R - 0.014), Math.cos(a) * (R - 0.014), D / 2 + 0.002]} rotation={[0, 0, -a]}>
                <boxGeometry args={[big ? 0.004 : 0.0022, big ? 0.014 : 0.008, 0.002]} />
              </mesh>
            );
          })}
          {/* hands */}
          <group position={[0, 0, D / 2 + 0.004]}>
            <group rotation={[0, 0, hourA]}>
              <mesh material={mats.hand} position={[0, 0.018, 0]}>
                <boxGeometry args={[0.0055, 0.04, 0.002]} />
              </mesh>
            </group>
            <group rotation={[0, 0, minA]}>
              <mesh material={mats.hand} position={[0, 0.026, 0.002]}>
                <boxGeometry args={[0.0035, 0.056, 0.002]} />
              </mesh>
            </group>
            <group rotation={[0, 0, secA]}>
              <mesh material={mats.accent} position={[0, 0.02, 0.004]}>
                <boxGeometry args={[0.0014, 0.066, 0.0015]} />
              </mesh>
            </group>
            <mesh material={mats.accent} position={[0, 0, 0.005]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.0045, 0.0045, 0.004, 24]} />
            </mesh>
          </group>
          <mesh material={mats.glass} position={[0, 0, D / 2 + 0.001 - R * 1.6 * Math.cos(0.67)]} rotation={[Math.PI / 2, 0, 0]}>
            <sphereGeometry args={[R * 1.6, 64, 16, 0, Math.PI * 2, 0, 0.67]} />
          </mesh>
          {bells && (
            <>
              {[-1, 1].map((s) => (
                <group key={s} position={[s * 0.045, R * 0.86, 0]} rotation={[0, 0, -s * 0.55]}>
                  <mesh geometry={bellGeo} material={mats.metal} castShadow />
                  <mesh material={mats.dark} position={[0, 0.036, 0]}>
                    <sphereGeometry args={[0.005, 16, 8]} />
                  </mesh>
                </group>
              ))}
              <group position={[0, R + 0.02, 0]} rotation={[0, 0, hammer]}>
                <mesh material={mats.dark} position={[0, 0.012, 0]}>
                  <cylinderGeometry args={[0.0018, 0.0018, 0.026, 8]} />
                </mesh>
                <mesh material={mats.dark} position={[0, 0.026, 0]}>
                  <sphereGeometry args={[0.005, 16, 8]} />
                </mesh>
              </group>
              {/* legs */}
              {[-1, 1].map((s) => (
                <mesh key={s} material={mats.dark} position={[s * 0.048, -R - 0.004, 0]} rotation={[0, 0, s * 0.4]}>
                  <cylinderGeometry args={[0.004, 0.006, 0.022, 12]} />
                </mesh>
              ))}
            </>
          )}
        </group>
      </group>
    </group>
  );
};
