// Small deterministic effects shared by shots.
import { THREE, hash } from "./engine.js";

// Dust motes drifting in a light beam: positions are a pure function of t.
export function dust(count, box, { size = 0.004, color = 0xbfd0ff, opacity = 0.5, seed = 1 } = {}) {
  const geo = new THREE.BufferGeometry();
  const base = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    base[i * 3] = box.min.x + hash(i * 3.1 + seed) * (box.max.x - box.min.x);
    base[i * 3 + 1] = box.min.y + hash(i * 5.7 + seed) * (box.max.y - box.min.y);
    base[i * 3 + 2] = box.min.z + hash(i * 9.3 + seed) * (box.max.z - box.min.z);
  }
  geo.setAttribute("position", new THREE.BufferAttribute(base.slice(), 3));
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.35, "rgba(255,255,255,0.35)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const mat = new THREE.PointsMaterial({
    size, map: new THREE.CanvasTexture(c), color, transparent: true, opacity,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.update = (t) => {
    const p = geo.attributes.position.array;
    const h = box.max.y - box.min.y;
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      p[k] = base[k] + 0.02 * Math.sin(t * 0.21 + i) + 0.006 * t * (hash(i) - 0.5);
      p[k + 1] = box.min.y + ((base[k + 1] - box.min.y + t * 0.004 * (0.3 + hash(i * 2.2))) % h);
      p[k + 2] = base[k + 2] + 0.02 * Math.cos(t * 0.17 + i * 1.3);
    }
    geo.attributes.position.needsUpdate = true;
  };
  return pts;
}

// Ghost copies of a mesh at earlier poses: a cheap, deterministic motion blur
// for fast-spinning parts (clock hands). setAngles(list) sets each ghost.
export function ghosts(mesh, n = 6, opacity = 0.32) {
  const group = new THREE.Group();
  const list = [];
  for (let i = 0; i < n; i++) {
    const m = mesh.clone();
    m.material = mesh.material.clone();
    m.material.transparent = true;
    m.material.depthWrite = false;
    m.material.opacity = opacity * (1 - i / n);
    m.castShadow = false;
    const pivot = new THREE.Group();
    pivot.add(m);
    group.add(pivot);
    list.push(pivot);
  }
  group.userData.set = (angles, strength = 1) =>
    list.forEach((p, i) => {
      p.rotation.z = angles[i] ?? 0;
      p.visible = strength > 0.02;
      p.children[0].material.opacity = opacity * (1 - i / n) * strength;
    });
  return group;
}
