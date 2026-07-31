import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Text, ContactShadows, RoundedBox } from "@react-three/drei";
import { useMemo, useRef } from "react";
import { formatMoney, ROLE_LABELS } from "../lib/format";

function Pitch() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[8.5, 64]} />
        <meshStandardMaterial color="#0d3b2c" roughness={0.85} metalness={0.05} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[3.2, 3.35, 64]} />
        <meshStandardMaterial color="#c8f542" emissive="#6f8f20" emissiveIntensity={0.25} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[6.4, 6.55, 64]} />
        <meshStandardMaterial color="#ffc857" emissive="#8a6418" emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}

function AuctionCard({ live, flash }) {
  const group = useRef();
  const current = live?.currentPlayer;
  const showSold = !current && flash?.type === "sold";
  const showUnsold = !current && flash?.type === "unsold";

  const title = current?.name || flash?.name || "WAITING";
  const subtitle = current
    ? ROLE_LABELS[current.role] || current.role
    : showSold
      ? `SOLD to ${flash.team || "—"}`
      : showUnsold
        ? "UNSOLD"
        : live?.status || "Stand by";
  const price = current
    ? formatMoney(live?.currentPrice || 0)
    : showSold
      ? formatMoney(flash.price)
      : "";

  const accent = showSold ? "#ff5a3d" : showUnsold ? "#9bb0a4" : "#c8f542";

  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.35) * 0.12;
    group.current.position.y = 1.35 + Math.sin(state.clock.elapsedTime * 0.9) * 0.05;
  });

  return (
    <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.35}>
      <group ref={group} position={[0, 1.35, 0]}>
        <RoundedBox args={[4.6, 2.6, 0.22]} radius={0.12} smoothness={4} castShadow>
          <meshStandardMaterial
            color="#0a241c"
            metalness={0.35}
            roughness={0.35}
            emissive={accent}
            emissiveIntensity={0.08}
          />
        </RoundedBox>
        <mesh position={[0, 0, 0.12]}>
          <planeGeometry args={[4.2, 2.2]} />
          <meshStandardMaterial color="#071912" metalness={0.2} roughness={0.5} />
        </mesh>
        <Text
          position={[0, 0.7, 0.14]}
          fontSize={0.28}
          color={accent}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.18}
        >
          {current ? "NOW BIDDING" : showSold ? "SOLD" : showUnsold ? "UNSOLD" : "KPL LIVE"}
        </Text>
        <Text
          position={[0, 0.15, 0.14]}
          fontSize={title.length > 12 ? 0.38 : 0.48}
          color="#f4efe4"
          anchorX="center"
          anchorY="middle"
          maxWidth={4}
          textAlign="center"
        >
          {title}
        </Text>
        <Text
          position={[0, -0.4, 0.14]}
          fontSize={0.22}
          color="#c9d9cf"
          anchorX="center"
          anchorY="middle"
        >
          {subtitle}
        </Text>
        {price && (
          <Text
            position={[0, -0.85, 0.14]}
            fontSize={0.42}
            color="#ffc857"
            anchorX="center"
            anchorY="middle"
          >
            {price}
          </Text>
        )}
      </group>
    </Float>
  );
}

function OrbitLights() {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.position.x = Math.cos(t * 0.4) * 4;
    ref.current.position.z = Math.sin(t * 0.4) * 4;
  });
  return <pointLight ref={ref} intensity={28} distance={18} color="#c8f542" />;
}

function CameraRig() {
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    state.camera.position.x = Math.sin(t * 0.12) * 1.2;
    state.camera.position.z = 7.2 + Math.cos(t * 0.1) * 0.35;
    state.camera.lookAt(0, 1.1, 0);
  });
  return null;
}

export default function AuctionScene3D({ live, flash }) {
  const leading = live?.leadingTeam?.name;

  const particles = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = 2.2 + (i % 5) * 0.85;
      arr.push({
        key: i,
        position: [
          Math.cos(a) * r,
          0.5 + (i % 7) * 0.45,
          Math.sin(a) * r,
        ],
        scale: 0.025 + (i % 4) * 0.01,
      });
    }
    return arr;
  }, []);

  return (
    <Canvas shadows camera={{ position: [0, 2.4, 7.2], fov: 42 }}>
      <color attach="background" args={["#04110c"]} />
      <ambientLight intensity={0.45} />
      <spotLight
        position={[4, 8, 4]}
        angle={0.45}
        penumbra={0.5}
        intensity={80}
        castShadow
        color="#fff6d8"
      />
      <OrbitLights />
      <Pitch />
      <AuctionCard live={live} flash={flash} />
      {leading && (
        <Text position={[0, 0.35, 2.2]} fontSize={0.22} color="#ffc857" anchorX="center">
          {`Leading · ${leading}`}
        </Text>
      )}
      {particles.map((p) => (
        <mesh key={p.key} position={p.position} scale={p.scale}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color="#c8f542" emissive="#c8f542" emissiveIntensity={2} />
        </mesh>
      ))}
      <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={14} blur={2.5} far={8} />
      <CameraRig />
    </Canvas>
  );
}
