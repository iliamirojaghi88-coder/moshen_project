// A procedural photo studio, baked once into a PMREM environment map.
// Soft cool-grey cyclorama with four softboxes: a broad overhead key, a tall
// strip on each side (the right one hot, for the long highlights that run down
// the copper strands) and a low front fill. No image files to download.
import {
  BackSide,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  PlaneGeometry,
  Scene,
  SphereGeometry,
} from 'three';

function softbox(w, h, intensity, tint, position, rotation) {
  const colour = new Color(tint).multiplyScalar(intensity);
  const mesh = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: colour, side: DoubleSide }));
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  return mesh;
}

export function createStudioEnvironment(renderer) {
  const scene = new Scene();

  const roomGeo = new SphereGeometry(30, 48, 24);
  const pos = roomGeo.attributes.position;
  const colours = [];
  const top = new Color('#d9e1ec');
  const horizon = new Color('#9aa5b5');
  const floor = new Color('#3b4250');
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 30;
    if (y > 0) c.copy(horizon).lerp(top, Math.pow(y, 0.8));
    else c.copy(horizon).lerp(floor, Math.pow(-y, 0.6));
    colours.push(c.r * 0.7, c.g * 0.7, c.b * 0.7);
  }
  roomGeo.setAttribute('color', new Float32BufferAttribute(colours, 3));
  scene.add(new Mesh(roomGeo, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));

  scene.add(softbox(12, 7, 4.5, '#ffffff', [0, 12, 3], [Math.PI / 2, 0, 0]));
  scene.add(softbox(2.2, 16, 9, '#fff6ee', [12, 1, 2], [0, -Math.PI / 2, 0]));
  scene.add(softbox(1.6, 14, 3.5, '#eef4ff', [-12, 2, -2], [0, Math.PI / 2, 0]));
  scene.add(softbox(16, 4, 1.4, '#f4f7fb', [0, -2, 13], [0, Math.PI, 0]));
  scene.add(softbox(9, 2.4, 5, '#e8f0ff', [0, 5, -13], [0, 0, 0]));

  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.035);
  pmrem.dispose();
  scene.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
  return target.texture;
}
