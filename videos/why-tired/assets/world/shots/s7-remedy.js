// SCENE 07 — "حالا چیکار کنی؟ سعی کن ساعت خواب و بیدارشدنت منظم باشه، محیط
// خوابت تاریک و آروم باشه و صبح نور طبیعی دریافت کنی." (48.2 → 58.7)
// Back in the bedroom, three remedies in one continuous move:
//  1. regularity — the clock: a sleep-window arc (۲۳ → ۷) draws on the dial
//     and the seconds hand ticks in an even, metronomic rhythm;
//  2. dark & calm — lamp, phone, door gap and standby LED switch off one by
//     one on the words; the room settles into moonlight;
//  3. morning light — the sky warms to gold and real sun shafts stream through
//     the window across the bed.
import { THREE, seg, ease, lerp, clamp, track, lookFrom, setShadow, smooth, hash } from "../engine.js";
import { makeBedroom } from "../bedroom.js";
import { makeClock, setClockTime, CLOCK } from "../props.js";
import { dust } from "../fx.js";
import { TEAL, AMBER } from "./s3-brain.js";

const BEAM_FS = `
uniform float strength; uniform vec3 color; varying vec2 vUv; varying float vSide;
void main(){
  float along = vUv.y;                       // 0 at the window, 1 far end
  float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
  float a = strength * edge * (1.0 - along) * (1.0 - along) * smoothstep(0.0, 0.08, along);
  gl_FragColor = vec4(color * a, 1.0);
}`;
const BEAM_VS = `varying vec2 vUv; varying float vSide; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export default async function build({ E, M }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010204);
  const room = await makeBedroom(E, M);
  scene.add(room.root);
  room.movePhone(-2.69, 0.1); // phone sits beside the clock in this scene
  // a soft cool practical so the clock reads in the close-up (the wall shades it from the moon)
  const clockFill = new THREE.SpotLight(0xa9bcff, 0, 2.5, 0.5, 0.8, 2);
  clockFill.position.set(-0.55, 1.15, -0.9);
  clockFill.target.position.set(-1.2, 0.6, -1.62);
  scene.add(clockFill, clockFill.target);
  const phoneBuzz = room.byName.phone;
  const envNight = E.studioEnv({ ambient: 0x03050a, panels: [{ pos: [-6, 3, 1], size: [3, 4], color: 0x9fb7ff, intensity: 1.4 }] });
  const envDay = E.studioEnv({
    ambient: 0x1a140e,
    panels: [
      { pos: [-6, 2.5, 0.5], size: [3, 4], color: 0xffd9a8, intensity: 5 },
      { pos: [3, 6, 2], size: [5, 3], color: 0xdfe8ff, intensity: 1.5 },
    ],
  });
  scene.environment = envNight;

  const clock = makeClock(E, M);
  clock.position.set(-1.2, 0.595, -1.6);
  clock.rotation.set(-0.06, 0.32, 0);
  scene.add(clock);
  // sleep-window arc on the dial (23:00 → 07:00), drawn on "منظم"
  const arcMat = new THREE.MeshStandardMaterial({ color: 0x041513, emissive: TEAL, emissiveIntensity: 0, transparent: true, opacity: 1 });
  const arcStart = (23 / 12) * Math.PI * 2;
  const arcLen = (8 / 12) * Math.PI * 2;
  let arcGeo = null;
  const arc = new THREE.Mesh(new THREE.BufferGeometry(), arcMat);
  arc.position.z = 0.0009;
  clock.userData.body.add(arc);
  const setArc = (p) => {
    const g = new THREE.RingGeometry(CLOCK.R * 0.955, CLOCK.R * 0.985, 128, 1, Math.PI / 2 - arcStart - arcLen * p, arcLen * p);
    arc.geometry.dispose();
    arc.geometry = g;
  };

  // lights
  const moon = setShadow(new THREE.DirectionalLight(0xaec3ff, 1.4), 2048, 2.8, 0.5, 14, 8, -0.0006);
  moon.position.set(-6.5, 4.6, 1.6);
  moon.target.position.set(-0.2, 0.4, -0.6);
  scene.add(moon, moon.target);
  const sun = setShadow(new THREE.DirectionalLight(0xffc27a, 0), 2048, 2.8, 0.5, 16, 5, -0.0006);
  sun.position.set(-7.5, 3.4, 2.4);
  sun.target.position.set(0, 0.3, -0.7);
  scene.add(sun, sun.target);
  const fill = new THREE.HemisphereLight(0x2a3b5c, 0x07080b, 0.45);
  scene.add(fill);
  const bounce = new THREE.PointLight(0xffb070, 0, 6, 2);
  bounce.position.set(-0.6, 1.2, -0.4);
  scene.add(bounce);

  // sun shafts through the window opening (additive prisms)
  const beams = new THREE.Group();
  const beamMat = new THREE.ShaderMaterial({
    vertexShader: BEAM_VS, fragmentShader: BEAM_FS,
    uniforms: { strength: { value: 0 }, color: { value: new THREE.Color(1.0, 0.72, 0.4) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const dir = new THREE.Vector3().subVectors(sun.target.position, sun.position).normalize();
  const panes = [[-0.75, 0.05, 0.75, 1.6], [0.1, 1.0, 0.75, 1.6], [-0.75, 0.05, 1.67, 2.35], [0.1, 1.0, 1.67, 2.35]];
  const BL = 3.4;
  const beamList = panes.map(([z0, z1, y0, y1]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), beamMat);
    m.userData.start = new THREE.Vector3(-2.31, (y0 + y1) / 2, (z0 + z1) / 2);
    m.userData.w = Math.max(z1 - z0, y1 - y0) * 0.95;
    m.renderOrder = 5;
    m.frustumCulled = false;
    beams.add(m);
    return m;
  });
  // each shaft is a quad turned about its own axis to face the camera
  const orientBeams = () => {
    for (const m of beamList) {
      const c = m.userData.start.clone().addScaledVector(dir, BL / 2);
      const toCam = camera.position.clone().sub(c);
      const n = toCam.sub(dir.clone().multiplyScalar(toCam.dot(dir))).normalize();
      const x = new THREE.Vector3().crossVectors(dir, n).normalize();
      m.position.copy(c);
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, dir, n));
      m.scale.set(m.userData.w, BL, 1);
    }
  };
  scene.add(beams);
  const motes = dust(700, new THREE.Box3(new THREE.Vector3(-2.2, 0.3, -1.2), new THREE.Vector3(0.6, 2.3, 1.2)), { size: 0.006, color: 0xffe2b8, opacity: 0, seed: 31 });
  scene.add(motes);

  const camera = new THREE.PerspectiveCamera(48, 1080 / 1920, 0.01, 30);
  const keys = [
    [48.2, 1.45, 1.6, 2.15, -0.3, 0.62, -0.9, 50],
    [49.5, 0.7, 1.15, 0.6, -0.8, 0.62, -1.3, 46],
    [50.4, -0.98, 0.72, -1.1, -1.2, 0.63, -1.62, 36],
    [52.9, -1.03, 0.7, -1.2, -1.2, 0.62, -1.62, 36],
    [53.6, -0.42, 1.0, -0.62, -1.3, 0.66, -1.65, 46],
    [55.8, -0.36, 1.04, -0.5, -1.3, 0.66, -1.65, 46],
    [56.7, 0.5, 1.5, 1.55, -1.7, 1.05, -0.2, 54],
    [58.7, 0.42, 1.58, 1.7, -1.8, 1.08, -0.15, 54],
  ];

  function update(t) {
    const k = track(keys, t);
    camera.fov = k[6];
    camera.updateProjectionMatrix();
    lookFrom(camera, [k[0], k[1], k[2]], [k[3], k[4], k[5]]);

    // 1 — regular, metronomic seconds (one tick per second, quick settle)
    const sec = Math.floor(t * 1.0);
    const frac = t - sec;
    const tick = sec + ease.backOut(clamp(frac / 0.12));
    const hours = 22.95 + tick / 3600;
    setClockTime(clock, hours, 7);
    clock.userData.hands.second.rotation.z = -((tick % 60) / 60) * Math.PI * 2;
    const arcP = seg(t, 50.3, 52.6, ease.inOut);
    if (arcP > 0.001) setArc(arcP);
    arc.visible = arcP > 0.001;
    arcMat.emissiveIntensity = 2.2 * seg(t, 50.3, 50.7) * (1 - 0.4 * seg(t, 53.2, 54));
    clock.userData.mats.lume.emissiveIntensity = 0.6 * (1 - seg(t, 55.5, 57.0));

    // 2 — distractions on, then off one by one
    const on = seg(t, 52.95, 53.4);
    const off = (tt) => 1 - seg(t, tt, tt + 0.18);
    const lamp = on * off(53.72);
    const phone = on * off(54.27);
    const led = on * off(54.85);
    room.practicals({ lamp_l: lamp, lamp_r: 0, phone, door: 0, led: led + 0.0 });
    // the phone buzzes with notifications until it goes dark
    const buzz = phone * (Math.sin(t * 2 * Math.PI * 1.4) > 0.55 ? 1 : 0);
    phoneBuzz.rotation.y = buzz * 0.03 * Math.sin(t * 2 * Math.PI * 23);
    clockFill.intensity = 1.6 * seg(t, 49.4, 50.2) * (1 - seg(t, 55.3, 56.2)) * (1 - 0.6 * lamp);

    // 3 — sunrise through the window
    const dawn = seg(t, 55.9, 57.9, ease.inOut);
    const blue = 1 - seg(t, 48.2, 50.0) * 0.4;
    room.sky.uniforms.top.value.setRGB(lerp(0.012, 0.35, dawn), lerp(0.02, 0.45, dawn), lerp(0.05, 0.62, dawn));
    room.sky.uniforms.horizon.value.setRGB(lerp(0.03, 1.6, dawn), lerp(0.05, 0.9, dawn), lerp(0.1, 0.42, dawn));
    room.sky.uniforms.sun.value = dawn;
    sun.intensity = 5.5 * dawn;
    moon.intensity = 1.4 * (1 - dawn) * blue;
    bounce.intensity = 0.9 * dawn;
    fill.color.setRGB(lerp(0.16, 0.5, dawn), lerp(0.23, 0.42, dawn), lerp(0.36, 0.34, dawn));
    fill.intensity = lerp(0.45, 0.6, dawn);
    scene.environment = dawn > 0.5 ? envDay : envNight;
    scene.environmentIntensity = dawn > 0.5 ? lerp(0.0, 0.55, (dawn - 0.5) * 2) : 0.2 * (1 - dawn * 2) + 0.02;
    beamMat.uniforms.strength.value = 0.45 * dawn;
    beams.visible = dawn > 0.001;
    if (beams.visible) orientBeams();
    motes.material.opacity = 0.55 * dawn;
    motes.userData.update(t);

    const closeOnClock = t > 49.9 && t < 53.4;
    return {
      exposure: lerp(1.05, 1.05, dawn) + 0.1 * lamp,
      wb: [lerp(0.92, 1.06, dawn), lerp(0.97, 1.0, dawn), lerp(1.1, 0.9, dawn)],
      sat: lerp(0.95, 1.08, dawn),
      contrast: 1.08,
      vig: 0.55,
      bloom: { strength: 0.45 + 0.15 * dawn, radius: 0.6, threshold: 1.5 },
      dof: { focus: closeOnClock ? camera.position.distanceTo(clock.position) : camera.position.distanceTo(new THREE.Vector3(-0.3, 0.6, -0.9)), aperture: closeOnClock ? 10 : 4, maxR: 10 },
    };
  }
  return { id: "s7", t0: 48.2, t1: 58.7, scene, camera, update, transition: { mode: 3, blur: 3, ease: ease.inOut } };
}
