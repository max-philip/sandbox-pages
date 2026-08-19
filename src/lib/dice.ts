// src/lib/dice.ts
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export type DieSides = 4 | 6 | 8 | 10 | 12 | 20;

export const DIE_OPTIONS: DieSides[] = [4, 6, 8, 10, 12, 20];

export interface DieFace {
  normal: THREE.Vector3;
  centroid: THREE.Vector3;
  value: number;
}

export interface DieBuild {
  geometry: THREE.BufferGeometry;
  shape: CANNON.ConvexPolyhedron | CANNON.Box;
  faces: DieFace[];
  /** Face read as the result: 'up' for dice that land flat-side-up, 'down' for the d4 (numbers read from the resting face). */
  readFrom: 'up' | 'down';
  radius: number;
}

function extractFaces(geometry: THREE.BufferGeometry): DieFace[] {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = nonIndexed.attributes.position;
  const triCount = pos.count / 3;

  const clusters: { normal: THREE.Vector3; points: THREE.Vector3[] }[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  for (let i = 0; i < triCount; i++) {
    a.fromBufferAttribute(pos, i * 3);
    b.fromBufferAttribute(pos, i * 3 + 1);
    c.fromBufferAttribute(pos, i * 3 + 2);
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();

    let cluster = clusters.find((cl) => cl.normal.dot(normal) > 0.99);
    if (!cluster) {
      cluster = { normal, points: [] };
      clusters.push(cluster);
    }
    cluster.points.push(a.clone(), b.clone(), c.clone());
  }

  return clusters.map((cl, i) => ({
    normal: cl.normal,
    centroid: cl.points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(cl.points.length),
    value: i + 1,
  }));
}

function convexShapeFromGeometry(geometry: THREE.BufferGeometry): CANNON.ConvexPolyhedron {
  const pos = geometry.attributes.position;
  const idx = geometry.index?.array ?? null;

  const key = (x: number, y: number, z: number) => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
  const vertMap = new Map<string, number>();
  const vertices: CANNON.Vec3[] = [];
  const remap: number[] = new Array(pos.count);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = key(x, y, z);
    let vi = vertMap.get(k);
    if (vi === undefined) {
      vi = vertices.length;
      vertices.push(new CANNON.Vec3(x, y, z));
      vertMap.set(k, vi);
    }
    remap[i] = vi;
  }

  const faces: number[][] = [];
  if (idx) {
    for (let i = 0; i < idx.length; i += 3) {
      faces.push([remap[idx[i]], remap[idx[i + 1]], remap[idx[i + 2]]]);
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      faces.push([remap[i], remap[i + 1], remap[i + 2]]);
    }
  }

  return new CANNON.ConvexPolyhedron({ vertices, faces });
}

function buildPlatonic(sides: 4 | 8 | 12 | 20, radius: number): DieBuild {
  const geometry =
    sides === 4
      ? new THREE.TetrahedronGeometry(radius)
      : sides === 8
        ? new THREE.OctahedronGeometry(radius)
        : sides === 12
          ? new THREE.DodecahedronGeometry(radius)
          : new THREE.IcosahedronGeometry(radius);

  return {
    geometry,
    shape: convexShapeFromGeometry(geometry),
    faces: extractFaces(geometry),
    readFrom: sides === 4 ? 'down' : 'up',
    radius,
  };
}

function buildBox(radius: number): DieBuild {
  const size = radius * 1.15;
  const geometry = new THREE.BoxGeometry(size, size, size);
  const half = size / 2;

  const faces: DieFace[] = [
    { normal: new THREE.Vector3(1, 0, 0), centroid: new THREE.Vector3(half, 0, 0), value: 1 },
    { normal: new THREE.Vector3(-1, 0, 0), centroid: new THREE.Vector3(-half, 0, 0), value: 6 },
    { normal: new THREE.Vector3(0, 1, 0), centroid: new THREE.Vector3(0, half, 0), value: 2 },
    { normal: new THREE.Vector3(0, -1, 0), centroid: new THREE.Vector3(0, -half, 0), value: 5 },
    { normal: new THREE.Vector3(0, 0, 1), centroid: new THREE.Vector3(0, 0, half), value: 3 },
    { normal: new THREE.Vector3(0, 0, -1), centroid: new THREE.Vector3(0, 0, -half), value: 4 },
  ];

  return {
    geometry,
    shape: new CANNON.Box(new CANNON.Vec3(half, half, half)),
    faces,
    readFrom: 'up',
    radius: size,
  };
}

