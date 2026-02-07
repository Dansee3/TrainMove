import React, { useMemo } from 'react'
import * as THREE from 'three'
import { getTrackInfo, TRACK_SEGMENTS } from './trackUtils'

export const Track: React.FC = () => {
	// Generowanie geometrii toru na podstawie segmentów
	const geometry = useMemo(() => {
		const shape = new THREE.Shape()
		// Prosty przekrój toru (podkład + szyny) - uproszczony do płaskiego pasa
		const width = 4
		shape.moveTo(-width / 2, 0)
		shape.lineTo(width / 2, 0)
		shape.lineTo(width / 2, 0.5)
		shape.lineTo(-width / 2, 0.5)
		shape.lineTo(-width / 2, 0)

		// Zamiast ExtrudeGeometry, budujemy własny mesh strip dla pełnej kontroli nad segmentami i wydajności.
		const positions: number[] = []
		const indices: number[] = []
		const uvs: number[] = []

		const totalLength = TRACK_SEGMENTS.reduce((acc, seg) => acc + seg.length, 0)
		const step = 2 // Dokładność generowania (metry)

		const steps = Math.ceil(totalLength / step)

		for (let i = 0; i <= steps; i++) {
			const d = i * step
			const info = getTrackInfo(d)
			const h = info.heading || 0

			// Wektor prawy (do rozszerzania w bok od osi toru)
			const px = Math.cos(h)
			const pz = -Math.sin(h)

			// Szerokość torowiska (3.5m)
			const w = 3.5 / 2

			// Lewy wierzchołek
			const xL = info.x - px * w
			const zL = info.z - pz * w
			const yL = info.height

			// Prawy wierzchołek
			const xR = info.x + px * w
			const zR = info.z + pz * w
			const yR = info.height

			positions.push(xL, yL, zL)
			positions.push(xR, yR, zR)

			uvs.push(0, d * 0.1)
			uvs.push(1, d * 0.1)

			if (i < steps) {
				const base = i * 2
				// Trójkąt 1
				indices.push(base, base + 2, base + 1)
				// Trójkąt 2
				indices.push(base + 1, base + 2, base + 3)
			}
		}

		const geom = new THREE.BufferGeometry()
		geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
		geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
		geom.setIndex(indices)
		geom.computeVertexNormals()
		return geom
	}, [])

	// Logika szyn: Tekstura standardowa wystarczy dla tego poziomu detali

	return (
		<mesh geometry={geometry} receiveShadow castShadow>
			<meshStandardMaterial color='#444' roughness={0.8} />
		</mesh>
	)
}
