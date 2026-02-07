import React, { useMemo, useLayoutEffect, useRef } from 'react'
import { TRACK_SEGMENTS, getTrackInfo } from './trackUtils'
import { getNoiseHeight } from '../utils/noise'
import * as THREE from 'three'
import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { getRiverCenterX, STATION_DEFS } from './worldConfig'

// Static geometries
const treeGeo = new THREE.CylinderGeometry(0.2, 0.4, 3, 5)
treeGeo.translate(0, 1.5, 0)
const leafGeoFinal = new THREE.ConeGeometry(1.5, 4, 7)
leafGeoFinal.translate(0, 4, 0)

export const Ground: React.FC = () => {
	const totalTrackLength = useMemo(() => TRACK_SEGMENTS.reduce((s, seg) => s + seg.length, 0), [])

	// Texture Setup
	const PATH = '/textures/brown_mud_leaves_01_2k/textures/'
	const props = useTexture({
		map: PATH + 'brown_mud_leaves_01_diff_2k.jpg',
		displacementMap: PATH + 'brown_mud_leaves_01_disp_2k.png',
		normalMap: PATH + 'brown_mud_leaves_01_nor_gl_2k.jpg',
		roughnessMap: PATH + 'brown_mud_leaves_01_arm_2k.jpg',
		aoMap: PATH + 'brown_mud_leaves_01_ao_2k.jpg',
	})

	useMemo(() => {
		Object.values(props).forEach(tex => {
			tex.wrapS = tex.wrapT = THREE.RepeatWrapping
			tex.repeat.set(0.8, 0.8)
			tex.anisotropy = 16
		})
	}, [props])

	// --- 1. DEFINICJA SIATKI OFFSETS (SZEROKOŚĆ MAPY) ---
	const offsets = useMemo(() => {
		const result = []
		// Większa rozdzielczość w pobliżu toru (0) i obszarów rzecznych
		result.push(-750, -500, -300, -200, -100, -60, -40, -20)
		result.push(-10, -6, -3, -1.8, 0)
		result.push(1.8, 3, 6, 10, 20, 40, 60, 100)
		result.push(200, 300, 500, 750)
		return result.sort((a, b) => a - b)
	}, [])

	const { geometry, treeData, waterGeometry } = useMemo(() => {
		const positions: number[] = []
		const uvs: number[] = []
		const indices: number[] = []
		const rowSize = offsets.length

		const trackStep = 2.0
		const totalSteps = Math.ceil(totalTrackLength / trackStep)

		// 1. ROZSZERZONE GRANICE MAPY (EXTENDED BOUNDS)
		// Generujemy dodatkowe segmenty przed startem i za końcem, aby uniknąć pustki
		const extendSteps = 60
		const startStep = -extendSteps
		const endStep = totalSteps + extendSteps
		const totalGeneratedSteps = endStep - startStep + 1
		const heightGrid = new Float32Array(totalGeneratedSteps * rowSize)

		const waterPos: number[] = []
		const waterBaseYs: number[] = [] // Store base height for animation
		const waterInd: number[] = []

		for (let i = startStep; i <= endStep; i++) {
			const d = i * trackStep

			// Bezpieczne pobieranie info o torze (z ekstrapolacją dla krańców)
			const clampedD = Math.max(0, Math.min(d, totalTrackLength))
			const info = getTrackInfo(clampedD)

			const delta = d - clampedD
			const h = info.heading || 0
			// Normal vector (Right vector)
			const px = Math.cos(h)
			const pz = -Math.sin(h)
			// Tangent vector (Forward vector)
			const tx = Math.sin(h)
			const tz = Math.cos(h)

			const centerX = info.x + tx * delta
			const centerZ = info.z + tz * delta

			// Wysokość nasypu (baza dla toru)
			const baseHeight = info.height - 0.25

			// Poziom lustra wody (bazowy)
			const wY = baseHeight - 29

			// --- GENEROWANIE TERENU (ALGORYTM) ---
			for (let j = 0; j < offsets.length; j++) {
				const off = offsets[j]
				const wx = centerX + px * off
				const wz = centerZ + pz * off

				// 1. GENEROWANIE BAZY I SZUMU (NOISE)
				const noiseVal = getNoiseHeight(wx, wz) * 1.5

				// Wygładzanie w pobliżu torowiska (Flattening)
				const absOff = Math.abs(off)
				let noiseFactor = 1.0
				if (absOff < 6) noiseFactor = 0
				else if (absOff < 40) noiseFactor = (absOff - 6) / 34 // Fixed range (40-6=34) for smooth 0-1 transition

				let wy = baseHeight + noiseVal * noiseFactor

				// 2. KORYTO RZEKI (RIVER CUT)
				// Wycinanie proceduralne koryta w terenie
				const riverCenterX = getRiverCenterX(centerZ)
				const riverHalfWidth = 150
				const riverEdge = riverCenterX - riverHalfWidth
				const riverFarEdge = riverCenterX + riverHalfWidth

				// Check if current point is within river bounds
				if (wx > riverEdge && wx < riverFarEdge) {
					// Calculate distance from river center
					const distFromRiverCenter = Math.abs(wx - riverCenterX)
					// Normalize distance from center to edge (0 at center, 1 at edge)
					const normalizedDist = distFromRiverCenter / riverHalfWidth

					// Zastosowanie krzywej parabolicznej dla profilu dna rzeki
					// Głębiej na środku, płycej przy brzegach
					const riverDepthFactor = 1 - Math.pow(normalizedDist, 2) // Parabola
					const maxRiverDepth = 10 // Maksymalna głębokość
					const riverBedY = wY - maxRiverDepth * riverDepthFactor - 10

					// Mieszanie wysokości terenu z dnem rzeki (Blend)
					// Tworzymy płynne przejście brzegu
					const blendStart = riverHalfWidth * 0.8 // Start blendowania (80% szerokości)
					const blendEnd = riverHalfWidth // Koniec blendowania
					let blendFactor = 0
					if (distFromRiverCenter > blendStart) {
						blendFactor = (distFromRiverCenter - blendStart) / (blendEnd - blendStart)
					}

					wy = THREE.MathUtils.lerp(riverBedY, wy, blendFactor)
				}

				// 3. WYCINANIE POD TOROWISKO (TRACK CUT)
				// Wyrównanie terenu bezpośrednio pod torami
				// POMIJAMY DLA MOSTU (2050 - 2750) - tam teren ma opaść naturalnie
				const isBridge = d > 2050 && d < 2750

				if (!isBridge) {
					if (absOff < 1.8) {
						wy = baseHeight
					} else if (absOff < 3) {
						// Smooth transition from track to terrain
						const trackBlendFactor = (absOff - 1.8) / (3 - 1.8)
						wy = THREE.MathUtils.lerp(baseHeight, wy, trackBlendFactor)
					}
				}

				// 4. WYRÓWNYWANIE POD STACJAMI (STATION FLATTENING)
				// Wymuszamy płaski teren wokół stacji, aby budynki nie wisiały ani nie tonęły
				for (const s of STATION_DEFS) {
					const distDiff = d - s.dist
					// Square field: +/- 50m along track, and wide enough on the side
					if (Math.abs(distDiff) < 50) {
						// Flatten on the station side, extending slightly to the other side to cover track
						// Side 1 (Right): offset > -5 to 50
						// Side -1 (Left): offset < 5 to -50
						if (s.side === 1) {
							if (off > -5 && off < 50) wy = baseHeight
						} else {
							if (off < 5 && off > -50) wy = baseHeight
						}
					}
				}

				positions.push(wx, wy, wz)
				uvs.push(wx * 0.02, wz * 0.02) // UVs for texture mapping

				// Store in grid (mapped to 0-based index)
				const gridIndex = (i - startStep) * rowSize + j
				heightGrid[gridIndex] = wy
			}

			// --- GENEROWANIE WODY (WATER MESH) ---
			const rCx = getRiverCenterX(centerZ)
			const halfWidth = 150
			// We remove the static wave calculation here, or simpler: keep it zero-based for base?
			// User wanted "baseY" to be the value WITHOUT the dynamic wave.
			// The previous static wave was: sin(centerZ * 0.002 + i * 0.1) * 2.5
			// We'll calculate the static "rest" positions for Side/Mid.

			const edgeDrop = 2.6
			const centerLift = 0.05

			const wLeft = rCx - halfWidth - 20
			const wMid = rCx
			const wRight = rCx + halfWidth + 20

			const waterSurfaceY = wY - 2.5 // Visual lower level

			// Base Ys (Rest positions)
			const yLeft = waterSurfaceY - edgeDrop
			const yMid = waterSurfaceY + centerLift - 0.5
			const yRight = waterSurfaceY - edgeDrop

			// Push Positions (Initial can be flat or with static wave, doesn't matter as useFrame overwrites)
			// But let's push BaseY to waterPos too for init
			waterPos.push(wLeft, yLeft, centerZ)
			waterPos.push(wMid, yMid, centerZ)
			waterPos.push(wRight, yRight, centerZ)

			// Push BaseYs
			waterBaseYs.push(yLeft, yMid, yRight)

			if (i < endStep) {
				const relI = i - startStep
				const base = relI * 3
				waterInd.push(base, base + 3, base + 1)
				waterInd.push(base + 1, base + 3, base + 4)
				waterInd.push(base + 1, base + 4, base + 2)
				waterInd.push(base + 2, base + 4, base + 5)
			}
		}

		// Terrain Indices
		for (let i = 0; i < totalGeneratedSteps - 1; i++) {
			for (let j = 0; j < rowSize - 1; j++) {
				const a = i * rowSize + j
				const b = i * rowSize + (j + 1)
				const c = (i + 1) * rowSize + j
				const d = (i + 1) * rowSize + (j + 1)
				indices.push(a, d, b)
				indices.push(a, c, d)
			}
		}

		const geom = new THREE.BufferGeometry()
		geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
		geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
		geom.setIndex(indices)
		geom.computeVertexNormals()

		const wGeom = new THREE.BufferGeometry()
		wGeom.setAttribute('position', new THREE.Float32BufferAttribute(waterPos, 3))
		wGeom.setAttribute('baseY', new THREE.Float32BufferAttribute(waterBaseYs, 1)) // Custom attribute
		wGeom.setIndex(waterInd)
		wGeom.computeVertexNormals()

		const sampleHeightFromGrid = (distance: number, signedOffset: number) => {
			const clampedDistance = THREE.MathUtils.clamp(distance, startStep * trackStep, endStep * trackStep)
			const rowPos = clampedDistance / trackStep - startStep
			const row0 = Math.floor(rowPos)
			const row1 = Math.min(totalGeneratedSteps - 1, row0 + 1)
			const rowT = rowPos - row0

			const minOffset = offsets[0]
			const maxOffset = offsets[rowSize - 1]
			const clampedOffset = THREE.MathUtils.clamp(signedOffset, minOffset, maxOffset)

			let upperIndex = 1
			while (upperIndex < rowSize && offsets[upperIndex] < clampedOffset) upperIndex++
			let lowerIndex = upperIndex - 1
			if (upperIndex >= rowSize) {
				upperIndex = rowSize - 1
				lowerIndex = rowSize - 2
			}
			if (lowerIndex < 0) {
				lowerIndex = 0
				upperIndex = 1
			}

			const offsetRange = offsets[upperIndex] - offsets[lowerIndex] || 1
			const colT = (clampedOffset - offsets[lowerIndex]) / offsetRange

			const idx = (row: number, col: number) => heightGrid[row * rowSize + col]
			const h00 = idx(row0, lowerIndex)
			const h01 = idx(row0, upperIndex)
			const h10 = idx(row1, lowerIndex)
			const h11 = idx(row1, upperIndex)

			// Use Triangle-based interpolation to match the mesh geometry exactly
			// Mesh indices: (0,0), (1,1), (0,1) -> Top-Right (u >= v) if u=colT, v=rowT
			//               (0,0), (1,0), (1,1) -> Bottom-Left (v > u)
			// u = colT, v = rowT

			if (rowT > colT) {
				// Triangle (0,0)-(1,0)-(1,1) [a, c, d]
				// Height = h00 + (h10 - h00)*v + (h11 - h10)*u
				return h00 + (h10 - h00) * rowT + (h11 - h10) * colT
			} else {
				// Triangle (0,0)-(1,1)-(0,1) [a, d, b]
				// Height = h00 + (h01 - h00)*u + (h11 - h01)*v
				return h00 + (h01 - h00) * colT + (h11 - h01) * rowT
			}
		}

		// --- GENEROWANIE DRZEW (TREE PLACEMENT) ---
		const tData: { x: number; y: number; z: number; scale: number; rot: number }[] = []
		const treeGrid = new Map<string, { x: number; z: number }[]>()
		const minTreeSpacing = 7
		const minTreeSpacingSq = minTreeSpacing * minTreeSpacing
		const cellSize = minTreeSpacing

		const registerTree = (x: number, z: number) => {
			const key = `${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}`
			const entries = treeGrid.get(key)
			if (entries) entries.push({ x, z })
			else treeGrid.set(key, [{ x, z }])
		}

		const hasNearbyTree = (x: number, z: number) => {
			const cx = Math.floor(x / cellSize)
			const cz = Math.floor(z / cellSize)
			for (let dx = -1; dx <= 1; dx++) {
				for (let dz = -1; dz <= 1; dz++) {
					const key = `${cx + dx}:${cz + dz}`
					const entries = treeGrid.get(key)
					if (!entries) continue
					for (const entry of entries) {
						const ddx = entry.x - x
						const ddz = entry.z - z
						if (ddx * ddx + ddz * ddz < minTreeSpacingSq) {
							return true
						}
					}
				}
			}
			return false
		}

		const lcg = (s: number) => () => ((2 ** 31 - 1) & (s = Math.imul(48271, s))) / 2 ** 31
		const rng = lcg(1337)

		// Increased tree count for fuller environment
		const baseTreeCount = Math.floor(totalTrackLength * 2.5)

		for (let k = 0; k < baseTreeCount; k++) {
			// Random position along track, including extensions
			// -100 to totalLength + 100
			const trD = rng() * (totalTrackLength + 200) - 100

			// 1. DRZEWA PRZYTOROWE I NADRZECZNE (NEAR TRACK)
			// Losujemy stronę i sprawdzamy, czy grunt nadaje się do posadzenia drzewa
			const side = rng() > 0.5 ? 1 : -1
			const trOff = 15 + Math.abs(rng()) * 550 // Slightly reduced max offset for "near" trees

			// Generate both sides occasionally
			const passCount = rng() > 0.7 ? 2 : 1

			// Increase density near river at end of map
			const isEndRiver = trD > 3000
			const loopCount = isEndRiver ? passCount + 1 : passCount

			for (let p = 0; p < loopCount; p++) {
				const currentSide = p === 0 ? side : -side

				// Extra logic for river trees
				if (isEndRiver && p >= passCount) {
					// This block was intended for extra river trees but we used a separate loop instead.
					// Removing unused code to fix lints.
				}

				// 2. DRZEWA W TLE (BACKGROUND TREES)
				// Czasami wymuszamy drzewo daleko w tle dla głębi
				const isFar = rng() > 0.8
				const actualOff = isFar ? 300 + Math.abs(rng()) * 400 : trOff

				// Force dense trees at end near river
				if (isEndRiver && p === 2) {
					// This is our extra pass
					// River is at X=350 roughly (from getRiverCenterX)
					// Track is nearby.
					// Let's just try to spawn trees at global X offsets near 350+ or 350-
					// wait, our loop works on offsets from track.
				}

				const tInfo = getTrackInfo(trD)
				const tH = tInfo.heading || 0
				const tPx = Math.cos(tH)
				const tPz = -Math.sin(tH)

				const tx = tInfo.x + tPx * currentSide * actualOff
				const tz = tInfo.z + tPz * currentSide * actualOff

				// BOUNDS CHECK (Strict)
				// Mesh generation usually goes up to offset ~750.
				// We keep trees within safer bounds to ensure they are on generated geometry.
				if (tx < -750 || tx > 750) continue

				// --- SPECIFIC FIX: MORE TREES NEAR RIVER AT END ---
				// If we are at the end, and we accidentally picked a spot NOT near the river,
				// let's try to bias it?
				// Actually, simpler: just spawn EXTRA trees in a separate loop?
				// Or just let probability handle it?
				// User wants "more trees".

				// Let's add a separate loop for river trees AFTER this main loop.
				// For now just process this one.

				// Exclude Track Area
				if (actualOff < 12) continue

				// Avoid Station Platforms
				const dToStart = Math.abs(trD - 20)
				const dToEnd = Math.abs(trD - 4780) // NEW STATION POS

				// Station Piwniczna Exclusion (Square box)
				// Station is at d=2950, side=-1 (Left, offset ~-12)
				// We exclude d in [2900, 3000] and offset in [-40, 20] (covering left side and track/immediate right)
				// Note: currentSide * actualOff is the signed offset.
				const signedOff = currentSide * actualOff
				if (trD > 2900 && trD < 3000 && signedOff > -60 && signedOff < 40) continue

				// But allow trees BEHIND stations (far offset)
				const behindStation = actualOff > 100
				if ((dToStart < 60 || dToEnd < 80) && !behindStation) continue // Increased exclusion radius for end station

				// Avoid River
				const rCx_tree = getRiverCenterX(tz)
				// Wider exclusion for river to prevent trees in water (River halfwidth is 150)
				// 160 ensures they are clearly on the bank
				if (Math.abs(tx - rCx_tree) < 160) continue

				// Check bounds of map (Z)
				// Our generated mesh goes from roughly -300 to totalLength+300
				// trees should be safe.

				if (hasNearbyTree(tx, tz)) continue

				const terrainY = sampleHeightFromGrid(trD, currentSide * actualOff)
				if (!Number.isFinite(terrainY)) continue

				// Height check: Don't spawn underwater
				if (terrainY < -5) continue

				const ty = terrainY - 0.2

				tData.push({
					x: tx,
					y: ty,
					z: tz,
					scale: 0.8 + Math.abs(rng()) * 0.6,
					rot: Math.abs(rng()) * Math.PI * 2,
				})
				registerTree(tx, tz)
			}
		}

		// --- DODATKOWA PĘTLA DLA RZEKI (EXTRA RIVER TREES) ---
		// Specjalna pętla dolesiająca brzegi rzeki, szczególnie na końcu mapy
		const extraTrees = 800
		for (let k = 0; k < extraTrees; k++) {
			// Range: 3500 to totalLength
			const z = 3500 + rng() * (totalTrackLength - 3500)
			// River is at getRiverCenterX(z)
			const rx = getRiverCenterX(z)

			// Left bank or Right bank
			const side = rng() > 0.5 ? 1 : -1
			// Dist from center: 160 to 420 (Start larger than 150 half-width)
			const dist = 160 + rng() * 260

			const tx = rx + side * dist
			const tz = z

			// Standard checks
			if (hasNearbyTree(tx, tz)) continue

			// Avoid station
			const dToEnd = Math.abs(tz - 4780)
			if (dToEnd < 80) continue

			// Sample height - this is tricky because we need 'trD' and 'offset' to use sampleHeightFromGrid
			// But we have global x, z.
			// We can try to approximate or just use getNoiseHeight?
			// sampleHeightFromGrid is better because it accounts for the river carving we just did.
			// To use it, we need to map (tx, tz) back to (trackDist, trackOffset).
			// This is hard.
			// BUT, we can just use the grid directly if we know the indices?
			// No, grid is 1D array.

			// Alternative: Use 3D Raycast? No.
			// Let's just trust getNoiseHeight + manual river check?
			// But river carving logic is complex in the loop.

			// Actually, we can assume track is roughly straight at the end?
			// At z > 3000, track is mostly straight?
			// Track segments:
			// { length: 600, angle: 0.02, turn: 0.15 }, // Dalszy podjazd (Ends 3200m)
			// { length: 500, angle: 0.01, turn: -0.1 }, // Łagodny łuk (Ends 3700m)
			// { length: 600, angle: -0.01, turn: 0.2 }, // Zjazd z łukiem (Ends 4300m)
			// Curve is significant.

			// Strategy: Iterate by Track Distance, but specifically target River Offset relative to world?
			// No, iterate by Track Distance, identify River Center relative to Track, then place tree.

			const trD = z // Approximation
			const tInfo = getTrackInfo(trD)
			const rCx_tree = getRiverCenterX(tInfo.z)

			// We want tree at rCx_tree +/- dist.
			// We need to find 'offset' from track such that track + offset = river +/- dist
			// track.x + offset * cos(h) = rCx +/- dist
			// offset = (rCx +/- dist - track.x) / cos(h)

			const tH = tInfo.heading || 0
			const tPx = Math.cos(tH) // x component of right vector
			// if tPx is near 0, we have a problem (track perpendicular to X).
			// But track heading is usually small.

			if (Math.abs(tPx) < 0.1) continue

			const targetX = rCx_tree + side * dist
			const neededOffset = (targetX - tInfo.x) / tPx

			// Now use this offset
			const terrainY = sampleHeightFromGrid(trD, neededOffset)
			if (!Number.isFinite(terrainY)) continue
			if (terrainY < -5) continue // Underwater

			const realTx = tInfo.x + tPx * neededOffset
			const realTz = tInfo.z + -Math.sin(tH) * neededOffset // verify this math?
			// actually we just want to retrieve height.
			// We can reconstruct positions:

			tData.push({
				x: realTx,
				y: terrainY - 0.2,
				z: realTz,
				scale: 0.8 + Math.abs(rng()) * 0.6,
				rot: Math.abs(rng()) * Math.PI * 2,
			})
			registerTree(realTx, realTz)
		}

		return { geometry: geom, treeData: tData, waterGeometry: wGeom }
	}, [totalTrackLength, offsets])

	// Water Reference for Animation
	const waterRef = useRef<THREE.Mesh>(null)

	useFrame(({ clock }) => {
		if (!waterRef.current) return
		const geo = waterRef.current.geometry
		const pos = geo.attributes.position
		const baseY = geo.getAttribute('baseY') // Need to check if this is valid type-wise

		if (!baseY) return

		const time = clock.elapsedTime
		const count = pos.count

		// We update Y based on BaseY + Sine Wave
		for (let i = 0; i < count; i++) {
			const z = pos.getZ(i)
			const bY = baseY.getX(i)

			// Identify type: 0=Left, 1=Mid, 2=Right
			const type = i % 3

			// Flow Wave: z * 0.05 spatial freq, time * 1.5 temporal speed
			const wave = Math.sin(z * 0.05 - time * 1.5) * 2.5

			let factor = 0.2 // Sides move less
			if (type === 1) factor = 1.0 // Mid moves full

			pos.setY(i, bY + wave * factor)
		}
		pos.needsUpdate = true
		// Przeliczanie normalnych geometrii wody
		// Wymagane dla poprawnego oświetlenia falującego mesha. Może być kosztowne, ale przy tej liczbie vertexów (7500) jest akceptowalne.
		waterRef.current.geometry.computeVertexNormals()
	})

	const treeMeshRef = useRef<THREE.InstancedMesh>(null)
	const leavesMeshRef = useRef<THREE.InstancedMesh>(null)

	useLayoutEffect(() => {
		if (!treeMeshRef.current || !leavesMeshRef.current) return
		const dummy = new THREE.Object3D()
		treeData.forEach((d, i) => {
			dummy.position.set(d.x, d.y, d.z)
			dummy.rotation.set(0, d.rot, 0)
			const s = d.scale * 3
			dummy.scale.set(s, s, s)
			dummy.updateMatrix()
			treeMeshRef.current!.setMatrixAt(i, dummy.matrix)
			leavesMeshRef.current!.setMatrixAt(i, dummy.matrix)
		})
		treeMeshRef.current.instanceMatrix.needsUpdate = true
		leavesMeshRef.current.instanceMatrix.needsUpdate = true
	}, [treeData])

	return (
		<group>
			<mesh geometry={geometry} receiveShadow>
				<meshStandardMaterial {...props} side={THREE.FrontSide} displacementScale={0} />
			</mesh>

			{/* Custom Water Strip */}
			<mesh ref={waterRef} geometry={waterGeometry}>
				<meshStandardMaterial
					color='#005599'
					transparent
					opacity={0.8}
					roughness={0.05}
					metalness={0.6}
					side={THREE.DoubleSide}
				/>
			</mesh>

			<instancedMesh ref={treeMeshRef} args={[treeGeo, undefined, treeData.length]} castShadow receiveShadow>
				<meshStandardMaterial color='#4a3c31' roughness={1} />
			</instancedMesh>

			<instancedMesh ref={leavesMeshRef} args={[leafGeoFinal, undefined, treeData.length]} castShadow receiveShadow>
				<meshStandardMaterial color='#1a4a1a' roughness={0.8} />
			</instancedMesh>
		</group>
	)
}

export default Ground
