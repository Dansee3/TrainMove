import React, { useMemo, useLayoutEffect } from 'react'
import { TRACK_SEGMENTS, getTrackInfo } from './trackUtils'
import * as THREE from 'three'
import { useTexture } from '@react-three/drei'

export const Ground: React.FC = () => {
	// Oblicz przybliżoną długość trasy (w jednostkach używanych w Track)
	const totalTrackLength = useMemo(() => TRACK_SEGMENTS.reduce((s, seg) => s + seg.length, 1), [])

	const PATH = '/textures/coast_sand_rocks_02_1k/textures/'
	const props = useTexture({
		map: PATH + 'coast_sand_rocks_02_diff_1k.jpg',
		displacementMap: PATH + 'coast_sand_rocks_02_disp_1k.png',
		normalMap: PATH + 'coast_sand_rocks_02_nor_gl_1k.jpg',
		roughnessMap: PATH + 'coast_sand_rocks_02_rough_1k.jpg',
		aoMap: PATH + 'coast_sand_rocks_02_ao_1k.jpg',
	})

	useLayoutEffect(() => {
		const scale = 10
		const repX = Math.ceil(800 / scale)
		const repY = Math.ceil(totalTrackLength / scale)
		Object.values(props).forEach(tex => {
			tex.wrapS = tex.wrapT = THREE.RepeatWrapping
			tex.repeat.set(repX, repY)
			tex.anisotropy = 16
		})
	}, [props, totalTrackLength])

	// we will query world coordinates directly from getTrackInfo(distance)

	// Generujemy drzewa --- prosta, lekka reprezentacja (pień + stożek liści)
	const trees = useMemo(() => {
		// Deterministyczny generator dla stabilnych wyników przy renderze
		const lcg = (seed: number) => {
			let s = seed >>> 0
			return () => {
				s = (s * 1664525 + 1013904223) >>> 0
				return s / 4294967296
			}
		}

		const list: React.ReactNode[] = []
		const countPerSide = 240 // trees per side
		const sides = [-1, 1]
		for (let s = 0; s < sides.length; s++) {
			const side = sides[s]
			for (let j = 0; j < countPerSide; j++) {
				const rnd = lcg(1234 + s * 1000 + j)
				// Place trees relative to track centerline
				const rndOffset = 30 + rnd() * 20
				const distanceAlong = rnd() * totalTrackLength

				// Get track info
				const info = getTrackInfo(distanceAlong)

				// Calculate position relative to track heading
				// info.heading is the direction of the track (0 = aligned with +Z)
				// We want a vector perpendicular to heading (Right vector)
				// Right vector for heading H: (cos(H), sin(H)) ? No.
				// Track moves in (sin(H), cos(H)).
				// Right (90 deg clockwise?): (cos(H), -sin(H))
				// Wait.
				// Forward = (sin H, cos H).
				// Rot -90 deg (Left): (cos H, -sin H)
				// Rot +90 deg (Right): (-cos H, sin H)
				// Let's use simple trig:
				// If heading = 0 (Forward +Z). Right (+X) should be (1, 0).
				// If heading = PI/2 (Right +X). Right (-Z) should be (0, -1).

				// Standard right vector from forward (dx, dz):
				// Forward (dx, dz). Right (-dz, dx) or (dz, -dx).
				// info heading assumes 0 is +Z. Forward vector = (sin(h), cos(h)).
				// Right vector = (cos(h), -sin(h)).

				const h = info.heading || 0
				const perpX = Math.cos(h)
				const perpZ = -Math.sin(h)

				const finalX = info.x + perpX * (side * rndOffset)
				const finalZ = info.z + perpZ * (side * rndOffset)
				const y = info.height

				const trunkHeight = 2 + rnd() * 1.5
				const foliageHeight = 3 + rnd() * 2

				const key = `tree-${s}-${j}`
				list.push(
					<group key={key} position={[finalX, y + trunkHeight / 2 - 0.1, finalZ]}>
						<mesh castShadow>
							<cylinderGeometry args={[0.2, 0.3, trunkHeight, 6]} />
							<meshStandardMaterial color={'#5b3a1a'} />
						</mesh>
						<mesh position={[0, trunkHeight / 2 + foliageHeight / 2 - 0.1, 0]} castShadow>
							<coneGeometry args={[foliageHeight * 0.7, foliageHeight, 8]} />
							<meshStandardMaterial color={'#2d7d2a'} />
						</mesh>
					</group>,
				)
			}
		}
		return list
	}, [totalTrackLength])

	// Zbuduj siatkę terenu dopasowaną do profilu toru (próbkujemy tor i używamy najbliższej próbki)
	const groundMesh = useMemo(() => {
		const width = 800
		const widthSeg = 20

		// sample track points by distance to get world Z range and heights
		const total = totalTrackLength
		const sampleStep = 5
		const samples: { d: number; x: number; z: number; h: number }[] = []
		for (let d = 0; d <= total; d += sampleStep) {
			const p = getTrackInfo(d)
			samples.push({ d, x: p.x, z: p.z, h: p.height })
		}

		let minZ = Infinity
		let maxZ = -Infinity
		for (const s of samples) {
			if (s.z < minZ) minZ = s.z
			if (s.z > maxZ) maxZ = s.z
		}
		if (!isFinite(minZ) || !isFinite(maxZ)) {
			minZ = 0
			maxZ = Math.max(800, total)
		}

		const projectedLength = Math.max(800, Math.abs(maxZ - minZ) * 1.2)
		const lengthSeg = Math.max(Math.ceil(projectedLength / 10), 30)

		const cols = widthSeg + 1
		const rows = lengthSeg + 1
		const positions: number[] = []
		const uvs: number[] = []
		const indices: number[] = []

		const zTargets: number[] = new Array(rows)
		for (let r = 0; r < rows; r++) {
			zTargets[r] = minZ + (r / (rows - 1)) * (maxZ - minZ)
		}

		const nearestSampleByZ = (z: number) => {
			let best = samples[0]
			let bestDist = Infinity
			for (const s of samples) {
				const d = Math.abs(s.z - z)
				if (d < bestDist) {
					bestDist = d
					best = s
				}
			}
			return best
		}

		for (let r = 0; r < rows; r++) {
			const z = zTargets[r]
			const nearest = nearestSampleByZ(z)
			const heightAtZ = nearest.h
			for (let c = 0; c < cols; c++) {
				const x = (c / (cols - 1)) * width - width / 2
				positions.push(x, heightAtZ - 0.6, z)
				uvs.push(c / (cols - 1), r / (rows - 1))
			}
		}

		for (let r = 0; r < rows - 1; r++) {
			for (let c = 0; c < cols - 1; c++) {
				const a = r * cols + c
				const b = r * cols + c + 1
				const cidx = (r + 1) * cols + c
				const d = (r + 1) * cols + c + 1
				indices.push(a, cidx, b)
				indices.push(b, cidx, d)
			}
		}

		const geom = new THREE.BufferGeometry()
		geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
		geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
		geom.setIndex(indices)
		geom.computeVertexNormals()
		return { geom, projectedLength }
	}, [totalTrackLength])

	return (
		<group>
			<mesh geometry={groundMesh.geom} receiveShadow>
				<meshStandardMaterial {...props} side={THREE.DoubleSide} displacementScale={0.5} />
			</mesh>

			{trees}
		</group>
	)
}

export default Ground
