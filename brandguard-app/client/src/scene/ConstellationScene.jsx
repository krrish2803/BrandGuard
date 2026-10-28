/**
 * Rule constellation — 3D scene (F17).
 *
 * Loaded lazily via React.lazy from Constellation.jsx, so three.js never
 * lands in the main bundle and the core path stays fast (spec F17: "Loads
 * lazily; page works with 3D disabled").
 *
 * Spec §12: node size = violations, colour = clarity (red = ambiguous),
 * clicking a node opens that rule's findings. Uses only primitives (spheres +
 * lines) — no models — to stay well under the 150 KB asset budget.
 */

import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";

/** A single rule node. Slow pulse + hover lift; click reports the rule. */
function RuleNode({ node, active, onPick }) {
  const mesh = useRef();
  const [hovered, setHover] = React.useState(false);

  // Gentle idle motion. Skipped when reduced-motion is on (passed as animate).
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    if (node.animate) {
      const t = clock.elapsedTime;
      mesh.current.position.y = node.baseY + Math.sin(t * 0.6 + node.phase) * 0.12;
    }
    const target = active || hovered ? 1.16 : 1;
    mesh.current.scale.setScalar(mesh.current.scale.x + (target - mesh.current.scale.x) * 0.15);
  });

  return (
    <mesh
      ref={mesh}
      position={[node.x, node.baseY, node.z]}
      onClick={(e) => {
        e.stopPropagation();
        onPick(node.ruleId);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "auto";
      }}
    >
      <sphereGeometry args={[node.radius, 24, 24]} />
      <meshStandardMaterial
        color={node.color}
        emissive={node.color}
        emissiveIntensity={active || hovered ? 0.55 : 0.22}
        roughness={0.4}
        metalness={0.15}
      />
    </mesh>
  );
}

/** Thin links from the central hub out to each node — the "constellation". */
function Links({ nodes }) {
  const positions = useMemo(() => {
    const arr = [];
    for (const n of nodes) {
      arr.push(0, 0, 0, n.x, n.baseY, n.z);
    }
    return new Float32Array(arr);
  }, [nodes]);

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#c8b8a4" transparent opacity={0.5} />
    </line>
  );
}

/** The brightest node sits at the hub — the most-violated rule anchors the view. */
function Hub() {
  return (
    <mesh position={[0, 0, 0]}>
      <sphereGeometry args={[0.12, 16, 16]} />
      <meshStandardMaterial color="#3b2a20" emissive="#c8963e" emissiveIntensity={0.4} />
    </mesh>
  );
}

export default function ConstellationScene({ nodes, activeRule, onPick, animate = true }) {
  // Lift nodes onto a shallow 3D field and tag per-node animation phase.
  const positioned = useMemo(
    () =>
      nodes.map((n, i) => ({
        ...n,
        baseY: 0,
        phase: (i * Math.PI) / 3,
        animate,
      })),
    [nodes, animate]
  );

  return (
    <Canvas
      camera={{ position: [0, 4.2, 7.4], fov: 48 }}
      dpr={[1, 1.75]}
      style={{ height: 340, borderRadius: 10, background: "linear-gradient(180deg,#fbf7f1,#f1e7d9)" }}
      onPointerMissed={() => onPick(null)}
    >
      {/* Warm ambient + a key light so spheres read as 3D, not flat discs. */}
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 6, 5]} intensity={0.7} />
      <pointLight position={[-4, 3, -4]} intensity={0.35} color="#c8963e" />

      <OrbitRig animate={animate}>
        <group position={[0, -0.3, 0]}>
          <Hub />
          <Links nodes={positioned} />
          {positioned.map((n) => (
            <RuleNode key={n.ruleId} node={n} active={activeRule === n.ruleId} onPick={onPick} />
          ))}
        </group>
      </OrbitRig>
    </Canvas>
  );
}

/**
 * Minimal orbit rig — drag to spin, gentle auto-orbit when idle.
 *
 * We deliberately skip @react-three/drei's OrbitControls: one component isn't
 * worth pulling drei's whole dependency tree into the lazily-loaded chunk, and
 * this keeps the F17 asset budget (spec: "under about 150 KB of assets").
 * Wraps the scene content in a group and spins that group on Y (plus a small
 * polar tilt from vertical drag). Auto-orbit pauses while dragging and is off
 * entirely when the visitor prefers reduced motion.
 */
function OrbitRig({ animate, children }) {
  const group = useRef();
  const dragging = useRef(false);
  const spin = useRef({ tilt: 0.0, y: 0 }); // radians

  useFrame((_, dt) => {
    if (animate && !dragging.current) spin.current.y += dt * 0.14;
    if (group.current) {
      group.current.rotation.y = spin.current.y;
      group.current.rotation.x = Math.min(Math.max(spin.current.tilt, -0.5), 0.5);
    }
  });

  return (
    <group
      ref={group}
      onPointerDown={(e) => {
        dragging.current = true;
        e.stopPropagation?.();
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerLeave={() => (dragging.current = false)}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        spin.current.y += (e.movementX ?? 0) * 0.006;
        spin.current.tilt += (e.movementY ?? 0) * 0.004;
      }}
    >
      {children}
    </group>
  );
}
