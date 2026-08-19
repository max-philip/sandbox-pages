// src/pages/Dice.tsx
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import styles from './Dice.module.scss';
import {
  buildDie,
  numberTexture,
  highlightTexture,
  faceDecalQuaternion,
  DIE_OPTIONS,
  type DieSides,
  type DieBuild,
} from '../lib/dice';

const TRAY_HALF = 3;
const WALL_HEIGHT = 1.6;
const SETTLE_FRAMES = 12;
const SETTLE_LIN_SQ = 0.02;
const SETTLE_ANG_SQ = 0.02;
const ROLL_TIMEOUT_MS = 4000;
const PRESENT_DURATION_MS = 700;
const PRESENT_TARGET = new THREE.Vector3(0, 1.6, 2.6);

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Rotation that turns `faceNormal` (local space) to point along `targetDir` (world
 * space), keeping the face's own decal "up" mapped onto screen-up so the number
 * lands upright — not just any in-plane twist, but the one the decal was drawn with.
 */
function alignFaceToward(faceNormal: THREE.Vector3, targetDir: THREE.Vector3): THREE.Quaternion {
  const worldUp = new THREE.Vector3(0, 1, 0);

  const localZ = faceNormal.clone().normalize();
  const decalQuat = faceDecalQuaternion(localZ);
  const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(decalQuat);
  const localX = new THREE.Vector3().crossVectors(localUp, localZ).normalize();

  const targetZ = targetDir.clone().normalize();
  const targetY = worldUp.clone().sub(targetZ.clone().multiplyScalar(worldUp.dot(targetZ)));
  if (targetY.lengthSq() < 1e-6) targetY.set(0, 0, 1);
  targetY.normalize();
  const targetX = new THREE.Vector3().crossVectors(targetY, targetZ).normalize();

  const localBasis = new THREE.Matrix4().makeBasis(localX, localUp, localZ);
  const targetBasis = new THREE.Matrix4().makeBasis(targetX, targetY, targetZ);
  const rotation = targetBasis.multiply(localBasis.invert());
  return new THREE.Quaternion().setFromRotationMatrix(rotation);
}

// Reference size per die, tuned to roughly fit within one face; decal and
// highlight sizes both scale off this so bigger-faced dice get bigger numbers.
const FACE_SCALE: Record<DieSides, number> = {
  4: 0.52,
  6: 0.5,
  8: 0.4,
  10: 0.36,
  12: 0.34,
  20: 0.24,
};

interface LiveDie {
  group: THREE.Group;
  body: CANNON.Body;
  faces: DieBuild['faces'];
  readFrom: DieBuild['readFrom'];
  presented: boolean;
  highlights: Map<number, THREE.MeshBasicMaterial>;
}

interface PresentAnim {
  active: boolean;
  start: number;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromQuat: THREE.Quaternion;
  toQuat: THREE.Quaternion;
}

function disposeGroup(group: THREE.Group) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of materials) {
        const withMap = mat as THREE.Material & { map?: THREE.Texture | null };
        withMap.map?.dispose();
        mat.dispose();
      }
    }
  });
}