/** Pentagonal trapezohedron (d10): two apexes plus a 10-point zigzag equatorial belt. */
function buildD10(radius: number): DieBuild {
  const apexHeight = radius * 1.15;
  const beltRadius = radius * 0.92;
  // Ratio that keeps each kite face exactly planar: he/ha = (2 sin36 - sin72) / (2 sin36 + sin72).
  const beltHeight = apexHeight * 0.105572;

  const top = new THREE.Vector3(0, apexHeight, 0);
  const bottom = new THREE.Vector3(0, -apexHeight, 0);
  const belt: THREE.Vector3[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5;
    const y = i % 2 === 0 ? beltHeight : -beltHeight;
    belt.push(new THREE.Vector3(Math.cos(angle) * beltRadius, y, Math.sin(angle) * beltRadius));
  }

  const positions: number[] = [];
  const faces: DieFace[] = [];

  for (let k = 0; k < 10; k++) {
    const apex = k % 2 === 0 ? top : bottom;
    const p0 = belt[k];
    const p1 = belt[(k + 1) % 10];
    const p2 = belt[(k + 2) % 10];

    const centroid = new THREE.Vector3().add(apex).add(p0).add(p1).add(p2).divideScalar(4);
    const normal = new THREE.Vector3().subVectors(p0, apex).cross(new THREE.Vector3().subVectors(p1, apex)).normalize();

    // The zigzag belt winds oppositely depending on which pole the kite is
    // attached to; flip whichever half comes out pointing into the solid.
    const outward = normal.dot(centroid) > 0;
    if (outward) {
      positions.push(apex.x, apex.y, apex.z, p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
      positions.push(apex.x, apex.y, apex.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    } else {
      normal.negate();
      positions.push(apex.x, apex.y, apex.z, p1.x, p1.y, p1.z, p0.x, p0.y, p0.z);
      positions.push(apex.x, apex.y, apex.z, p2.x, p2.y, p2.z, p1.x, p1.y, p1.z);
    }

    faces.push({ normal, centroid, value: k + 1 });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();

  return {
    geometry,
    shape: convexShapeFromGeometry(geometry),
    faces,
    readFrom: 'up',
    radius: apexHeight,
  };
}

/**
 * Blends each triangle's flat normal toward the radial (sphere) direction so
 * lighting softens near edges without changing the underlying geometry —
 * a cheap fake bevel for an otherwise sharp-edged low-poly die.
 */
function softenEdges(geometry: THREE.BufferGeometry, amount: number): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.attributes.position;
  const triCount = pos.count / 3;
  const normals = new Float32Array(pos.count * 3);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const flat = new THREE.Vector3();
  const v = new THREE.Vector3();
  const blended = new THREE.Vector3();

  for (let i = 0; i < triCount; i++) {
    a.fromBufferAttribute(pos, i * 3);
    b.fromBufferAttribute(pos, i * 3 + 1);
    c.fromBufferAttribute(pos, i * 3 + 2);
    flat.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();

    for (let j = 0; j < 3; j++) {
      v.fromBufferAttribute(pos, i * 3 + j).normalize();
      blended.copy(flat).lerp(v, amount).normalize();
      const idx = (i * 3 + j) * 3;
      normals[idx] = blended.x;
      normals[idx + 1] = blended.y;
      normals[idx + 2] = blended.z;
    }
  }

  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return g;
}

export function buildDie(sides: DieSides, radius = 0.75): DieBuild {
  const build = (() => {
    switch (sides) {
      case 4:
        return buildPlatonic(4, radius);
      case 6:
        return buildBox(radius);
      case 8:
        return buildPlatonic(8, radius);
      case 10:
        return buildD10(radius);
      case 12:
        return buildPlatonic(12, radius);
      case 20:
        return buildPlatonic(20, radius);
    }
  })();

  build.geometry = softenEdges(build.geometry, 0.16);
  return build;
}

/** Rotation used to place a face decal/highlight: local +Z maps onto the face normal. */
export function faceDecalQuaternion(normal: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
}

/** Small canvas texture with a centered number, used as a face-label decal. */
export function numberTexture(value: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#12121a';
  ctx.font = `700 ${size * 0.58}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), size / 2, size / 2 + size * 0.03);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Soft radial glow (color fading to transparent), used to tint the winning face when revealed. */
export function highlightTexture(color: THREE.Color): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.95)`);
  gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 0.65)`);
  gradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.1)`);
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
