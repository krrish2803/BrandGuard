"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useMemo } from "react";
import * as THREE from "three";
import { createRng } from "@/lib/rng";

function NetworkNodes() {
  const groupRef = useRef<THREE.Group>(null);
  const linesRef = useRef<THREE.LineSegments>(null);

  const { nodePositions, linePositions } = useMemo(() => {
    const nodes: THREE.Vector3[] = [];
    const rng = createRng(7);
    const count = 40;
    for (let i = 0; i < count; i++) {
      nodes.push(
        new THREE.Vector3(
          (rng() - 0.5) * 6,
          (rng() - 0.5) * 4,
          (rng() - 0.5) * 4
        )
      );
    }

    const nodePos = new Float32Array(count * 3);
    nodes.forEach((n, i) => {
      nodePos[i * 3] = n.x;
      nodePos[i * 3 + 1] = n.y;
      nodePos[i * 3 + 2] = n.z;
    });

    // Connect nearby nodes
    const lines: number[] = [];
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        if (nodes[i].distanceTo(nodes[j]) < 2.5) {
          lines.push(
            nodes[i].x, nodes[i].y, nodes[i].z,
            nodes[j].x, nodes[j].y, nodes[j].z
          );
        }
      }
    }

    return {
      nodePositions: nodePos,
      linePositions: new Float32Array(lines),
    };
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.08;
      groupRef.current.rotation.x = Math.sin(t * 0.1) * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Nodes */}
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={40}
            array={nodePositions}
            itemSize={3}
            args={[nodePositions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          color="#f472b6"
          size={0.08}
          transparent
          opacity={0.9}
          sizeAttenuation
        />
      </points>

      {/* Connections */}
      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={linePositions.length / 3}
            array={linePositions}
            itemSize={3}
            args={[linePositions, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#6366f1" transparent opacity={0.2} />
      </lineSegments>
    </group>
  );
}

export default function NetworkScene({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0, 6], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[5, 5, 5]} intensity={0.6} color="#818cf8" />
        <NetworkNodes />
      </Canvas>
    </div>
  );
}
