import React, { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { lerp } from "./util";
import { RoomLook, WINDOW } from "./Bedroom";

export type Cam = { pos: [number, number, number]; target: [number, number, number]; fov: number; roll?: number };

/** Places the default camera from a pure camera description every frame. */
export const CameraRig: React.FC<{ cam: Cam }> = ({ cam }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useLayoutEffect(() => {
    camera.position.set(...cam.pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(new THREE.Vector3(...cam.target));
    if (cam.roll) camera.rotateZ(cam.roll);
    camera.fov = cam.fov;
    camera.near = 0.01;
    camera.far = 200;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  });
  return null;
};

/** One-time PMREM of three's RoomEnvironment: soft, neutral reflections everywhere. */
export const Env: React.FC<{ intensity: number; background?: string }> = ({ intensity, background }) => {
  const { gl, scene } = useThree();
  const env = useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const tex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    return tex;
  }, [gl]);
  useLayoutEffect(() => {
    scene.environment = env;
    scene.environmentIntensity = intensity;
    scene.background = background ? new THREE.Color(background) : null;
  });
  return null;
};

const skyMat = () =>
  new THREE.ShaderMaterial({
    uniforms: { day: { value: 0 }, sun: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `
      varying vec2 vUv; uniform float day; uniform float sun;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      void main(){
        vec3 nTop=vec3(0.02,0.04,0.11), nBot=vec3(0.09,0.12,0.24);
        vec3 dTop=vec3(0.45,0.66,0.92), dBot=vec3(0.98,0.86,0.70);
        vec3 col=mix(mix(nBot,nTop,vUv.y), mix(dBot,dTop,pow(vUv.y,0.8)), day);
        // moon (night) and sun glow (day)
        vec2 mp=vec2(0.36,0.74); float md=length((vUv-mp)*vec2(1.6,1.0));
        col+= (1.0-day)*(smoothstep(0.055,0.05,md)*vec3(0.95,0.95,0.9) + exp(-md*9.0)*vec3(0.25,0.3,0.45));
        vec2 sp=vec2(0.5,0.35); float sd=length((vUv-sp)*vec2(1.6,1.0));
        col+= sun*(exp(-sd*5.0)*vec3(1.0,0.75,0.45)*1.4 + smoothstep(0.06,0.05,sd)*vec3(1.2));
        // distant city lights low in the frame
        vec2 g=floor(vUv*vec2(140.0,60.0)); float r=h(g);
        float lights=step(0.965,r)*step(vUv.y,0.3)*(1.0-day);
        col+= lights*vec3(1.0,0.75,0.45)*0.8;
        // stars
        col+= (1.0-day)*step(0.996,h(floor(vUv*vec2(400.0,300.0))))*step(0.4,vUv.y)*0.7;
        gl_FragColor=vec4(col,1.0);
      }`,
    toneMapped: false,
  });

export const RoomLights: React.FC<{ look: RoomLook }> = ({ look }) => {
  const mat = useMemo(skyMat, []);
  mat.uniforms.day.value = look.day;
  mat.uniforms.sun.value = look.sun;
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0.2, 0.4, -1.3);
    return o;
  }, []);
  const d = look.day;
  const keyColor = new THREE.Color("#7f9dff").lerp(new THREE.Color("#e3ecff"), d).lerp(new THREE.Color("#ffcf8f"), look.sun);
  const keyI = lerp(2.2, 3.2, d) + look.sun * 5;
  return (
    <>
      <hemisphereLight args={[new THREE.Color("#22345c").lerp(new THREE.Color("#e6eef8"), d), new THREE.Color("#0c0e14").lerp(new THREE.Color("#8d8275"), d), lerp(0.35, 1.1, d)]} />
      <primitive object={target} />
      <directionalLight
        position={[7, 3.6 + look.sun * 0.6, WINDOW.z + 0.3]}
        target={target}
        color={keyColor}
        intensity={keyI}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
        shadow-camera-near={1}
        shadow-camera-far={16}
      />
      {/* soft fill from the room side so faces never go flat black */}
      <directionalLight position={[-3, 2.5, 2.5]} intensity={lerp(0.25, 0.7, d)} color={d > 0.5 ? "#fff3e6" : "#4a5f8f"} />
      <mesh position={[7.5, 1.6, WINDOW.z]} rotation={[0, -Math.PI / 2, 0]} material={mat}>
        <planeGeometry args={[14, 7]} />
      </mesh>
    </>
  );
};
