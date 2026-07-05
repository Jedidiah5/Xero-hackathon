"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const WAVES = [
  { color: 0xc97b24, opacity: 0.22, amp: 1.4, freq: 0.38, speed: 0.35, z: -4, y: 1.2 },
  { color: 0x0fa36b, opacity: 0.14, amp: 1.1, freq: 0.42, speed: 0.28, z: -2, y: -0.4 },
  { color: 0xd97706, opacity: 0.12, amp: 0.9, freq: 0.45, speed: 0.32, z: 0, y: -1.6 },
  { color: 0x635bff, opacity: 0.1, amp: 1.2, freq: 0.33, speed: 0.25, z: 2, y: 0.6 },
  { color: 0xf5c542, opacity: 0.16, amp: 0.7, freq: 0.5, speed: 0.4, z: 4, y: -2.2 },
  { color: 0xc97b24, opacity: 0.08, amp: 1.6, freq: 0.28, speed: 0.2, z: 6, y: 2.0 },
] as const;

const SEGMENTS = 120;
const SPAN = 28;

type WaveLine = {
  line: THREE.Line;
  positions: Float32Array;
  phase: number;
  def: (typeof WAVES)[number];
};

export default function LandingWaves() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xf4f0e8, 0.045);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 80);
    camera.position.set(0, 0, 11);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    group.rotation.x = -0.28;
    scene.add(group);

    const waves: WaveLine[] = WAVES.map((def, i) => {
      const positions = new Float32Array((SEGMENTS + 1) * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: def.opacity,
      });
      const line = new THREE.Line(geometry, material);
      line.userData.index = i;
      group.add(line);
      return { line, positions, phase: i * 1.7, def };
    });

    const fillWave = (wave: WaveLine, time: number) => {
      const { positions, def, phase } = wave;
      for (let i = 0; i <= SEGMENTS; i++) {
        const t = i / SEGMENTS;
        const x = (t - 0.5) * SPAN;
        const y =
          def.y +
          Math.sin(x * def.freq + phase + time * def.speed) * def.amp +
          Math.sin(x * def.freq * 0.5 + phase * 0.6) * def.amp * 0.35;
        const z = def.z + Math.cos(x * 0.15 + time * def.speed * 0.5) * 0.6;
        const j = i * 3;
        positions[j] = x;
        positions[j + 1] = y;
        positions[j + 2] = z;
      }
      wave.line.geometry.attributes.position.needsUpdate = true;
    };

    let mouseX = 0;
    let mouseY = 0;
    let targetRotX = 0;
    let targetRotY = 0;

    const onMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      mouseX = nx;
      mouseY = ny;
      targetRotY = nx * 0.18;
      targetRotX = ny * 0.08;
    };
    window.addEventListener("mousemove", onMove, { passive: true });

    const fit = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(container);

    const t0 = performance.now();
    let raf = 0;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const elapsed = (performance.now() - t0) / 1000;
      const time = reducedMotion ? 0 : elapsed;

      for (const wave of waves) fillWave(wave, time);

      group.rotation.y += (targetRotY - group.rotation.y) * 0.04;
      group.rotation.x += (-0.28 + targetRotX - group.rotation.x) * 0.04;
      group.position.x = mouseX * 0.35;
      group.position.y = -mouseY * 0.2;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      ro.disconnect();
      for (const wave of waves) {
        wave.line.geometry.dispose();
        (wave.line.material as THREE.Material).dispose();
      }
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 opacity-90"
      style={{
        maskImage: "linear-gradient(to bottom, black 0%, black 55%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 55%, transparent 100%)",
      }}
    />
  );
}
