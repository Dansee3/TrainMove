import React, { useMemo, useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { getTrackInfo, TRACK_SEGMENTS } from './trackUtils'

export const Track: React.FC = () => {
	// Obliczamy całkowitą długość toru
	const totalLength = useMemo(() => TRACK_SEGMENTS.reduce((acc, seg) => acc + seg.length, 0), [])

	// --- 1. GEOMETRIA NASYPU (BALLAST) + SZYNY (RAILS) ---
	// Generujemy je jako pojedynczy mesh (lub oddzielne) wzdłuż krzywej
	const { ballastGeometry, railsGeometry, sleeperCount } = useMemo(() => {
		const ballastPositions: number[] = []
		const ballastIndices: number[] = []

		const railPositions: number[] = []
		const railIndices: number[] = []


		// Zakres generowania: od -120m do totalLength + 120m (zgodnie z Ground.tsx)
		const startDist = -120
		const endDist = totalLength + 120
		const step = 0.5 // Gęstsze próbkowanie dla gładszych łuków

		const totalSteps = Math.ceil((endDist - startDist) / step)

		// Parametry toru
		const ballastWidthTop = 3.6
		const ballastWidthBottom = 5.0
		// Szyny
		const gauge = 1.435 // Rozstaw szyn (standard europejski)

		for (let i = 0; i <= totalSteps; i++) {
			const d = startDist + i * step
			const info = getTrackInfo(d)
			const h = info.heading || 0

			// Wektory kierunkowe
			const px = Math.cos(h)
			const pz = -Math.sin(h) // Right vector

			const topY = info.height
			const bottomY = topY - 0.5 // Ballast depth

			// --- BALLAST PUNKTY (Trapez) ---
			// Left Top
			const xLT = info.x - px * (ballastWidthTop / 2)
			const zLT = info.z - pz * (ballastWidthTop / 2)
			// Right Top
			const xRT = info.x + px * (ballastWidthTop / 2)
			const zRT = info.z + pz * (ballastWidthTop / 2)
			// Right Bottom
			const xRB = info.x + px * (ballastWidthBottom / 2)
			const zRB = info.z + pz * (ballastWidthBottom / 2)
			// Left Bottom
			const xLB = info.x - px * (ballastWidthBottom / 2)
			const zLB = info.z - pz * (ballastWidthBottom / 2)

			// Push vertices (4 per step)
			ballastPositions.push(xLT, topY - 0.2, zLT) // Top is slightly below rail/sleeper (-0.2 for sleeper embedding)
			ballastPositions.push(xRT, topY - 0.2, zRT)
			ballastPositions.push(xRB, bottomY, zRB)
			ballastPositions.push(xLB, bottomY, zLB)

			if (i < totalSteps) {
				const base = i * 4
				// Top Surface Quad
				ballastIndices.push(base, base + 4, base + 1) // 0, 4, 1
				ballastIndices.push(base + 1, base + 4, base + 5)

				// Right Slope Quad
				ballastIndices.push(base + 1, base + 5, base + 2)
				ballastIndices.push(base + 2, base + 5, base + 6)

				// Left Slope Quad
				ballastIndices.push(base + 3, base + 0, base + 7)
				ballastIndices.push(base + 0, base + 4, base + 7)
			}

			// --- RAILS (SZYNY) ---
			const railW = 0.08
			// Left Rail Center
			const rL_x = info.x - px * (gauge / 2)
			const rL_z = info.z - pz * (gauge / 2)
			// Right Rail Center
			const rR_x = info.x + px * (gauge / 2)
			const rR_z = info.z + pz * (gauge / 2)

			const railTopY = topY + 0.15
			const railBotY = topY

			// L_L (Left rail, left side)
			const rl_lx = rL_x - px * railW
			const rl_lz = rL_z - pz * railW
			// L_R (Left rail, right side)
			const rl_rx = rL_x + px * railW
			const rl_rz = rL_z + pz * railW

			// R_L
			const rr_lx = rR_x - px * railW
			const rr_lz = rR_z - pz * railW
			// R_R
			const rr_rx = rR_x + px * railW
			const rr_rz = rR_z + pz * railW

			// LEFT RAIL push
			railPositions.push(rl_lx, railTopY, rl_lz) // 0
			railPositions.push(rl_rx, railTopY, rl_rz) // 1
			railPositions.push(rl_rx, railBotY, rl_rz) // 2
			railPositions.push(rl_lx, railBotY, rl_lz) // 3

			// RIGHT RAIL push
			railPositions.push(rr_lx, railTopY, rr_lz) // 4
			railPositions.push(rr_rx, railTopY, rr_rz) // 5
			railPositions.push(rr_rx, railBotY, rr_rz) // 6
			railPositions.push(rr_lx, railBotY, rr_lz) // 7

			if (i < totalSteps) {
				const b = i * 8
				const nextB = b + 8

				// LEFT RAIL FACES
				// Top: 0-1-next1-next0
				railIndices.push(b + 0, nextB + 0, b + 1)
				railIndices.push(b + 1, nextB + 0, nextB + 1)

				// Right side: 1-2-next2-next1
				railIndices.push(b + 1, nextB + 1, b + 2)
				railIndices.push(b + 2, nextB + 1, nextB + 2)

				// Left side: 3-0-next0-next3
				railIndices.push(b + 3, b + 0, nextB + 3)
				railIndices.push(b + 0, nextB + 0, nextB + 3)

				// RIGHT RAIL FACES
				// Top: 4-5-next5-next4
				railIndices.push(b + 4, nextB + 4, b + 5)
				railIndices.push(b + 5, nextB + 4, nextB + 5)

				// Right side: 5-6-next6-next5
				railIndices.push(b + 5, nextB + 5, b + 6)
				railIndices.push(b + 6, nextB + 5, nextB + 6)

				// Left side: 7-4-next4-next7
				railIndices.push(b + 7, b + 4, nextB + 7)
				railIndices.push(b + 4, nextB + 4, nextB + 7)
			}
		}

		const bGeom = new THREE.BufferGeometry()
		bGeom.setAttribute('position', new THREE.Float32BufferAttribute(ballastPositions, 3))
		bGeom.setIndex(ballastIndices)
		bGeom.computeVertexNormals()

		const rGeom = new THREE.BufferGeometry()
		rGeom.setAttribute('position', new THREE.Float32BufferAttribute(railPositions, 3))
		rGeom.setIndex(railIndices)
		rGeom.computeVertexNormals()

		// Count sleepers
		const sleeperSpacing = 0.65
		const sCount = Math.ceil((endDist - startDist) / sleeperSpacing) + 100

		return { ballastGeometry: bGeom, railsGeometry: rGeom, sleeperCount: sCount }
	}, [totalLength])

	// --- 2. PODKŁADY (SLEEPERS) - INSTANCED MESH ---
	const sleeperMeshRef = useRef<THREE.InstancedMesh>(null)

	useLayoutEffect(() => {
		if (!sleeperMeshRef.current) return

		const dummy = new THREE.Object3D()
		const startDist = -120
		const endDist = totalLength + 120
		const sleeperSpacing = 0.65

		let idx = 0
		for (let d = startDist; d <= endDist; d += sleeperSpacing) {
			const info = getTrackInfo(d)
			const h = info.heading || 0

			// Sleeper Box: 2.6m wide, 0.15m high, 0.35m deep
			dummy.position.set(info.x, info.height - 0.2 + 0.075, info.z) // -0.2 (ballast top) + half height
			dummy.rotation.set(0, h, 0)
			dummy.updateMatrix()

			sleeperMeshRef.current.setMatrixAt(idx, dummy.matrix)
			idx++
		}
		sleeperMeshRef.current.count = idx
		sleeperMeshRef.current.instanceMatrix.needsUpdate = true
	}, [totalLength])

	return (
		<group>
			{/* BALLAST */}
			<mesh geometry={ballastGeometry} receiveShadow castShadow>
				<meshStandardMaterial color='#3d3d3d' roughness={1} />
			</mesh>
			{/* RAILS */}
			<mesh geometry={railsGeometry} receiveShadow castShadow>
				<meshStandardMaterial color='#555555' roughness={0.4} metalness={0.8} />
			</mesh>
			{/* SLEEPERS */}
			<instancedMesh ref={sleeperMeshRef} args={[undefined, undefined, sleeperCount]} castShadow receiveShadow>
				<boxGeometry args={[2.6, 0.15, 0.35]} />
				<meshStandardMaterial color='#3e2723' roughness={0.9} />
			</instancedMesh>
		</group>
	)
}
