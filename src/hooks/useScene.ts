import { useCallback, useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Tween, Easing, update as tweenUpdate } from "@tweenjs/tween.js";

export interface SystemBodyConfig {
  primaryColor: string;
  secondaryColor: string;
  primaryRadius: number;
  secondaryRadius: number;
  secondaryDistance: number;
  primaryName: string;
  secondaryName: string;
  showRings: boolean;
  primaryScenePos?: [number, number, number];
  secondaryScenePos?: [number, number, number];
}

const MU = 0.01215058560962404;
const DEFAULT_CAM_POS = { x: 0, y: -2.5, z: 1.2 } as const;
const DEFAULT_CAM_TARGET = new THREE.Vector3(0.5, 0, 0);

export interface TrajectoryMeta {
  id: string;
  label: string;
  color: string;
  itemType?: PlottedItemType;
  family?: string;
  familyKey?: string;
  period?: number;
  periodDays?: number;
  jacobi?: number;
  stability?: number;
  libr?: number | null;
  branch?: string | null;
  orbitIndex?: number;
  pointCount: number;
  object: THREE.Mesh;
  serializable?: Record<string, unknown>;
}

export type PlottedItemType =
  | "orbit"
  | "family"
  | "stable-manifold"
  | "unstable-manifold"
  | "mission"
  | "custom-trajectory"
  | "marker";

export interface PlottedSceneItem {
  id: string;
  name: string;
  type: PlottedItemType;
  color: string;
  visible: boolean;
  sourceKey?: string;
  serializable?: Record<string, unknown>;
}

export interface BackgroundPlanetConfig {
  name: string;
  color: string;
  position: [number, number, number];
  visualRadius: number;
}

export interface FamilyOrbitInput {
  trajectory: [number, number, number][];
  jacobi: number;
  period_tu: number;
  period_days: number;
  stability: number;
  index: number;
}

export interface HighlightedOrbitInfo {
  jacobi: number;
  period_tu: number;
  period_days: number;
  stability: number;
}

export interface SceneAPI {
  addTrajectory(
    points: [number, number, number][],
    color: string,
    label: string,
    metadata?: {
      family?: string;
      familyKey?: string;
      period?: number;
      periodDays?: number;
      jacobi?: number;
      stability?: number;
      libr?: number | null;
      branch?: string | null;
      orbitIndex?: number;
      itemType?: PlottedItemType;
      sourceKey?: string;
      serializable?: Record<string, unknown>;
    },
  ): string;
  addManifoldTubes(
    tubes: [number, number, number][][],
    color: string,
    metadata?: {
      label?: string;
      kind?: "stable" | "unstable";
      sourceKey?: string;
      serializable?: Record<string, unknown>;
    },
  ): string;
  addMarker(position: [number, number, number], color: string, label: string): string;
  addFamilyOrbits(
    orbits: FamilyOrbitInput[],
    baseColor: string,
    jacobiMin: number,
    jacobiMax: number,
    familyKey: string,
  ): void;
  clearFamily(familyKey: string): void;
  highlightByJacobi(jacobi: number, familyKey?: string): HighlightedOrbitInfo | null;
  getMedianOrbit(): { familyKey: string; orbitIndex: number } | null;
  setMissionSelectHighlight(selectedIds: string[]): void;
  getPlottedItems(): PlottedSceneItem[];
  removePlottedItem(id: string): void;
  setPlottedItemVisible(id: string, visible: boolean): void;
  clearTrajectories(): void;
  clearHoverPreviews(): void;
  setHoverPreviewFamilies(
    previews: Array<{
      familyKey: string;
      label: string;
      color: string;
      orbitIndex: number;
      trajectory: [number, number, number][];
    }>,
    options?: { pinned?: boolean },
  ): void;
  resetCamera(): void;
  getCameraState(): {
    position: [number, number, number];
    target: [number, number, number];
    zoom: number;
  } | null;
  showLagrangePoints(show: boolean): void;
  animateSpacecraft(path: [number, number, number][], duration: number): void;
  stopSpacecraft(): void;
  setCameraView(position: [number, number, number], target: [number, number, number]): void;
  updateSystemBodies(config: SystemBodyConfig): void;
  updateLagrangePoints(points: {
    L1: [number, number, number];
    L2: [number, number, number];
    L3: [number, number, number];
    L4: [number, number, number];
    L5: [number, number, number];
  }): void;
  setBackgroundPlanets(planets: BackgroundPlanetConfig[]): void;
}

interface SceneOptions {
  onTrajectoryClick?: (meta: TrajectoryMeta) => void;
  onSceneItemsChange?: (items: PlottedSceneItem[]) => void;
  onHoverTargetChange?: (target: string | null) => void;
  onPreviewAnchorClick?: (target: string) => void;
  onPreviewFamilyClick?: (familyKey: string, orbitIndex: number) => void;
  onEmptySceneClick?: () => void;
}

interface ParticleTrack {
  meshes: THREE.Mesh[];
  points: THREE.Vector3[];
  totalLength: number;
}

function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = "#FFFF00";
  ctx.font = "bold 28px Space Mono, monospace";
  ctx.textAlign = "center";
  ctx.fillText(text, 64, 40);
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.15, 0.075, 1);
  return sprite;
}

