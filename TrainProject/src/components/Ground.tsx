import React, { useMemo, useLayoutEffect, useRef } from 'react'
import { TRACK_SEGMENTS, getTrackInfo } from './trackUtils'
import { getNoiseHeight } from '../utils/noise'
import * as THREE from 'three'
import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { getRiverCenterX, STATION_DEFS } from './worldConfig'

// Statyczne geometrie
const treeGeo = new THREE.CylinderGeometry(0.2, 0.4, 3, 5)
treeGeo.translate(0, 1.5, 0)
const leafGeoFinal = new THREE.ConeGeometry(1.5, 4, 7)
leafGeoFinal.translate(0, 4, 0)

export const Ground: React.FC = () => {
	const totalTrackLength = useMemo(() => TRACK_SEGMENTS.reduce((s, seg) => s + seg.length, 0), [])

	// Ustawienia tekstur
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
		result.push(-600, -450, -300, -200, -100, -60, -40, -20)
		result.push(-10, -6, -3, -1.8, 0)
		result.push(1.8, 3, 6, 10, 20, 40, 60, 100)
		result.push(200, 300, 450, 600)
		return result.sort((a, b) => a - b)
	}, [])

	const { geometry, treeData, waterGeometry } = useMemo(() => {
		const positions: number[] = []
		const uvs: number[] = []
		const indices: number[] = []
		const rowSize = offsets.length

		const trackStep = 2.0
		const totalSteps = Math.ceil(totalTrackLength / trackStep)

		// 1. ROZSZERZONE GRANICE MAPY (poszerzony obszar)
		// Generujemy dodatkowe segmenty przed startem i za końcem, aby uniknąć pustki
		const extendSteps = 60
		const startStep = -extendSteps
		const endStep = totalSteps + extendSteps
		const totalGeneratedSteps = endStep - startStep + 1
		const heightGrid = new Float32Array(totalGeneratedSteps * rowSize)

		const waterPos: number[] = []
		const waterBaseYs: number[] = [] // Bazowa wysokość do animacji
		const waterInd: number[] = []

		for (let i = startStep; i <= endStep; i++) {
			const d = i * trackStep

			// Bezpieczne pobieranie info o torze (z ekstrapolacją dla krańców)
			const clampedD = Math.max(0, Math.min(d, totalTrackLength))
			const info = getTrackInfo(clampedD)

			const delta = d - clampedD
			const h = info.heading || 0
			// Wektor normalny (prawa strona)
			const px = Math.cos(h)
			const pz = -Math.sin(h)
			// Wektor styczny (do przodu)
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

				// 1. GENEROWANIE BAZY I SZUMU (szum)
				const noiseVal = getNoiseHeight(wx, wz) * 1.5

				// Wygładzanie w pobliżu torowiska (spłaszczenie)
				const absOff = Math.abs(off)
				let noiseFactor = 1.0
				if (absOff < 6) noiseFactor = 0
				else if (absOff < 40) noiseFactor = (absOff - 6) / 34 // Stały zakres (40-6=34) dla płynnego przejścia 0-1

				let wy = baseHeight + noiseVal * noiseFactor

				// 2. KORYTO RZEKI (wycinanie)
				// Wycinanie proceduralne koryta w terenie
				const riverCenterX = getRiverCenterX(centerZ)
				const riverHalfWidth = 150
				const riverEdge = riverCenterX - riverHalfWidth
				const riverFarEdge = riverCenterX + riverHalfWidth

				// Sprawdzenie, czy punkt jest w obrębie rzeki
				if (wx > riverEdge && wx < riverFarEdge) {
					// Odległość od środka rzeki
					const distFromRiverCenter = Math.abs(wx - riverCenterX)
					// Normalizacja: 0 w środku, 1 na brzegu
					const normalizedDist = distFromRiverCenter / riverHalfWidth

					// Zastosowanie krzywej parabolicznej dla profilu dna rzeki
					// Głębiej na środku, płycej przy brzegach
					const riverDepthFactor = 1 - Math.pow(normalizedDist, 2) // Parabola
					const maxRiverDepth = 10 // Maksymalna głębokość
					const riverBedY = wY - maxRiverDepth * riverDepthFactor - 10

					// Mieszanie wysokości terenu z dnem rzeki (blend)
					// Tworzymy płynne przejście brzegu
					const blendStart = riverHalfWidth * 0.8 // Początek blendowania (80% szerokości)
					const blendEnd = riverHalfWidth // Koniec blendowania
					let blendFactor = 0
					if (distFromRiverCenter > blendStart) {
						blendFactor = (distFromRiverCenter - blendStart) / (blendEnd - blendStart)
					}

					wy = THREE.MathUtils.lerp(riverBedY, wy, blendFactor)
				}

				// 3. WYCINANIE POD TOROWISKO
				// Wyrównanie terenu bezpośrednio pod torami
				// POMIJAMY DLA MOSTU (2050 - 2750) - tam teren ma opaść naturalnie
				const isBridge = d > 2050 && d < 2750

				if (!isBridge) {
					if (absOff < 1.8) {
						wy = baseHeight
					} else if (absOff < 3) {
						// Płynne przejście z toru na teren
						const trackBlendFactor = (absOff - 1.8) / (3 - 1.8)
						wy = THREE.MathUtils.lerp(baseHeight, wy, trackBlendFactor)
					}
				} else {
					// Logika mostu: robimy dolinę/pad pod mostem
					if (absOff < 25) {
						// Współczynnik głębokości zależny od odległości od środka
						// Środek (0) -> najgłębiej (-20m)
						// Brzeg (25) -> bez zmian
						const bridgeValleyFactor = Math.cos((absOff / 25) * (Math.PI / 2))
						const drop = 20 * bridgeValleyFactor
						wy -= drop
					}
				}

				// 4. WYRÓWNYWANIE POD STACJAMI (spłaszczenie)
				// Wymuszamy płaski teren wokół stacji, aby budynki nie wisiały ani nie tonęły
				for (const s of STATION_DEFS) {
					const distDiff = d - s.dist
					// Pole kwadratowe: +/- 50m wzdłuż toru i wystarczająco szeroko na boki
					if (Math.abs(distDiff) < 50) {
						// Spłaszczamy po stronie stacji, lekko zahaczając drugą stronę, żeby objąć tor
						// Strona 1 (prawa): przesunięcie > -5 do 50
						// Strona -1 (lewa): przesunięcie < 5 do -50
						if (s.side === 1) {
							if (off > -5 && off < 50) wy = baseHeight
						} else {
							if (off < 5 && off > -50) wy = baseHeight
						}
					}
				}

				positions.push(wx, wy, wz)
				uvs.push(wx * 0.02, wz * 0.02) // UV dla teksturowania

				// Zapis do siatki (indeksowanie od zera)
				const gridIndex = (i - startStep) * rowSize + j
				heightGrid[gridIndex] = wy
			}

			// --- GENEROWANIE WODY (siatka wody) ---
			const rCx = getRiverCenterX(centerZ)
			const halfWidth = 150
			// Usuwam statyczną falę, baza ma być "na zero" bez animacji
			// "baseY" ma być wartością BEZ dynamicznej fali
			// Wcześniej było: sin(centerZ * 0.002 + i * 0.1) * 2.5
			// Liczę tylko pozycje spoczynkowe (boki/środek)

			const edgeDrop = 2.6
			const centerLift = 0.05

			// Liczę granice toru dla tego Z, żeby przyciąć wodę
			// "centerX" to środek toru na tym kroku
			// Teren idzie od centerX - 600 do centerX + 600
			const minX = centerX - 600
			const maxX = centerX + 600

			const wLeft = Math.max(minX + 5, Math.min(maxX - 5, rCx - halfWidth - 20))
			const wMid = Math.max(minX + 5, Math.min(maxX - 5, rCx))
			const wRight = Math.max(minX + 5, Math.min(maxX - 5, rCx + halfWidth + 20))

			const waterSurfaceY = wY - 2.5 // Wizualnie trochę niżej

			// Bazowe Y (pozycje spoczynkowe)
			const yLeft = waterSurfaceY - edgeDrop
			const yMid = waterSurfaceY + centerLift - 0.5
			const yRight = waterSurfaceY - edgeDrop

			// Wrzucam pozycje startowe (i tak useFrame je nadpisuje)
			// Na początek zapisuję też bazę do waterPos
			waterPos.push(wLeft, yLeft, centerZ)
			waterPos.push(wMid, yMid, centerZ)
			waterPos.push(wRight, yRight, centerZ)

			// Zapis bazowych Y
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

		// Indeksy terenu
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
		wGeom.setAttribute('baseY', new THREE.Float32BufferAttribute(waterBaseYs, 1)) // Własny atrybut
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

			// Interpolacja po trójkątach, zgodna z siatką
			// Indeksy siatki: (0,0), (1,1), (0,1) -> góra/prawa (u >= v) gdy u=colT, v=rowT
			//                 (0,0), (1,0), (1,1) -> dół/lewa (v > u)
			// u = colT, v = rowT

			if (rowT > colT) {
				// Trójkąt (0,0)-(1,0)-(1,1) [a, c, d]
				// Wysokość = h00 + (h10 - h00)*v + (h11 - h10)*u
				return h00 + (h10 - h00) * rowT + (h11 - h10) * colT
			} else {
				// Trójkąt (0,0)-(1,1)-(0,1) [a, d, b]
				// Wysokość = h00 + (h01 - h00)*u + (h11 - h01)*v
				return h00 + (h01 - h00) * colT + (h11 - h01) * rowT
			}
		}

		// --- GENEROWANIE DRZEW (rozmieszczanie) ---
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
		const rng = lcg(137)

		// Zwiększona liczba drzew, żeby było gęściej
		const baseTreeCount = Math.floor(totalTrackLength * 2.5)

		for (let k = 0; k < baseTreeCount; k++) {
			// Losowa pozycja wzdłuż toru, z marginesem
			// -100 do totalLength + 100
			const trD = rng() * (totalTrackLength + 200) - 100

			// 1. DRZEWA PRZYTOROWE I NADRZECZNE (blisko toru)
			// Losujemy stronę i sprawdzamy, czy grunt nadaje się do posadzenia drzewa
			const side = rng() > 0.5 ? 1 : -1
			const trOff = 15 + Math.abs(rng()) * 450 // Max ~465, safe within 500

			// Czasem generuję obie strony
			const passCount = rng() > 0.7 ? 2 : 1

			// Gęściej przy rzece na końcu mapy
			const isEndRiver = trD > 3000
			const loopCount = isEndRiver ? passCount + 1 : passCount

			for (let p = 0; p < loopCount; p++) {
				const currentSide = p === 0 ? side : -side

				// 2. DRZEWA W TLE (dalszy plan)
				// Czasami wymuszamy drzewo daleko w tle dla głębi
				const isFar = rng() > 0.8
				// Maksymalne przesunięcie: 500
				// Jeśli daleko: początek 200, + do 300 -> max 500
				const actualOff = isFar ? 200 + Math.abs(rng()) * 300 : trOff

				// Dopychamy gęstość drzew przy końcu i rzece
				if (isEndRiver && p === 2) {
					// To jest mój dodatkowy przebieg
					// Rzeka jest mniej więcej przy X=350 (z getRiverCenterX)
					// Tor jest obok
					// Chciałem sadzić drzewa przy X~350, ale pętla działa na offsetach od toru
				}

				const tInfo = getTrackInfo(trD)
				const tH = tInfo.heading || 0
				const tPx = Math.cos(tH)
				const tPz = -Math.sin(tH)

				const tx = tInfo.x + tPx * currentSide * actualOff
				const tz = tInfo.z + tPz * currentSide * actualOff

				// Ostre sprawdzenie granic
				// Siatka terenu dochodzi zwykle do ~600 offsetu
				// Trzymam drzewa w bezpiecznym zakresie, żeby stały na wygenerowanej geometrii
				if (tx < -600 || tx > 600) continue

				// --- KONKRET: WIĘCEJ DRZEW PRZY RZECE NA KOŃCU ---
				// Jeśli jestem na końcu i trafiłem miejsce nieprzy rzece,
				// to próbuję to dociążyć
				// Alternatywa: osobna pętla na dodatkowe drzewa
				// Albo zostawić to losowi
				// Użytkownik chce "więcej drzew"

				// Docelowo dorzucić osobną pętlę dla drzew przy rzece po tej pętli
				// Na razie lecę tą samą

				// Omijam obszar toru
				if (actualOff < 12) continue

				// Omijam perony
				const dToStart = Math.abs(trD - 20)
				const dToEnd = Math.abs(trD - 4780) // Pozycja stacji końcowej

				// Wykluczenie stacji Piwniczna (kwadrat)
				// Stacja jest przy d=2950, strona=-1 (lewa, przesunięcie ~-12)
				// Wykluczam d w [2900, 3000] i przesunięcie w [-40, 20] (lewa + tor i tuż za nim)
				// Uwaga: currentSide * actualOff to podpisane przesunięcie
				const signedOff = currentSide * actualOff
				if (trD > 2900 && trD < 3000 && signedOff > -60 && signedOff < 40) continue

				// Ale pozwalam na drzewa ZA stacjami (dalekie przesunięcie)
				const behindStation = actualOff > 100
				if ((dToStart < 60 || dToEnd < 80) && !behindStation) continue // Większy bufor dla stacji końcowej

				// Omijam rzekę
				const rCx_tree = getRiverCenterX(tz)
				// Szersze wykluczenie rzeki (połowa szerokości to 150)
				// 160 daje pewność, że drzewa są na brzegu
				if (Math.abs(tx - rCx_tree) < 170) continue

				// Sprawdzenie granic mapy (Z)
				// Siatka terenu idzie mniej więcej od -300 do totalLength+300
				// Drzewa powinny być bezpieczne

				if (hasNearbyTree(tx, tz)) continue

				const terrainY = sampleHeightFromGrid(trD, currentSide * actualOff)
				if (!Number.isFinite(terrainY)) continue

				// Kontrola wysokości: bez sadzenia pod wodą
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

		return { geometry: geom, treeData: tData, waterGeometry: wGeom }
	}, [totalTrackLength, offsets])

	// Referencja wody do animacji
	const waterRef = useRef<THREE.Mesh>(null)

	useFrame(({ clock }) => {
		if (!waterRef.current) return
		const geo = waterRef.current.geometry
		const pos = geo.attributes.position
		const baseY = geo.getAttribute('baseY') // Do sprawdzenia, czy typ jest OK

		if (!baseY) return

		const time = clock.elapsedTime
		const count = pos.count

		// Aktualizacja Y: baza + sinusoida
		for (let i = 0; i < count; i++) {
			const z = pos.getZ(i)
			const bY = baseY.getX(i)

			// Typ wierzchołka: 0=lewa, 1=środek, 2=prawa
			const type = i % 3

			// Fala przepływu: z * 0.05 (przestrzeń), time * 1.5 (czas)
			const wave = Math.sin(z * 0.05 - time * 1.5) * 2.5

			let factor = 0.2 // Boki ruszają się mniej
			if (type === 1) factor = 1.0 // Środek rusza się pełną falą

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
			const s = d.scale * 2
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

			{/* Własny pasek wody */}
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
