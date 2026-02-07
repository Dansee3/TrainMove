import React, { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// --- INTELIGENTNA GŁOWA (śledzenie kamery) ---
// Komponent sprawia, że zwierzęta patrzą na gracza, gdy ten się zbliży.
export const SmartHead = ({
	children,
	position,
	rotation,
}: {
	children: React.ReactNode
	position?: [number, number, number]
	rotation?: [number, number, number]
}) => {
	const groupRef = useRef<THREE.Group>(null)
	const sideOffset = useRef(Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2)

	useFrame(({ camera }) => {
		if (groupRef.current) {
			const dist = camera.position.distanceTo(groupRef.current.getWorldPosition(new THREE.Vector3()))
			if (dist < 150) {
				groupRef.current.lookAt(camera.position)
				groupRef.current.rotateY(sideOffset.current)
			}
		}
	})

	return (
		<group ref={groupRef} position={position} rotation={rotation ? new THREE.Euler(...rotation) : undefined}>
			{children}
		</group>
	)
}

export const RoeDeerModel = () => (
	<group>
		{/* Tułów */}
		<mesh position={[0, 0.9, 0]} castShadow>
			<boxGeometry args={[0.5, 0.6, 1.2]} />
			<meshStandardMaterial color='#b06d36' roughness={0.9} />
		</mesh>
		{/* Szyja */}
		<mesh position={[0, 1.4, 0.5]} rotation={[-Math.PI / 4, 0, 0]}>
			<cylinderGeometry args={[0.15, 0.2, 0.6]} />
			<meshStandardMaterial color='#b06d36' roughness={0.9} />
		</mesh>

		{/* Grupa Głowy (Smart Head) */}
		<SmartHead position={[0, 1.7, 0.7]}>
			{/* Głowa właściwa */}
			<mesh rotation={[0, 0, 0]}>
				<boxGeometry args={[0.25, 0.3, 0.4]} />
				<meshStandardMaterial color='#8c522d' roughness={0.9} />
			</mesh>
			{/* Uszy */}
			<mesh position={[0.15, 0.2, -0.1]} rotation={[0, 0, 0.3]}>
				<boxGeometry args={[0.05, 0.2, 0.1]} />
				<meshStandardMaterial color='#8c522d' />
			</mesh>
			<mesh position={[-0.15, 0.2, -0.1]} rotation={[0, 0, -0.3]}>
				<boxGeometry args={[0.05, 0.2, 0.1]} />
				<meshStandardMaterial color='#8c522d' />
			</mesh>
		</SmartHead>

		{/* Nogi */}
		<mesh position={[-0.2, 0.45, 0.4]}>
			<cylinderGeometry args={[0.08, 0.06, 0.9]} />
			<meshStandardMaterial color='#5c3a21' roughness={0.9} />
		</mesh>
		<mesh position={[0.2, 0.45, 0.4]}>
			<cylinderGeometry args={[0.08, 0.06, 0.9]} />
			<meshStandardMaterial color='#5c3a21' roughness={0.9} />
		</mesh>
		<mesh position={[-0.2, 0.45, -0.4]}>
			<cylinderGeometry args={[0.08, 0.06, 0.9]} />
			<meshStandardMaterial color='#5c3a21' roughness={0.9} />
		</mesh>
		<mesh position={[0.2, 0.45, -0.4]}>
			<cylinderGeometry args={[0.08, 0.06, 0.9]} />
			<meshStandardMaterial color='#5c3a21' roughness={0.9} />
		</mesh>
	</group>
)

export const RedDeerModel = () => (
	<group scale={[1.4, 1.4, 1.4]}>
		{/* Tułów */}
		<mesh position={[0, 1.2, 0]} castShadow>
			<boxGeometry args={[0.7, 0.9, 1.6]} />
			<meshStandardMaterial color='#6d4c41' roughness={0.8} />
		</mesh>
		{/* Szyja */}
		<mesh position={[0, 1.8, 0.7]} rotation={[-Math.PI / 3, 0, 0]}>
			<cylinderGeometry args={[0.25, 0.35, 0.8]} />
			<meshStandardMaterial color='#5d4037' roughness={0.8} />
		</mesh>

		{/* Sprytna głowa */}
		<SmartHead position={[0, 2.3, 1.0]}>
			<mesh>
				<boxGeometry args={[0.35, 0.45, 0.6]} />
				<meshStandardMaterial color='#4e342e' roughness={0.8} />
			</mesh>
			{/* Poroże */}
			<group position={[0, 0.2, -0.1]} rotation={[0.2, 0, 0]}>
				<mesh position={[0.3, 0.5, 0]} rotation={[0, 0, -0.5]}>
					<cylinderGeometry args={[0.04, 0.06, 1]} />
					<meshStandardMaterial color='#d7ccc8' />
				</mesh>
				<mesh position={[-0.3, 0.5, 0]} rotation={[0, 0, 0.5]}>
					<cylinderGeometry args={[0.04, 0.06, 1]} />
					<meshStandardMaterial color='#d7ccc8' />
				</mesh>
				<mesh position={[0.5, 0.7, 0.1]} rotation={[0.5, 0, -1]}>
					<cylinderGeometry args={[0.03, 0.04, 0.5]} />
					<meshStandardMaterial color='#d7ccc8' />
				</mesh>
				<mesh position={[-0.5, 0.7, 0.1]} rotation={[0.5, 0, 1]}>
					<cylinderGeometry args={[0.03, 0.04, 0.5]} />
					<meshStandardMaterial color='#d7ccc8' />
				</mesh>
			</group>
		</SmartHead>

		{/* Nogi */}
		<mesh position={[-0.3, 0.6, 0.6]}>
			<cylinderGeometry args={[0.12, 0.1, 1.2]} />
			<meshStandardMaterial color='#3e2723' />
		</mesh>
		<mesh position={[0.3, 0.6, 0.6]}>
			<cylinderGeometry args={[0.12, 0.1, 1.2]} />
			<meshStandardMaterial color='#3e2723' />
		</mesh>
		<mesh position={[-0.3, 0.6, -0.6]}>
			<cylinderGeometry args={[0.1, 0.09, 1.2]} />
			<meshStandardMaterial color='#3e2723' />
		</mesh>
		<mesh position={[0.3, 0.6, -0.6]}>
			<cylinderGeometry args={[0.1, 0.09, 1.2]} />
			<meshStandardMaterial color='#3e2723' />
		</mesh>
	</group>
)

export const WildBoarModel = () => (
	<group scale={[1.1, 1.1, 1.1]}>
		{/* Tułów - masywny i niski */}
		<mesh position={[0, 0.7, 0]} castShadow>
			<boxGeometry args={[0.8, 0.9, 1.4]} />
			<meshStandardMaterial color='#37474f' roughness={0.9} />
		</mesh>

		{/* Sprytna głowa */}
		<SmartHead position={[0, 0.7, 0.9]}>
			{/* Głowa (stożkowata) */}
			{/* Oryginalnie: rotation={[Math.PI / 2, 0, 0]} */}
			<group rotation={[Math.PI / 2, 0, 0]}>
				<mesh>
					<coneGeometry args={[0.45, 1, 4]} />
					<meshStandardMaterial color='#263238' />
				</mesh>
				<mesh position={[0, 0.05, 0]} rotation={[0, Math.PI / 4, 0]}>
					<coneGeometry args={[0.4, 0.8, 4]} />
					<meshStandardMaterial color='#263238' />
				</mesh>
				{/* Kły (Szable) */}
				{/* Trudne pozycjonowanie ze względu na rotację grupy głowy. Aproksymacja: */}
				<mesh position={[0.2, -0.4, 0.1]} rotation={[-Math.PI / 2, 0.5, 0.5]}>
					<cylinderGeometry args={[0.02, 0.04, 0.3]} />
					<meshStandardMaterial color='#f5f5f5' />
				</mesh>
				<mesh position={[-0.2, -0.4, 0.1]} rotation={[-Math.PI / 2, -0.5, -0.5]}>
					<cylinderGeometry args={[0.02, 0.04, 0.3]} />
					<meshStandardMaterial color='#f5f5f5' />
				</mesh>
			</group>
		</SmartHead>

		{/* Nogi - krótkie */}
		<mesh position={[-0.3, 0.3, 0.5]}>
			<cylinderGeometry args={[0.1, 0.08, 0.6]} />
			<meshStandardMaterial color='#212121' />
		</mesh>
		<mesh position={[0.3, 0.3, 0.5]}>
			<cylinderGeometry args={[0.1, 0.08, 0.6]} />
			<meshStandardMaterial color='#212121' />
		</mesh>
		<mesh position={[-0.3, 0.3, -0.5]}>
			<cylinderGeometry args={[0.1, 0.08, 0.6]} />
			<meshStandardMaterial color='#212121' />
		</mesh>
		<mesh position={[0.3, 0.3, -0.5]}>
			<cylinderGeometry args={[0.1, 0.08, 0.6]} />
			<meshStandardMaterial color='#212121' />
		</mesh>
	</group>
)
