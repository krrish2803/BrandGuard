"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useMemo } from "react";
import * as THREE from "three";
import { createRng } from "@/lib/rng";

function ScanningGlobe() {
  const globeRef = useRef<THREE.Mesh>(null);
  const scanLineRef = useRef<THREE.Mesh>(null);
  const dotsRef = useRef<THREE.Points>(null);

  // Points on globe surface (simulating scan targets)
  const dotPositions = useMemo(() => {
    const rng = createRng(42);
    const positions = new Float32Array(200 * 3);
    for (let i = 0; i < 200; i++) {
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      const r = 1.52;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    return positions;
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (globeRef.current) {
      globeRef.current.rotation.y = t * 0.15;
    }
    if (scanLineRef.current) {
      scanLineRef.current.rotation.y = t * 0.8;
    }
    if (dotsRef.current) {
      dotsRef.current.rotation.y = t * 0.15;
    }
  });

  return (
    <group>
      {/* Wireframe globe */}
      <mesh ref={globeRef}>
        <sphereGeometry args={[1.5, 32, 32]} />
        <meshStandardMaterial
          color="#1e1b4b"
          wireframe
          transparent
          opacity={0.3}
        />
      </mesh>

      {/* Solid inner */}
      <mesh>
        <sphereGeometry args={[1.48, 32, 32]} />
        <meshStandardMaterial
          color="#0f0b3e"
          transparent
          opacity={0.8}
          metalness={0.5}
          roughness={0.8}
        />
      </mesh>

      {/* Scanning plane */}
      <mesh ref={scanLineRef} rotation={[0, 0, Math.PI / 2]}>
        <ringGeometry args={[0, 1.6, 32, 1, 0, Math.PI / 6]} />
        <meshBasicMaterial
          color="#22d3ee"
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Dots on surface */}
      <points ref={dotsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={200}
            array={dotPositions}
            itemSize={3}
            args={[dotPositions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          color="#22d3ee"
          size={0.04}
          transparent
          opacity={0.9}
          sizeAttenuation
        />
      </points>

      {/* Orbit rings */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.8, 0.008, 16, 100]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={0.4} />
      </mesh>
      <mesh rotation={[Math.PI / 3, Math.PI / 4, 0]}>
        <torusGeometry args={[2.0, 0.008, 16, 100]} />
        <meshBasicMaterial color="#818cf8" transparent opacity={0.25} />
      </mesh>
    </group>
  );
}

export default function GlobeScene({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.3} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <pointLight position={[-5, 0, 3]} intensity={0.5} color="#22d3ee" />
        <pointLight position={[3, -2, -3]} intensity={0.3} color="#6366f1" />
        <ScanningGlobe />
      </Canvas>
    </div>
  );
}
