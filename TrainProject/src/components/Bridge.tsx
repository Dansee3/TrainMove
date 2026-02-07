import React, { useLayoutEffect, useRef, useMemo } from 'react'
import * as THREE from 'three'
import { getTrackInfo } from './trackUtils'

interface BridgeProps {
	startDist: number
	length: number
	width: number
	trackHeightOffset?: number // Optional adjustment if needed
}

export const Bridge: React.FC<BridgeProps> = ({ startDist = 2200, length = 400, width = 12 }) => {
	const deckMeshRef = useRef<THREE.InstancedMesh>(null)
	const railingMeshRef = useRef<THREE.InstancedMesh>(null)
	const pillarMeshRef = useRef<THREE.InstancedMesh>(null)

	// Konfiguracja wymiarów elementów mostu
	const SEGMENT_LENGTH = 2.0 // Długość pojedynczego segmentu pomostu
	const RAILING_DIST = 4.0 // Odstęp między słupkami barierek
	const PILLAR_DIST = 20.0 // Odstęp między filarami

	const { deckCount, railingCount, pillarCount } = useMemo(() => {
		return {
			deckCount: Math.ceil(length / SEGMENT_LENGTH) + 5,
			railingCount: (Math.ceil(length / RAILING_DIST) + 5) * 2, // Both sides
			pillarCount: Math.ceil(length / PILLAR_DIST) + 2,
		}
	}, [length])

	useLayoutEffect(() => {
		if (!deckMeshRef.current || !railingMeshRef.current || !pillarMeshRef.current) return

		const dummy = new THREE.Object3D()
		let dIdx = 0
		let rIdx = 0
		let pIdx = 0

		const endDist = startDist // 1. SEGMENTY POMOSTU (DECK)
		for (let d = startDist; d <= endDist; d += SEGMENT_LENGTH) {
			const info = getTrackInfo(d)
			const nextInfo = getTrackInfo(d + SEGMENT_LENGTH)

			// Kąt nachylenia toru w danym punkcie
			const h = info.heading || 0

			// Pozycjonowanie: [x, wysokość - offset, z]
			// Tor jest na info.height - 0.25. Pomost dajemy nieco niżej.
			// Ustawiamy górę pomostu na info.height - 1.0 (pod podkładami).

			dummy.position.set(info.x, info.height - 1, info.z)
			dummy.rotation.set(0, h, 0)
			dummy.scale.set(1, 1, 1) // Box is 1 unit long? No, args are fixed.
			dummy.updateMatrix()
			deckMeshRef.current.setMatrixAt(dIdx, dummy.matrix)
			dIdx++
		}

		// 2. FILARY (PILLARS)
		for (let d = startDist + 10; d < endDist; d += PILLAR_DIST) {
			const info = getTrackInfo(d)
			const h = info.heading || 0

			// Wysokość filarów. Teren (dno rzeki) jest nisko.
			// Wydłużamy filar w dół.
			// Dla efektu wizualnego wystarczy stała, duża wysokość (np. 70m), aby "wchodził" w wodę/ziemię.
			const pillarH = 70

			dummy.position.set(info.x, info.height - 1 - pillarH / 2 - 0.8, info.z)
			dummy.rotation.set(0, h, 0)
			dummy.scale.set(1, 1, 1)
			dummy.updateMatrix()
			pillarMeshRef.current.setMatrixAt(pIdx, dummy.matrix)
			pIdx++
		}

		// 3. BARIERKI (RAILINGS)
		for (let d = startDist; d <= endDist; d += RAILING_DIST) {
			const info = getTrackInfo(d)
			const h = info.heading || 0

			// Lewy słupek
			// Ustawienie pozycji (manualne transformacje dla idealnego dopasowania)
			dummy.position.set(
				info.x + Math.cos(h) * (-width / 2 + 0.2),
				info.height - 0.5 + 0.75, // Deck top + połowa wysokości słupka
				info.z + Math.sin(h) * (width / 2 - 0.2) * -1,
			)
			// Re-do manual transform using Object3D consistent with Deck
			dummy.position.set(info.x, info.height, info.z)
			dummy.rotation.set(0, h, 0)
			dummy.translateX(-width / 2 + 0.2)
			dummy.translateY(0)

			dummy.updateMatrix()
			railingMeshRef.current.setMatrixAt(rIdx++, dummy.matrix)

			// Prawy słupek
			dummy.position.set(info.x, info.height, info.z)
			dummy.rotation.set(0, h, 0)
			dummy.translateX(width / 2 - 0.2)
			dummy.translateY(0)

			dummy.updateMatrix()
			railingMeshRef.current.setMatrixAt(rIdx++, dummy.matrix)
		}

		deckMeshRef.current.count = dIdx
		pillarMeshRef.current.count = pIdx
		railingMeshRef.current.count = rIdx

		deckMeshRef.current.instanceMatrix.needsUpdate = true
		pillarMeshRef.current.instanceMatrix.needsUpdate = true
		railingMeshRef.current.instanceMatrix.needsUpdate = true
	}, [startDist, length, width])

	return (
		<group>
			{/* DECK segments (Box: width, 1.5 height, segment_length) */}
			<instancedMesh ref={deckMeshRef} args={[undefined, undefined, deckCount]} castShadow receiveShadow>
				<boxGeometry args={[width, 1.5, SEGMENT_LENGTH + 0.1]} />
				<meshStandardMaterial color='#444' roughness={0.8} />
			</instancedMesh>

			{/* PILLARS (Box: 3 wid, 30 hei, 3 dep) */}
			<instancedMesh ref={pillarMeshRef} args={[undefined, undefined, pillarCount]} castShadow receiveShadow>
				<boxGeometry args={[width * 0.8, 70, 4]} />
				<meshStandardMaterial color='#555' roughness={0.9} />
			</instancedMesh>

			{/* RAILING POSTS (Box: 0.2, 1.5, 0.2) */}
			<instancedMesh ref={railingMeshRef} args={[undefined, undefined, railingCount]} castShadow>
				<boxGeometry args={[0.3, 1.5, 0.3]} />
				<meshStandardMaterial color='#333' />
			</instancedMesh>
		</group>
	)
}
