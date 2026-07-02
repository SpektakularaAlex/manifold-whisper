import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

// L2 Axial orbit — elongated along z, small x-y amplitude, centred on L2 (x≈1.1557)
function makeAxialOrbit(n = 150): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push([
      1.1557 + 0.04 * Math.cos(t),
      0.06 * Math.sin(t) * Math.cos(t * 0.5),
      0.28 * Math.sin(t),
    ]);
  }
  pts.push(pts[0]); // close the loop
  return pts;
}

// Unstable manifold tube — spirals away from the axial orbit
function makeUnstableTube(
  branchIndex: number,
  totalBranches: number,
  n = 100,
): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const startAngle = (branchIndex / totalBranches) * Math.PI * 2;
  const x0 = 1.1557 + 0.04 * Math.cos(startAngle);
  const y0 = 0.06 * Math.sin(startAngle) * Math.cos(startAngle * 0.5);
  const z0 = 0.28 * Math.sin(startAngle);
  const sign = branchIndex % 2 === 0 ? -1 : 1;
  const spreadAngle = (branchIndex / totalBranches) * Math.PI * 2;

  for (let i = 0; i < n; i++) {
    const t = i / n;
    const growth = Math.pow(t, 0.6);
    pts.push([
      x0 + sign * growth * (0.35 * Math.cos(spreadAngle) + 0.15 * Math.sin(t * 3 + spreadAngle)),
      y0 + growth * (0.4 * Math.sin(spreadAngle) * Math.sin(t * 2) + 0.1 * Math.cos(t * 4)),
      z0 + growth * (0.12 * Math.cos(t * 2.5 + spreadAngle * 0.3) - z0 * growth * 0.4),
    ]);
  }
  return pts;
}

// Stable manifold tube — time-reversal of an unstable tube, approaches the orbit
function makeStableTube(
  branchIndex: number,
  totalBranches: number,
  n = 100,
): [number, number, number][] {
  return makeUnstableTube(
    branchIndex + Math.floor(totalBranches / 2),
    totalBranches,
    n,
  ).slice().reverse();
}

export function LandingScene() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = window.innerWidth;
    const h = window.innerHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.5;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.001, 100);
    camera.position.set(0.2, -1.2, 0.7);
    camera.lookAt(1.1, 0, 0);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 1.5, 0.8, 0.05);
    composer.addPass(bloomPass);

    const group = new THREE.Group();
    scene.add(group);

    // Starfield on sphere r=30
    const starGeo = new THREE.BufferGeometry();
    const starCount = 3000;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 30;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.05 })));

    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(5, 3, 5);
    scene.add(sun);

    // Earth
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 32, 32),
      new THREE.MeshPhongMaterial({ color: 0x4488ff, emissive: 0x112244, shininess: 40 }),
    );
    earth.position.set(-0.01215, 0, 0);
    group.add(earth);

    // Moon
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(0.038, 16, 16),
      new THREE.MeshPhongMaterial({ color: 0xaaaaaa, emissive: 0x111111, shininess: 20 }),
    );
    moon.position.set(0.98785, 0, 0);
    group.add(moon);

    function addTube(
      points: [number, number, number][],
      color: number,
      radius: number,
      opacity: number,
    ) {
      if (points.length < 2) return;
      const curve = new THREE.CatmullRomCurve3(
        points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      );
      const geo = new THREE.TubeGeometry(
        curve,
        Math.min(points.length * 2, 200),
        radius,
        5,
        false,
      );
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: opacity < 1.0,
        opacity,
      });
      group.add(new THREE.Mesh(geo, mat));
    }

    // Axial orbit — white, prominent
    addTube(makeAxialOrbit(150), 0xffffff, 0.005, 1.0);

    // Unstable manifold tubes — orange
    const N_UNSTABLE = 8;
    for (let b = 0; b < N_UNSTABLE; b++) {
      addTube(makeUnstableTube(b, N_UNSTABLE, 100), 0xff6b35, 0.0025, 0.75);
    }

    // Stable manifold tubes — ice blue
    const N_STABLE = 8;
    for (let b = 0; b < N_STABLE; b++) {
      addTube(makeStableTube(b, N_STABLE, 100), 0x4fc3f7, 0.0025, 0.75);
    }

    function onResize() {
      const nw = window.innerWidth;
      const nh = window.innerHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
      composer.setSize(nw, nh);
    }
    window.addEventListener("resize", onResize);

    let rafId: number;
    function animate() {
      rafId = requestAnimationFrame(animate);
      group.rotation.z += 0.0003;
      group.rotation.x = Math.sin(Date.now() * 0.0001) * 0.15;
      composer.render();
    }
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0, zIndex: 0 }} />;
}