export function useScene(
  containerRef: RefObject<HTMLDivElement | null>,
  options?: SceneOptions,
): SceneAPI {
  // Core Three.js refs
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const threeSceneRef = useRef<THREE.Scene | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameRef = useRef<number>(0);

  // Shared clock — outside the effect so animateSpacecraft can read elapsed time
  const clockRef = useRef(new THREE.Clock());

  // Scene object refs
  const lagrangeGroupRef = useRef<THREE.Group | null>(null);
  const backgroundPlanetsRef = useRef<THREE.Group | null>(null);
  const hoverPreviewGroupRef = useRef<THREE.Group | null>(null);
  const trajGroupRef = useRef<Map<string, THREE.Object3D[]>>(new Map());
  const particleTracksRef = useRef<Map<string, ParticleTrack>>(new Map());
  const registryRef = useRef<Map<string, TrajectoryMeta>>(new Map());
  const itemRegistryRef = useRef<Map<string, PlottedSceneItem>>(new Map());
  const familyItemChildrenRef = useRef<Map<string, Set<string>>>(new Map());
  const idRef = useRef(0);

  // Family orbit refs (for Jacobi slider highlighting and mission selection)
  interface FamilyOrbitEntry {
    id: string;
    mesh: THREE.Mesh;
    mat: THREE.MeshPhongMaterial;
    jacobi: number;
    period_tu: number;
    period_days: number;
    stability: number;
    index: number;
    familyKey: string;
  }
  const familyOrbitsRef = useRef<FamilyOrbitEntry[]>([]);

  // Currently selected mesh (click highlight)
  const selectedMeshRef = useRef<THREE.Mesh | null>(null);

  // Spacecraft animation refs
  const spacecraftRef = useRef<THREE.Mesh | null>(null);
  const spacecraftPathRef = useRef<[number, number, number][]>([]);
  const spacecraftStartRef = useRef<number>(0);
  const spacecraftDurRef = useRef<number>(0);
  const spacecraftActiveRef = useRef<boolean>(false);

  // Stable ref so the click listener (created once) always calls the latest callback
  const onClickRef = useRef(options?.onTrajectoryClick);
  const onSceneItemsChangeRef = useRef(options?.onSceneItemsChange);
  const onHoverTargetChangeRef = useRef(options?.onHoverTargetChange);
  const onPreviewAnchorClickRef = useRef(options?.onPreviewAnchorClick);
  const onPreviewFamilyClickRef = useRef(options?.onPreviewFamilyClick);
  const onEmptySceneClickRef = useRef(options?.onEmptySceneClick);
  useEffect(() => {
    onClickRef.current = options?.onTrajectoryClick;
  }, [options?.onTrajectoryClick]);

  useEffect(() => {
    onSceneItemsChangeRef.current = options?.onSceneItemsChange;
  }, [options?.onSceneItemsChange]);
  useEffect(() => {
    onHoverTargetChangeRef.current = options?.onHoverTargetChange;
  }, [options?.onHoverTargetChange]);
  useEffect(() => {
    onPreviewAnchorClickRef.current = options?.onPreviewAnchorClick;
  }, [options?.onPreviewAnchorClick]);
  useEffect(() => {
    onPreviewFamilyClickRef.current = options?.onPreviewFamilyClick;
  }, [options?.onPreviewFamilyClick]);
  useEffect(() => {
    onEmptySceneClickRef.current = options?.onEmptySceneClick;
  }, [options?.onEmptySceneClick]);

  const emitItemsChange = useCallback(() => {
    onSceneItemsChangeRef.current?.(Array.from(itemRegistryRef.current.values()));
  }, []);

  const disposeObject = useCallback((obj: THREE.Object3D) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
      obj.geometry?.dispose();
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((m) => (m as THREE.Material).dispose());
    }
  }, []);

  const removeObjectGroup = useCallback(
    (id: string) => {
      const scene = threeSceneRef.current;
      if (!scene) return;
      (trajGroupRef.current.get(id) ?? []).forEach((obj) => {
        scene.remove(obj);
        disposeObject(obj);
        if (obj === selectedMeshRef.current) selectedMeshRef.current = null;
      });
      trajGroupRef.current.delete(id);
      particleTracksRef.current.delete(id);
      registryRef.current.delete(id);
    },
    [disposeObject],
  );

  const upsertItem = useCallback(
    (item: PlottedSceneItem) => {
      itemRegistryRef.current.set(item.id, item);
      emitItemsChange();
    },
    [emitItemsChange],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── Renderer ───────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.5;
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ── Scene ──────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    threeSceneRef.current = scene;

    // ── Camera ─────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.001,
      1000,
    );
    camera.position.set(DEFAULT_CAM_POS.x, DEFAULT_CAM_POS.y, DEFAULT_CAM_POS.z);
    camera.lookAt(DEFAULT_CAM_TARGET);
    cameraRef.current = camera;

    // ── OrbitControls ──────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.copy(DEFAULT_CAM_TARGET);
    controls.update();
    controlsRef.current = controls;

    // ── Post-processing (bloom — non-negotiable per rulebook §6.3) ─────────
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.8, 0.1),
    );
    composerRef.current = composer;

    // ── Starfield ─────────────────────────────────────────────────────────
    const starPositions = new Float32Array(5000 * 3);
    for (let i = 0; i < 5000; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 50;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    scene.add(
      new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({ color: 0xffffff, size: 0.03, sizeAttenuation: true }),
      ),
    );

    const backgroundPlanets = new THREE.Group();
    backgroundPlanets.name = "backgroundPlanetDecoration";
    backgroundPlanetsRef.current = backgroundPlanets;
    scene.add(backgroundPlanets);

    const hoverPreviews = new THREE.Group();
    hoverPreviews.name = "hoverOrbitPreviews";
    hoverPreviewGroupRef.current = hoverPreviews;
    scene.add(hoverPreviews);

    // ── Lighting ───────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(5, 3, 5);
    scene.add(dirLight);

    // ── Earth ─────────────────────────────────────────────────────────────
    const earthMat = new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 60 });
    const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 32), earthMat);
    earthMesh.name = "primaryBody";
    earthMesh.userData.hoverTarget = "Earth";
    earthMesh.position.set(-MU, 0, 0);
    scene.add(earthMesh);
    new THREE.TextureLoader().load(
      "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg",
      (tex) => {
        earthMat.map = tex;
        earthMat.needsUpdate = true;
      },
      undefined,
      () => {
        /* keep fallback blue */
      },
    );
    earthMesh.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.105, 32, 32),
        new THREE.MeshPhongMaterial({
          color: 0x4488ff,
          transparent: true,
          opacity: 0.08,
          side: THREE.BackSide,
        }),
      ),
    );

    // ── Reference plane (Earth-Moon orbital plane at z=0) ─────────────────
    // const planeGeo = new THREE.CircleGeometry(2.0, 64);
    // const planeMat = new THREE.MeshBasicMaterial({
    //   color: 0x334455,
    //   transparent: true,
    //   opacity: 0.08,
    //   side: THREE.DoubleSide,
    //   depthWrite: false,
    // });
    // scene.add(new THREE.Mesh(planeGeo, planeMat));

    // ── Moon ──────────────────────────────────────────────────────────────
    const moonMat = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, shininess: 20 });
    const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(0.038, 24, 24), moonMat);
    moonMesh.name = "secondaryBody";
    moonMesh.userData.hoverTarget = "Moon";
    moonMesh.position.set(1 - MU, 0, 0);
    scene.add(moonMesh);
    new THREE.TextureLoader().load(
      "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/moon_1024.jpg",
      (texture) => {
        moonMesh.material = new THREE.MeshPhongMaterial({ map: texture, bumpScale: 10 });
      },
    );

    // ── Lagrange markers L1–L5 ─────────────────────────────────────────────
    const lagrangeGroup = new THREE.Group();
    lagrangeGroup.visible = false;
    lagrangeGroupRef.current = lagrangeGroup;
    const lgData: [string, number, number, number][] = [
      ["L1", 0.8369, 0, 0],
      ["L2", 1.1557, 0, 0],
      ["L3", -1.0051, 0, 0],
      ["L4", 0.5 - MU, Math.sqrt(3) / 2, 0],
      ["L5", 0.5 - MU, -Math.sqrt(3) / 2, 0],
    ];
    const lgGeo = new THREE.SphereGeometry(0.015, 10, 10);
    for (const [name, x, y, z] of lgData) {
      const sphere = new THREE.Mesh(
        lgGeo,
        new THREE.MeshPhongMaterial({
          color: 0xffff00,
          emissive: new THREE.Color(0xffff00),
          emissiveIntensity: 0.8,
          shininess: 0,
        }),
      );
      sphere.userData.hoverTarget = name;
      const label = makeLabel(name);
      label.position.set(0, 0.05, 0);
      const group = new THREE.Group();
      group.name = `LP_${name}`;
      group.userData.hoverTarget = name;
      group.position.set(x, y, z);
      group.add(sphere, label);
      lagrangeGroup.add(group);
    }
    scene.add(lagrangeGroup);

    // ── Spacecraft mesh ────────────────────────────────────────────────────
    const spacecraft = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    spacecraft.visible = false;
    scene.add(spacecraft);
    spacecraftRef.current = spacecraft;

    // ── Click raycaster ────────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 0.02 };

    function anchorTargetFromMouse(mouse: THREE.Vector2): string | null {
      raycaster.setFromCamera(mouse, camera);
      const hoverables: THREE.Object3D[] = [];
      const primary = scene.getObjectByName("primaryBody");
      const secondary = scene.getObjectByName("secondaryBody");
      if (primary) hoverables.push(primary);
      if (secondary) hoverables.push(secondary);
      if (lagrangeGroupRef.current?.visible) hoverables.push(lagrangeGroupRef.current);
      const hits = raycaster.intersectObjects(hoverables, true);
      return (hits[0]?.object.userData.hoverTarget ??
        hits[0]?.object.parent?.userData.hoverTarget ??
        null) as string | null;
    }

    function setHoveredPreviewFamily(familyKey: string | null) {
      const group = hoverPreviewGroupRef.current;
      if (!group) return;
      group.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh) || obj.userData.previewPickProxy) return;
        const mat = obj.material as THREE.MeshPhongMaterial;
        const baseOpacity = (obj.userData.previewBaseOpacity as number | undefined) ?? 0.22;
        const isHovered = familyKey != null && obj.userData.familyKey === familyKey;
        mat.opacity = isHovered ? Math.min(baseOpacity + 0.32, 0.72) : baseOpacity;
        if (mat.emissive) mat.emissive.setHex(isHovered ? 0xffffff : 0x000000);
        mat.emissiveIntensity = isHovered ? 0.18 : 0;
      });
    }

    function onCanvasClick(e: MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        ((e.clientY - rect.top) / rect.height) * -2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);
      const previewHits = hoverPreviewGroupRef.current
        ? raycaster.intersectObjects(hoverPreviewGroupRef.current.children, true)
        : [];
      if (previewHits.length > 0) {
        const previewObj = previewHits[0].object;
        const familyKey = previewObj.userData.familyKey as string | undefined;
        const orbitIndex = previewObj.userData.orbitIndex as number | undefined;
        if (familyKey) onPreviewFamilyClickRef.current?.(familyKey, orbitIndex ?? 0);
        return;
      }

      const anchorTarget = anchorTargetFromMouse(mouse);
      if (anchorTarget) {
        onPreviewAnchorClickRef.current?.(anchorTarget);
        return;
      }

      const meshes = Array.from(registryRef.current.values()).map((r) => r.object);
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        const hitObj = hits[0].object as THREE.Mesh;
        const hitId = hitObj.userData.id as string | undefined;
        const meta = hitId ? registryRef.current.get(hitId) : undefined;

        // Restore previous selection
        if (selectedMeshRef.current && selectedMeshRef.current !== hitObj) {
          const prevMesh = selectedMeshRef.current;
          const prevMat = prevMesh.material as THREE.MeshPhongMaterial;
          if (prevMat.emissive) prevMat.emissive.setHex(0x000000);
          prevMat.emissiveIntensity = 0;
          prevMat.opacity = (prevMesh.userData.restingOpacity as number | undefined) ?? 1.0;
        }

        // Highlight clicked mesh
        const mat = hitObj.material as THREE.MeshPhongMaterial;
        if (mat.emissive) mat.emissive.setHex(0xffffff);
        mat.emissiveIntensity = 0.4;
        mat.opacity = 1.0;
        if (!mat.transparent) {
          mat.transparent = true;
        }
        selectedMeshRef.current = hitObj;

        if (meta) onClickRef.current?.(meta);
        return;
      }

      onEmptySceneClickRef.current?.();
    }
    renderer.domElement.addEventListener("click", onCanvasClick);

    let lastHoverTarget: string | null = null;
    function onCanvasMove(e: MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        ((e.clientY - rect.top) / rect.height) * -2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);
      const previewHits = hoverPreviewGroupRef.current
        ? raycaster.intersectObjects(hoverPreviewGroupRef.current.children, true)
        : [];
      const previewFamily = previewHits[0]?.object.userData.familyKey as string | undefined;
      setHoveredPreviewFamily(previewFamily ?? null);

      const hoverables: THREE.Object3D[] = [];
      const primary = scene.getObjectByName("primaryBody");
      const secondary = scene.getObjectByName("secondaryBody");
      if (primary) hoverables.push(primary);
      if (secondary) hoverables.push(secondary);
      if (lagrangeGroupRef.current?.visible) hoverables.push(lagrangeGroupRef.current);
      const hits = raycaster.intersectObjects(hoverables, true);
      const nextTarget = (hits[0]?.object.userData.hoverTarget ??
        hits[0]?.object.parent?.userData.hoverTarget ??
        null) as string | null;
      if (nextTarget !== lastHoverTarget) {
        lastHoverTarget = nextTarget;
        onHoverTargetChangeRef.current?.(nextTarget);
      }
    }
    renderer.domElement.addEventListener("mousemove", onCanvasMove);

    // ── Render loop ────────────────────────────────────────────────────────
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      const elapsed = clockRef.current.getElapsedTime();

      tweenUpdate();

      // Particle animation
      particleTracksRef.current.forEach(({ meshes, points, totalLength }) => {
        if (totalLength === 0 || points.length < 2) return;
        const n = meshes.length;
        for (let idx = 0; idx < n; idx++) {
          const frac = (elapsed / 8 + idx / n) % 1;
          const target = frac * totalLength;
          let acc = 0;
          for (let i = 0; i < points.length - 1; i++) {
            const segLen = points[i].distanceTo(points[i + 1]);
            if (acc + segLen >= target) {
              const t = segLen > 0 ? (target - acc) / segLen : 0;
              meshes[idx].position.lerpVectors(points[i], points[i + 1], t);
              break;
            }
            acc += segLen;
          }
        }
      });

      // Spacecraft animation
      if (spacecraftActiveRef.current && spacecraftRef.current) {
        const scElapsed = clockRef.current.getElapsedTime() - spacecraftStartRef.current;
        const path = spacecraftPathRef.current;
        const dur = spacecraftDurRef.current;
        if (path.length > 1) {
          // dur * 8: one non-dim TU ≈ 8 real seconds of animation
          const t = Math.min(scElapsed / (dur * 8), 1.0);
          const rawIdx = t * (path.length - 1);
          const idx = Math.floor(rawIdx);
          const frac = rawIdx - idx;
          if (idx >= path.length - 1) {
            const last = path[path.length - 1];
            spacecraftRef.current.position.set(last[0], last[1], last[2]);
            spacecraftActiveRef.current = false;
          } else {
            const p0 = path[idx];
            const p1 = path[idx + 1];
            spacecraftRef.current.position.set(
              p0[0] + frac * (p1[0] - p0[0]),
              p0[1] + frac * (p1[1] - p0[1]),
              p0[2] + frac * (p1[2] - p0[2]),
            );
          }
        }
      }

      controls.update();
      composer.render();
    }
    animate();

    // ── Resize handler ─────────────────────────────────────────────────────
    function onResize() {
      const w = window.innerWidth,
        h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("click", onCanvasClick);
      renderer.domElement.removeEventListener("mousemove", onCanvasMove);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      trajGroupRef.current.forEach((objects) => {
        objects.forEach((obj) => {
          disposeObject(obj);
        });
      });
      trajGroupRef.current.clear();
      particleTracksRef.current.clear();
      registryRef.current.clear();
      itemRegistryRef.current.clear();
      familyItemChildrenRef.current.clear();
      spacecraftRef.current = null;
      spacecraftActiveRef.current = false;
      rendererRef.current = null;
      composerRef.current = null;
      cameraRef.current = null;
      threeSceneRef.current = null;
      controlsRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Public API ─────────────────────────────────────────────────────────────

  const addTrajectory = useCallback(
    (
      points: [number, number, number][],
      color: string,
      label: string,
      metadata?: {
        family?: string;
        familyKey?: string;
        period?: number;
        periodDays?: number;
        jacobi?: number;
        stability?: number;
        libr?: number | null;
        branch?: string | null;
        orbitIndex?: number;
        itemType?: PlottedItemType;
        sourceKey?: string;
        serializable?: Record<string, unknown>;
      },
    ): string => {
      const scene = threeSceneRef.current;
      if (!scene || points.length < 2) return "";
      const id = `traj_${++idRef.current}`;
      const verts = points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
      const curve = new THREE.CatmullRomCurve3(verts);
      const tubeGeo = new THREE.TubeGeometry(
        curve,
        Math.min(points.length * 3, 600),
        0.005,
        6,
        false,
      );
      const tube = new THREE.Mesh(
        tubeGeo,
        new THREE.MeshPhongMaterial({
          color: new THREE.Color(color),
          emissive: new THREE.Color(0x000000),
          emissiveIntensity: 0,
        }),
      );
      tube.userData = { id, restingOpacity: 1.0 };
      scene.add(tube);
      let totalLength = 0;
      for (let i = 0; i < verts.length - 1; i++) totalLength += verts[i].distanceTo(verts[i + 1]);
      const pGeo = new THREE.SphereGeometry(0.008, 6, 6);
      const pMat = new THREE.MeshBasicMaterial({ color: 0xff6b35 });
      const meshes: THREE.Mesh[] = [];
      for (let i = 0; i < 8; i++) {
        const p = new THREE.Mesh(pGeo, pMat);
        p.position.copy(verts[0]);
        scene.add(p);
        meshes.push(p);
      }
      trajGroupRef.current.set(id, [tube, ...meshes]);
      particleTracksRef.current.set(id, { meshes, points: verts, totalLength });
      registryRef.current.set(id, {
        id,
        label,
        color,
        itemType: metadata?.itemType,
        family: metadata?.family,
        familyKey: metadata?.familyKey,
        period: metadata?.period,
        periodDays: metadata?.periodDays,
        jacobi: metadata?.jacobi,
        stability: metadata?.stability,
        libr: metadata?.libr,
        branch: metadata?.branch,
        orbitIndex: metadata?.orbitIndex,
        pointCount: points.length,
        object: tube,
        serializable: metadata?.serializable,
      });
      const itemType = metadata?.itemType ?? "orbit";
      upsertItem({
        id,
        name: label,
        type: itemType,
        color,
        visible: true,
        sourceKey: metadata?.sourceKey ?? metadata?.familyKey ?? metadata?.family,
        serializable: metadata?.serializable,
      });
      return id;
    },
    [upsertItem],
  );

  const addManifoldTubes = useCallback(
    (
      tubes: [number, number, number][][],
      color: string,
      metadata?: {
        label?: string;
        kind?: "stable" | "unstable";
        sourceKey?: string;
        serializable?: Record<string, unknown>;
      },
    ): string => {
      const scene = threeSceneRef.current;
      if (!scene) return "";
      const id = `manifold_${++idRef.current}`;
      const objects: THREE.Object3D[] = [];
      for (const tubePts of tubes) {
        if (tubePts.length < 2) continue;
        const verts = tubePts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
        const curve = new THREE.CatmullRomCurve3(verts);
        const geo = new THREE.TubeGeometry(
          curve,
          Math.min(tubePts.length * 2, 200),
          0.002,
          4,
          false,
        );
        const mat = new THREE.MeshPhongMaterial({
          color: new THREE.Color(color),
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData = { id, restingOpacity: 0.45 };
        scene.add(mesh);
        objects.push(mesh);
      }
      trajGroupRef.current.set(id, objects);
      if (objects[0] instanceof THREE.Mesh) {
        registryRef.current.set(id, {
          id,
          label:
            metadata?.label ??
            (metadata?.kind === "stable"
              ? "Stable manifold"
              : metadata?.kind === "unstable"
                ? "Unstable manifold"
                : "Manifold"),
          color,
          itemType: metadata?.kind === "stable" ? "stable-manifold" : "unstable-manifold",
          familyKey:
            typeof metadata?.serializable?.sourceFamilyKey === "string"
              ? metadata.serializable.sourceFamilyKey
              : metadata?.sourceKey,
          orbitIndex:
            typeof metadata?.serializable?.orbitIndex === "number"
              ? metadata.serializable.orbitIndex
              : undefined,
          pointCount: tubes.reduce((sum, tube) => sum + tube.length, 0),
          object: objects[0],
          serializable: metadata?.serializable,
        });
      }
      upsertItem({
        id,
        name:
          metadata?.label ??
          (metadata?.kind === "stable"
            ? "Stable manifold"
            : metadata?.kind === "unstable"
              ? "Unstable manifold"
              : "Manifold"),
        type: metadata?.kind === "stable" ? "stable-manifold" : "unstable-manifold",
        color,
        visible: true,
        sourceKey: metadata?.sourceKey,
        serializable: metadata?.serializable,
      });
      return id;
    },
    [upsertItem],
  );

  const addMarker = useCallback(
    (position: [number, number, number], color: string, label: string): string => {
      const scene = threeSceneRef.current;
      if (!scene) return "";
      const id = `marker_${++idRef.current}`;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 16, 16),
        new THREE.MeshPhongMaterial({
          color: new THREE.Color(color),
          emissive: new THREE.Color(color),
          emissiveIntensity: 0.45,
        }),
      );
      mesh.position.set(position[0], position[1], position[2]);
      scene.add(mesh);
      trajGroupRef.current.set(id, [mesh]);
      upsertItem({ id, name: label, type: "marker", color, visible: true });
      return id;
    },
    [upsertItem],
  );

  const clearTrajectories = useCallback(() => {
    const scene = threeSceneRef.current;
    if (!scene) return;
    Array.from(trajGroupRef.current.keys()).forEach(removeObjectGroup);
    trajGroupRef.current.clear();
    particleTracksRef.current.clear();
    registryRef.current.clear();
    itemRegistryRef.current.clear();
    familyItemChildrenRef.current.clear();
    familyOrbitsRef.current = [];
    selectedMeshRef.current = null;
    // Stop any active spacecraft animation
    spacecraftActiveRef.current = false;
    if (spacecraftRef.current) spacecraftRef.current.visible = false;
    emitItemsChange();
  }, [emitItemsChange, removeObjectGroup]);

  const getPlottedItems = useCallback(() => Array.from(itemRegistryRef.current.values()), []);

  const setPlottedItemVisible = useCallback(
    (id: string, visible: boolean) => {
      const familyChildren = familyItemChildrenRef.current.get(id);
      const ids = familyChildren ? Array.from(familyChildren) : [id];
      for (const childId of ids) {
        (trajGroupRef.current.get(childId) ?? []).forEach((obj) => {
          obj.visible = visible;
        });
        const meta = registryRef.current.get(childId);
        if (meta) meta.object.visible = visible;
      }
      const item = itemRegistryRef.current.get(id);
      if (item) itemRegistryRef.current.set(id, { ...item, visible });
      emitItemsChange();
    },
    [emitItemsChange],
  );

  const removePlottedItem = useCallback(
    (id: string) => {
      if (familyItemChildrenRef.current.has(id)) {
        const familyKey = itemRegistryRef.current.get(id)?.sourceKey ?? id;
        const scene = threeSceneRef.current;
        if (!scene) return;
        const idsToRemove = Array.from(familyItemChildrenRef.current.get(id) ?? []);
        idsToRemove.forEach(removeObjectGroup);
        familyItemChildrenRef.current.delete(id);
        familyOrbitsRef.current = familyOrbitsRef.current.filter((e) => e.familyKey !== familyKey);
        itemRegistryRef.current.delete(id);
      } else {
        removeObjectGroup(id);
        itemRegistryRef.current.delete(id);
      }
      emitItemsChange();
    },
    [emitItemsChange, removeObjectGroup],
  );

  const clearHoverPreviews = useCallback(() => {
    const group = hoverPreviewGroupRef.current;
    if (!group) return;
    for (const obj of [...group.children]) {
      group.remove(obj);
      disposeObject(obj);
    }
  }, [disposeObject]);

  const setHoverPreviewFamilies = useCallback(
    (
      previews: Array<{
        familyKey: string;
        label: string;
        color: string;
        orbitIndex: number;
        trajectory: [number, number, number][];
      }>,
      options?: { pinned?: boolean },
    ) => {
      const group = hoverPreviewGroupRef.current;
      if (!group) return;
      clearHoverPreviews();
      const baseOpacity = options?.pinned ? 0.36 : 0.22;
      const tubeRadius = options?.pinned ? 0.005 : 0.004;
      for (const preview of previews) {
        if (preview.trajectory.length < 2) continue;
        const verts = preview.trajectory.map(([x, y, z]) => new THREE.Vector3(x, y, z));
        const curve = new THREE.CatmullRomCurve3(verts);
        const geo = new THREE.TubeGeometry(
          curve,
          Math.min(preview.trajectory.length * 2, 240),
          tubeRadius,
          6,
          false,
        );
        const mat = new THREE.MeshPhongMaterial({
          color: new THREE.Color(preview.color),
          emissive: new THREE.Color(0x000000),
          emissiveIntensity: 0,
          transparent: true,
          opacity: baseOpacity,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData = {
          familyKey: preview.familyKey,
          orbitIndex: preview.orbitIndex,
          label: preview.label,
          previewBaseOpacity: baseOpacity,
        };
        const pickGeo = new THREE.TubeGeometry(
          curve,
          Math.min(preview.trajectory.length * 2, 160),
          tubeRadius * 2.8,
          5,
          false,
        );
        const pickMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(preview.color),
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
        const pickMesh = new THREE.Mesh(pickGeo, pickMat);
        pickMesh.userData = {
          familyKey: preview.familyKey,
          orbitIndex: preview.orbitIndex,
          label: preview.label,
          previewPickProxy: true,
        };
        group.add(mesh, pickMesh);
      }
    },
    [clearHoverPreviews],
  );

  const setBackgroundPlanets = useCallback(
    (planets: BackgroundPlanetConfig[]) => {
      const group = backgroundPlanetsRef.current;
      if (!group) return;
      for (const obj of [...group.children]) {
        group.remove(obj);
        disposeObject(obj);
      }
      for (const planet of planets) {
        const mat = new THREE.MeshPhongMaterial({
          color: new THREE.Color(planet.color),
          transparent: true,
          opacity: 0.78,
          shininess: 10,
        });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(planet.visualRadius, 32, 16), mat);
        mesh.name = `backgroundPlanet:${planet.name}`;
        mesh.position.set(...planet.position);
        mesh.userData.decorativeOnly = true;
        group.add(mesh);
      }
    },
    [disposeObject],
  );

  const setMissionSelectHighlight = useCallback((selectedIds: string[]) => {
    const entries = familyOrbitsRef.current;
    if (entries.length > 0) {
      for (const e of entries) {
        if (selectedIds.length === 0) {
          e.mat.opacity = 0.7;
        } else {
          e.mat.opacity = selectedIds.includes(e.id) ? 1.0 : 0.15;
        }
      }
    } else {
      // Fallback for regular trajectories (non-family)
      for (const [id, meta] of registryRef.current) {
        const mat = meta.object.material as THREE.Material & {
          opacity?: number;
          transparent?: boolean;
        };
        if (mat.transparent !== undefined) {
          mat.transparent = true;
          mat.opacity = selectedIds.length === 0 ? 1.0 : selectedIds.includes(id) ? 1.0 : 0.2;
        }
      }
    }
  }, []);

  const addFamilyOrbits = useCallback(
    (
      orbits: FamilyOrbitInput[],
      baseColor: string,
      jacobiMin: number,
      jacobiMax: number,
      familyKey: string,
    ): void => {
      const scene = threeSceneRef.current;
      if (!scene || orbits.length === 0) return;
      if (familyItemChildrenRef.current.has(familyKey)) {
        setPlottedItemVisible(familyKey, true);
        return;
      }

      const base = new THREE.Color(baseColor);
      const white = new THREE.Color(0xffffff);
      const range = jacobiMax - jacobiMin;
      const childIds = new Set<string>();

      for (const orb of orbits) {
        if (orb.trajectory.length < 2) continue;
        const t = range > 0 ? (orb.jacobi - jacobiMin) / range : 0.5;
        const col = new THREE.Color().lerpColors(base, white, t * 0.6);
        const verts = orb.trajectory.map(([x, y, z]) => new THREE.Vector3(x, y, z));
        const curve = new THREE.CatmullRomCurve3(verts);
        const geo = new THREE.TubeGeometry(
          curve,
          Math.min(orb.trajectory.length * 2, 600),
          0.005,
          6,
          false,
        );
        const mat = new THREE.MeshPhongMaterial({
          color: col,
          emissive: new THREE.Color(0x000000),
          emissiveIntensity: 0,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        const id = `family_${++idRef.current}`;
        mesh.userData = {
          id,
          restingOpacity: 0.7,
          familyKey,
          orbitIndex: orb.index,
          jacobi: orb.jacobi,
          period_tu: orb.period_tu,
          period_days: orb.period_days,
          stability: orb.stability,
        };
        scene.add(mesh);
        trajGroupRef.current.set(id, [mesh]);
        childIds.add(id);
        registryRef.current.set(id, {
          id,
          label: `${familyKey} · C ${orb.jacobi.toFixed(3)}`,
          color: `#${col.getHexString()}`,
          itemType: "orbit",
          familyKey,
          family: familyKey.split("_")[0],
          period: orb.period_tu,
          periodDays: orb.period_days,
          jacobi: orb.jacobi,
          stability: orb.stability,
          orbitIndex: orb.index,
          pointCount: orb.trajectory.length,
          object: mesh,
          serializable: { kind: "familyOrbit", familyKey, orbitIndex: orb.index },
        });
        familyOrbitsRef.current.push({
          id,
          mesh,
          mat,
          jacobi: orb.jacobi,
          period_tu: orb.period_tu,
          period_days: orb.period_days,
          stability: orb.stability,
          index: orb.index,
          familyKey,
        });
      }
      if (childIds.size > 0) {
        familyItemChildrenRef.current.set(familyKey, childIds);
        upsertItem({
          id: familyKey,
          name: familyKey,
          type: "family",
          color: baseColor,
          visible: true,
          sourceKey: familyKey,
          serializable: { kind: "family", familyKey },
        });
      }
    },
    [setPlottedItemVisible, upsertItem],
  );

  const highlightByJacobi = useCallback(
    (jacobi: number, familyKey?: string): HighlightedOrbitInfo | null => {
      const entries = familyOrbitsRef.current;
      if (entries.length === 0) return null;
      const pool = familyKey ? entries.filter((e) => e.familyKey === familyKey) : entries;
      if (pool.length === 0) return null;
      let closest = pool[0];
      let minDiff = Math.abs(pool[0].jacobi - jacobi);
      for (const e of pool) {
        const d = Math.abs(e.jacobi - jacobi);
        if (d < minDiff) {
          minDiff = d;
          closest = e;
        }
      }
      for (const e of entries) {
        e.mat.opacity = e === closest ? 1.0 : 0.15;
      }
      return {
        jacobi: closest.jacobi,
        period_tu: closest.period_tu,
        period_days: closest.period_days,
        stability: closest.stability,
      };
    },
    [],
  );

  const clearFamily = useCallback(
    (familyKey: string): void => {
      const idsToRemove = new Set<string>(familyItemChildrenRef.current.get(familyKey) ?? []);
      for (const [id, meta] of registryRef.current) {
        if (meta.familyKey === familyKey) idsToRemove.add(id);
      }
      idsToRemove.forEach(removeObjectGroup);
      familyItemChildrenRef.current.delete(familyKey);
      itemRegistryRef.current.delete(familyKey);
      familyOrbitsRef.current = familyOrbitsRef.current.filter((e) => e.familyKey !== familyKey);
      emitItemsChange();
    },
    [emitItemsChange, removeObjectGroup],
  );

  const getMedianOrbit = useCallback((): { familyKey: string; orbitIndex: number } | null => {
    const entries = familyOrbitsRef.current;
    if (entries.length === 0) return null;
    const mid = entries[Math.floor(entries.length / 2)];
    return { familyKey: mid.familyKey, orbitIndex: mid.index };
  }, []);

  const resetCamera = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const fromPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    new Tween(fromPos)
      .to({ ...DEFAULT_CAM_POS }, 1200)
      .easing(Easing.Cubic.InOut)
      .onUpdate(() => {
        camera.position.set(fromPos.x, fromPos.y, fromPos.z);
        controls.update();
      })
      .start();
    const fromTarget = { x: controls.target.x, y: controls.target.y, z: controls.target.z };
    new Tween(fromTarget)
      .to({ x: DEFAULT_CAM_TARGET.x, y: DEFAULT_CAM_TARGET.y, z: DEFAULT_CAM_TARGET.z }, 1200)
      .easing(Easing.Cubic.InOut)
      .onUpdate(() => {
        controls.target.set(fromTarget.x, fromTarget.y, fromTarget.z);
        controls.update();
      })
      .start();
  }, []);

  const getCameraState = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return null;
    return {
      position: [camera.position.x, camera.position.y, camera.position.z] as [
        number,
        number,
        number,
      ],
      target: [controls.target.x, controls.target.y, controls.target.z] as [number, number, number],
      zoom: camera.zoom,
    };
  }, []);

  const showLagrangePoints = useCallback((show: boolean) => {
    if (lagrangeGroupRef.current) lagrangeGroupRef.current.visible = show;
  }, []);

  const animateSpacecraft = useCallback((path: [number, number, number][], duration: number) => {
    if (!spacecraftRef.current || path.length === 0) return;
    spacecraftPathRef.current = path;
    spacecraftDurRef.current = duration;
    spacecraftStartRef.current = clockRef.current.getElapsedTime();
    spacecraftActiveRef.current = true;
    spacecraftRef.current.visible = true;
    spacecraftRef.current.position.set(path[0][0], path[0][1], path[0][2]);
  }, []);

  const stopSpacecraft = useCallback(() => {
    spacecraftActiveRef.current = false;
    if (spacecraftRef.current) spacecraftRef.current.visible = false;
  }, []);

  const setCameraView = useCallback(
    (position: [number, number, number], target: [number, number, number]) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      const fromPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
      new Tween(fromPos)
        .to({ x: position[0], y: position[1], z: position[2] }, 1200)
        .easing(Easing.Cubic.InOut)
        .onUpdate(() => {
          camera.position.set(fromPos.x, fromPos.y, fromPos.z);
          controls.update();
        })
        .start();
      const fromTarget = { x: controls.target.x, y: controls.target.y, z: controls.target.z };
      new Tween(fromTarget)
        .to({ x: target[0], y: target[1], z: target[2] }, 1200)
        .easing(Easing.Cubic.InOut)
        .onUpdate(() => {
          controls.target.set(fromTarget.x, fromTarget.y, fromTarget.z);
          controls.update();
        })
        .start();
    },
    [],
  );

  const updateSystemBodies = useCallback((config: SystemBodyConfig) => {
    const scene = threeSceneRef.current;
    if (!scene) return;

    const primary = scene.getObjectByName("primaryBody");
    if (primary instanceof THREE.Mesh) {
      (primary.material as THREE.MeshPhongMaterial).color.set(config.primaryColor);
      primary.scale.setScalar(config.primaryRadius / 0.1);
      if (config.primaryScenePos) primary.position.set(...config.primaryScenePos);
    }

    const secondary = scene.getObjectByName("secondaryBody");
    if (secondary instanceof THREE.Mesh) {
      (secondary.material as THREE.MeshPhongMaterial).color.set(config.secondaryColor);
      secondary.scale.setScalar(config.secondaryRadius / 0.038);
      const secPos =
        config.secondaryScenePos ?? ([config.secondaryDistance, 0, 0] as [number, number, number]);
      secondary.position.set(...secPos);
    }

    const existingRings = scene.getObjectByName("saturnRings");
    if (existingRings) scene.remove(existingRings);
    if (config.showRings) {
      const primaryPos = primary?.position ?? new THREE.Vector3(-MU, 0, 0);
      const ringGeo = new THREE.RingGeometry(
        config.primaryRadius * 1.3,
        config.primaryRadius * 2.2,
        64,
      );
      const ringMat = new THREE.MeshBasicMaterial({
        color: "#C8A882",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5,
      });
      const rings = new THREE.Mesh(ringGeo, ringMat);
      rings.name = "saturnRings";
      rings.rotation.x = Math.PI / 2;
      rings.position.copy(primaryPos);
      scene.add(rings);
    }
  }, []);

  const updateLagrangePoints = useCallback(
    (points: {
      L1: [number, number, number];
      L2: [number, number, number];
      L3: [number, number, number];
      L4: [number, number, number];
      L5: [number, number, number];
    }) => {
      const scene = threeSceneRef.current;
      if (!scene) return;
      (["L1", "L2", "L3", "L4", "L5"] as const).forEach((name) => {
        const lp = scene.getObjectByName(`LP_${name}`);
        if (lp) {
          const coords = points[name];
          lp.position.set(coords[0], coords[1], coords[2]);
        }
      });
    },
    [],
  );

  return useMemo<SceneAPI>(
    () => ({
      addTrajectory,
      addManifoldTubes,
      addMarker,
      addFamilyOrbits,
      clearFamily,
      highlightByJacobi,
      getMedianOrbit,
      setMissionSelectHighlight,
      getPlottedItems,
      removePlottedItem,
      setPlottedItemVisible,
      clearTrajectories,
      clearHoverPreviews,
      setHoverPreviewFamilies,
      resetCamera,
      getCameraState,
      showLagrangePoints,
      animateSpacecraft,
      stopSpacecraft,
      setCameraView,
      updateSystemBodies,
      updateLagrangePoints,
      setBackgroundPlanets,
    }),
    [
      addTrajectory,
      addManifoldTubes,
      addMarker,
      addFamilyOrbits,
      clearFamily,
      highlightByJacobi,
      getMedianOrbit,
      setMissionSelectHighlight,
      getPlottedItems,
      removePlottedItem,
      setPlottedItemVisible,
      clearTrajectories,
      clearHoverPreviews,
      setHoverPreviewFamilies,
      resetCamera,
      getCameraState,
      showLagrangePoints,
      animateSpacecraft,
      stopSpacecraft,
      setCameraView,
      updateSystemBodies,
      updateLagrangePoints,
      setBackgroundPlanets,
    ],
  );
}
