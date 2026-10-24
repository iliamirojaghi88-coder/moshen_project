import React from "react";
import { ThreeCanvas } from "@remotion/three";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

type Props = {
  color?: string;
  /** Renders a glTF scene instead of the placeholder knot when provided. */
  children?: React.ReactNode;
};

// Studio turntable: key/fill/rim lights, contact shadow plane, frame-driven
// orbit. Rotation comes from useCurrentFrame() only, so renders are deterministic.
export const StudioObject: React.FC<Props> = ({ color = "#b3121f", children }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = frame / fps;
  const enter = interpolate(frame, [0, 18], [0.6, 1], { extrapolateRight: "clamp" });

  return (
    <ThreeCanvas width={width} height={height} camera={{ fov: 30, position: [0, 0.6, 12] }}>
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 5]} intensity={2.4} castShadow />
      <directionalLight position={[-5, 2, -3]} intensity={1.2} color="#ffd9c0" />
      <pointLight position={[0, -2, 3]} intensity={6} color="#ffffff" />
      <group rotation={[0.25, t * 0.8, 0]} scale={enter}>
        {children ?? (
          <mesh castShadow>
            <torusKnotGeometry args={[0.9, 0.3, 256, 48]} />
            <meshPhysicalMaterial color={color} roughness={0.25} clearcoat={1} clearcoatRoughness={0.1} />
          </mesh>
        )}
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.6, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <shadowMaterial opacity={0.25} />
      </mesh>
    </ThreeCanvas>
  );
};
