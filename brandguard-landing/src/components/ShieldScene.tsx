"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useMemo } from "react";
import * as THREE from "three";
import { createRng } from "@/lib/rng";

function Shield() {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);

  const particlePositions = useMemo(() => {
    const rng = createRng(99);
    const positions = new Float32Array(300 * 3);
    for (let i = 0; i < 300; i++) {
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      const r = 2.5 + rng() * 1.5;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    return positions;
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.3;
      meshRef.current.rotation.x = Math.sin(t * 0.2) * 0.1;
    }
    if (glowRef.current) {
      glowRef.current.rotation.y = -t * 0.15;
      const scale = 1 + Math.sin(t * 1.5) * 0.05;
      glowRef.current.scale.set(scale, scale, scale);
    }
    if (particlesRef.current) {
      particlesRef.current.rotation.y = t * 0.1;
      particlesRef.current.rotation.x = t * 0.05;
    }
  });

  // Shield shape (custom geometry)
  const shieldShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 1.4);
    shape.bezierCurveTo(0.8, 1.4, 1.3, 1.0, 1.3, 0.5);
    shape.bezierCurveTo(1.3, -0.2, 0.8, -0.9, 0, -1.4);
    shape.bezierCurveTo(-0.8, -0.9, -1.3, -0.2, -1.3, 0.5);
    shape.bezierCurveTo(-1.3, 1.0, -0.8, 1.4, 0, 1.4);
    return shape;
  }, []);

  const extrudeSettings = useMemo(
    () => ({
      depth: 0.3,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.05,
      bevelSegments: 5,
    }),
    []
  );

  return (
    <group>
      {/* Main shield */}
      <mesh ref={meshRef} castShadow>
        <extrudeGeometry args={[shieldShape, extrudeSettings]} />
        <meshStandardMaterial
          color="#6366f1"
          metalness={0.8}
          roughness={0.2}
          emissive="#4338ca"
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* Glow ring */}
      <mesh ref={glowRef}>
        <torusGeometry args={[2, 0.02, 16, 100]} />
        <meshBasicMaterial color="#818cf8" transparent opacity={0.6} />
      </mesh>

      {/* Second ring */}
      <mesh rotation={[Math.PI / 3, 0, 0]}>
        <torusGeometry args={[2.2, 0.015, 16, 100]} />
        <meshBasicMaterial color="#a5b4fc" transparent opacity={0.3} />
      </mesh>

      {/* Orbiting particles */}
      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={300}
            array={particlePositions}
            itemSize={3}
            args={[particlePositions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          color="#818cf8"
          size={0.03}
          transparent
          opacity={0.8}
          sizeAttenuation
        />
      </points>
    </group>
  );
}

export default function ShieldScene({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <pointLight position={[-3, -3, 2]} intensity={0.5} color="#818cf8" />
        <pointLight position={[3, -2, -3]} intensity={0.3} color="#6366f1" />
        <Shield />
      </Canvas>
    </div>
  );
}