export default function Dice() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const worldRef = useRef<CANNON.World | null>(null);
  const dieMaterialRef = useRef<CANNON.Material | null>(null);
  const liveDieRef = useRef<LiveDie | null>(null);
  const settleCounterRef = useRef(0);
  const rollStartRef = useRef(0);
  const rollingRef = useRef(false);
  const presentRef = useRef<PresentAnim>({
    active: false,
    start: 0,
    fromPos: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    fromQuat: new THREE.Quaternion(),
    toQuat: new THREE.Quaternion(),
  });

  const [sides, setSides] = useState<DieSides>(6);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  const spawnDie = (value: DieSides) => {
    const scene = sceneRef.current;
    const world = worldRef.current;
    const dieMaterial = dieMaterialRef.current;
    if (!scene || !world || !dieMaterial) return;

    if (liveDieRef.current) {
      scene.remove(liveDieRef.current.group);
      disposeGroup(liveDieRef.current.group);
      world.removeBody(liveDieRef.current.body);
    }
    presentRef.current.active = false;

    const build = buildDie(value);
    const group = new THREE.Group();

    const color = new THREE.Color().setHSL(Math.random(), 0.55, 0.6);
    const highlightColor = color.clone().lerp(new THREE.Color(0xffffff), 0.82);
    const mesh = new THREE.Mesh(
      build.geometry,
      new THREE.MeshStandardMaterial({ color, flatShading: false, roughness: 0.35, metalness: 0.08 }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const highlights = new Map<number, THREE.MeshBasicMaterial>();
    const decalSize = FACE_SCALE[value] * 0.85;
    const highlightSize = FACE_SCALE[value] * 1.2;
    const highlightMap = highlightTexture(highlightColor);
    for (const face of build.faces) {
      const decalQuat = faceDecalQuaternion(face.normal);

      const highlightMaterial = new THREE.MeshBasicMaterial({
        map: highlightMap,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      const highlight = new THREE.Mesh(new THREE.PlaneGeometry(highlightSize, highlightSize), highlightMaterial);
      highlight.position.copy(face.centroid).addScaledVector(face.normal, 0.012);
      highlight.quaternion.copy(decalQuat);
      group.add(highlight);
      highlights.set(face.value, highlightMaterial);

      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(decalSize, decalSize),
        new THREE.MeshBasicMaterial({
          map: numberTexture(face.value),
          transparent: true,
          depthTest: true,
          polygonOffset: true,
          polygonOffsetFactor: -4,
        }),
      );
      decal.position.copy(face.centroid).addScaledVector(face.normal, 0.018);
      decal.quaternion.copy(decalQuat);
      group.add(decal);
    }

    const body = new CANNON.Body({
      mass: 1,
      shape: build.shape,
      material: dieMaterial,
      position: new CANNON.Vec3((Math.random() - 0.5) * 1.5, 3.5, (Math.random() - 0.5) * 1.5),
      angularDamping: 0.15,
      linearDamping: 0.05,
    });
    body.quaternion.setFromEuler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);

    scene.add(group);
    world.addBody(body);
    liveDieRef.current = { group, body, faces: build.faces, readFrom: build.readFrom, presented: false, highlights };
  };

  const spawnDieRef = useRef(spawnDie);
  spawnDieRef.current = spawnDie;

  // One-time scene/world/render-loop setup.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
    camera.position.set(0, 6.5, 6.8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.shadowMap.enabled = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(4, 8, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -4;
    scene.add(ambient, key);

    const trayMaterialThree = new THREE.MeshStandardMaterial({ color: 0x17171a, roughness: 0.9 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(TRAY_HALF * 2, TRAY_HALF * 2), trayMaterialThree);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -18, 0) });
    world.broadphase = new CANNON.SAPBroadphase(world);
    worldRef.current = world;

    const dieMaterial = new CANNON.Material('die');
    const trayMaterial = new CANNON.Material('tray');
    dieMaterialRef.current = dieMaterial;
    world.addContactMaterial(new CANNON.ContactMaterial(dieMaterial, trayMaterial, { friction: 0.45, restitution: 0.35 }));

    const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: trayMaterial });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);

    const wallShape = new CANNON.Box(new CANNON.Vec3(TRAY_HALF, WALL_HEIGHT, 0.15));
    const wallDefs: [number, number, number, number][] = [
      [0, WALL_HEIGHT, -TRAY_HALF, 0],
      [0, WALL_HEIGHT, TRAY_HALF, Math.PI],
      [-TRAY_HALF, WALL_HEIGHT, 0, Math.PI / 2],
      [TRAY_HALF, WALL_HEIGHT, 0, -Math.PI / 2],
    ];
    for (const [x, y, z, ry] of wallDefs) {
      const wall = new CANNON.Body({ mass: 0, shape: wallShape, material: trayMaterial });
      wall.position.set(x, y, z);
      wall.quaternion.setFromEuler(0, ry, 0);
      world.addBody(wall);
    }

    spawnDieRef.current(sides);

    const resize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const upVec = new THREE.Vector3(0, 1, 0);
    const downVec = new THREE.Vector3(0, -1, 0);
    const worldNormal = new THREE.Vector3();
    const bodyQuat = new THREE.Quaternion();

    let frameId: number;
    const clock = new THREE.Clock();

    const tick = () => {
      frameId = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 1 / 30);
      world.step(1 / 60, dt, 5);

      const live = liveDieRef.current;
      if (live) {
        const anim = presentRef.current;
        if (anim.active) {
          const t = Math.min((performance.now() - anim.start) / PRESENT_DURATION_MS, 1);
          const e = easeOutCubic(t);
          live.group.position.lerpVectors(anim.fromPos, anim.toPos, e);
          live.group.quaternion.slerpQuaternions(anim.fromQuat, anim.toQuat, e);
          if (t >= 1) anim.active = false;
        } else if (!live.presented) {
          live.group.position.copy(live.body.position as unknown as THREE.Vector3);
          bodyQuat.set(live.body.quaternion.x, live.body.quaternion.y, live.body.quaternion.z, live.body.quaternion.w);
          live.group.quaternion.copy(bodyQuat);

          if (rollingRef.current) {
            const linSq = live.body.velocity.lengthSquared();
            const angSq = live.body.angularVelocity.lengthSquared();
            const timedOut = performance.now() - rollStartRef.current > ROLL_TIMEOUT_MS;
            if ((linSq < SETTLE_LIN_SQ && angSq < SETTLE_ANG_SQ) || timedOut) {
              settleCounterRef.current += 1;
            } else {
              settleCounterRef.current = 0;
            }

            if (settleCounterRef.current > SETTLE_FRAMES || timedOut) {
              rollingRef.current = false;
              let best = live.faces[0];
              let bestDot = -Infinity;
              const target = live.readFrom === 'up' ? upVec : downVec;
              for (const face of live.faces) {
                worldNormal.copy(face.normal).applyQuaternion(bodyQuat);
                const dot = worldNormal.dot(target);
                if (dot > bestDot) {
                  bestDot = dot;
                  best = face;
                }
              }
              setResult(best.value);
              setRolling(false);

              world.removeBody(live.body);
              live.presented = true;
              const winningHighlight = live.highlights.get(best.value);
              if (winningHighlight) winningHighlight.opacity = 1;
              anim.fromPos.copy(live.group.position);
              anim.fromQuat.copy(live.group.quaternion);
              anim.toPos.copy(PRESENT_TARGET);
              const camDir = new THREE.Vector3().subVectors(camera.position, PRESENT_TARGET).normalize();
              anim.toQuat.copy(alignFaceToward(best.normal, camDir));
              anim.start = performance.now();
              anim.active = true;
            }
          }
        }
      }

      renderer.render(scene, camera);
    };
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      if (liveDieRef.current) {
        disposeGroup(liveDieRef.current.group);
      }
      ground.geometry.dispose();
      trayMaterialThree.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Respawn a resting die whenever the side count changes (but not mid-roll).
  useEffect(() => {
    if (rollingRef.current) return;
    if (!sceneRef.current) return;
    spawnDie(sides);
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sides]);

  const roll = () => {
    if (rolling) return;

    spawnDie(sides);
    const live = liveDieRef.current;
    if (!live) return;

    live.body.velocity.set((Math.random() - 0.5) * 6, 1, (Math.random() - 0.5) * 6);
    live.body.angularVelocity.set(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20,
    );

    settleCounterRef.current = 0;
    rollStartRef.current = performance.now();
    rollingRef.current = true;
    setRolling(true);
    setResult(null);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>dice</h1>
        <p className={styles.sub}>Pick a die, roll it, watch it land.</p>
      </header>

      <div className={styles.layout}>
        <section className={styles.stage}>
          <div className={styles.trayWrap} ref={containerRef} />

          <button className={styles.roll} onClick={roll} disabled={rolling}>
            {rolling ? 'rolling…' : 'roll'}
          </button>

          <div className={styles.result} aria-live="polite">
            {result !== null && <span className={styles.resultValue}>{result}</span>}
          </div>
        </section>

        <section className={styles.panel}>
          <span className={styles.fieldLabel}>Sides</span>
          <div className={styles.sideGrid}>
            {DIE_OPTIONS.map((n) => (
              <button
                key={n}
                className={n === sides ? `${styles.sideBtn} ${styles.active}` : styles.sideBtn}
                onClick={() => setSides(n)}
                disabled={rolling}
              >
                d{n}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
