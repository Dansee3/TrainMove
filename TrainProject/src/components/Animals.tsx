import { useMemo } from 'react'
import { getTrackInfo } from './trackUtils'
import { getNoiseHeight } from '../utils/noise'
import { getRiverCenterX, STATION_DEFS } from './worldConfig'
import { RoeDeerModel, RedDeerModel, WildBoarModel } from './AnimalModels'

// --- LOGIKA ROZMIESZCZANIA ZWIERZĄT (SPAWNING SYSTEM) ---

interface Animal {
	type: 'roe' | 'red' | 'boar'
	pos: [number, number, number]
	rot: number
	scale: number
}

const generateAnimals = (): Animal[] => {
	const animals: Animal[] = []

	const spawnHerd = (
		type: 'roe' | 'red' | 'boar',
		countRange: [number, number],
		zMin: number,
		zMax: number,
		offsetMin: number,
		offsetMax: number,
	) => {
		// Próba znalezienia bezpiecznego miejsca na stado
		let attempts = 0
		while (attempts < 50) {
			attempts++
			const zCenter = zMin + Math.random() * (zMax - zMin)
			const side = Math.random() > 0.5 ? 1 : -1
			const offCenter = offsetMin + Math.random() * (offsetMax - offsetMin)

			// Initial check for herd center
			const centerPos = getPlacement(zCenter, offCenter * side)

			// Unikanie stacji (Station Avoidance) - sprawdzamy wszystkie zdefiniowane stacje
			let nearStation = false
			for (const s of STATION_DEFS) {
				// Determine exclusion zone based on side
				// Simple box around station
				const dDist = Math.abs(centerPos.z - s.dist)
				if (dDist < 150) {
					// Safety buffer
					// Side check: if station is on side 1, exclude side 1 and track area
					// Station on side -1, exclude side -1
					// Here we just do a simple radius check for safety
					nearStation = true
					break
				}
			}
			if (nearStation) continue

			if (centerPos.y < -1.5) continue // Underwater check

			// Spawnowanie stada wokół wylosowanego centrum
			const herdSize = Math.floor(Math.random() * (countRange[1] - countRange[0] + 1)) + countRange[0]
			const herd: Animal[] = []

			for (let i = 0; i < herdSize; i++) {
				// Losowe przesunięcie od centrum stada (promień 15m)
				const r = Math.random() * 15
				const theta = Math.random() * Math.PI * 2
				const dx = Math.cos(theta) * r
				const dz = Math.sin(theta) * r

				const finalX = centerPos.x + dx
				const finalZ = centerPos.z + dz

				// Re-calculate height for individual animal
				const y = getHeightAt(finalX, finalZ)

				// Ścisła kontrola wody (Strict Water Check) - nie chcemy saren w rzece
				const rCx = getRiverCenterX(finalZ)
				const distToRiver = Math.abs(finalX - rCx)

				let isWater = false
				if (distToRiver < 160) isWater = true // Strefa buforowa rzeki
				if (y < -3) isWater = true // Dodatkowy próg wysokości

				if (!isWater) {
					herd.push({
						type,
						pos: [finalX, y, finalZ],
						rot: Math.random() * Math.PI * 2,
						scale: 0.9 + Math.random() * 0.2,
					})
				}
			}

			// Jeśli udało się stworzyć sensowne stado, zapisujemy je
			if (herd.length >= 3) {
				animals.push(...herd)
				return // Success for this herd call
			}
		}
	}

	// 1. SARNY (Roe Deer) - Łąki i tereny otwarte (Niskie Z)
	// Generujemy około 12 stad
	for (let i = 0; i < 35; i++) {
		spawnHerd('roe', [4, 7], 100, 1600, 30, 180)
	}

	// 2. JELENIE (Red Deer) - Lasy i wzgórza (Średnie Z)
	// Generujemy 10 stad
	for (let i = 0; i < 35; i++) {
		spawnHerd('red', [4, 6], 1800, 3800, 50, 250)
	}

	// 3. DZIKI (Wild Boar) - Okolice rzeki i koniec mapy (Wysokie Z)
	// Generujemy 10 stad
	for (let i = 0; i < 35; i++) {
		spawnHerd('boar', [4, 7], 3500, 4600, 40, 200)
	}

	return animals
}

// Pomocnicza funkcja znajdująca najbliższy punkt toru dla danych współrzędnych X, Z (Wyszukiwanie zgrubne i dokładne)
const getClosestTrackD = (x: number, z: number, maxDist = 5000, step = 10): number => {
	let minD = 0
	let minSq = Infinity

	for (let d = 0; d <= maxDist; d += step) {
		const info = getTrackInfo(d)
		const dx = x - info.x
		const dz = z - info.z
		const sq = dx * dx + dz * dz
		if (sq < minSq) {
			minSq = sq
			minD = d
		}
	}
	// Wyszukiwanie dokładne (Fine search) wokół znalezionego minimum
	let bestD = minD
	for (let d = Math.max(0, minD - step); d <= Math.min(maxDist, minD + step); d += 1) {
		const info = getTrackInfo(d)
		const dx = x - info.x
		const dz = z - info.z
		const sq = dx * dx + dz * dz
		if (sq < minSq) {
			minSq = sq
			bestD = d
		}
	}
	return bestD
}

// Obliczanie wysokości terenu w danym punkcie (Symulacja logiki z Ground.tsx)
const getHeightAt = (x: number, z: number) => {
	// 1. Pobranie bazowej wysokości toru (nasypu)
	const d = getClosestTrackD(x, z)
	const info = getTrackInfo(d)
	const baseHeight = info.height - 0.25

	// Calculate offset from track for flattening logic
	const dx = x - info.x
	const dz = z - info.z
	const distToTrack = Math.sqrt(dx * dx + dz * dz)

	// 2. Nałożenie szumu terenu (Noise)
	let noiseHeight = getNoiseHeight(x, z) * 1.5

	let noiseFactor = 1.0
	if (distToTrack < 6) noiseFactor = 0
	else if (distToTrack < 40) noiseFactor = (distToTrack - 6) / 34

	let val = baseHeight + noiseHeight * noiseFactor

	// 3. WYRÓWNYWANIE WOKÓŁ STACJI (Station Flattening)
	// Używamy wspólnej konfiguracji STATION_DEFS
	for (const s of STATION_DEFS) {
		const dist = Math.abs(d - s.dist)
		if (dist < 100) {
			const flatFactor = Math.max(0, 1.0 - dist / 100)
			val = val * (1 - flatFactor) + baseHeight * flatFactor
		}
	}

	let y = val

	// 4. WYCINANIE KORYTA RZEKI (River Carving)
	const rCx = getRiverCenterX(z)
	const riverWidth = 150
	const dist = Math.abs(x - rCx)
	const wY = baseHeight - 29

	if (dist < riverWidth) {
		const t = dist / riverWidth
		const smoothStep = t * t * (3 - 1.4 * t)
		const depthFactor = 2 - smoothStep
		const maxDepth = 7.0
		const desiredBedY = wY - 1 - maxDepth * depthFactor
		if (y > desiredBedY) {
			// Simple ease out
			y = y + (desiredBedY - y) * depthFactor * 0.5
		}
	}

	return y
}

const getPlacement = (z: number, offset: number) => {
	const info = getTrackInfo(z)
	const h = info.heading || 0
	// Perpendicular
	const dx = Math.cos(h) * offset
	const dz = -Math.sin(h) * offset

	const x = info.x + dx
	const finalZ = info.z + dz

	const y = getHeightAt(x, finalZ)

	return { x, y, z: finalZ }
}

const AnimalWrapper = ({ type, pos, scale, rot }: Animal) => {
	// Wrapper pozycjonujący model zwierzęcia i aplikujący rotację
	return (
		<group position={pos} rotation={[0, rot, 0]} scale={[scale, scale, scale]}>
			{type === 'roe' && <RoeDeerModel />}
			{type === 'red' && <RedDeerModel />}
			{type === 'boar' && <WildBoarModel />}
		</group>
	)
}

export const Animals = () => {
	// Memoizacja generowania, aby uniknąć przetasowań przy re-renderach
	const data = useMemo(() => generateAnimals(), [])

	return (
		<group>
			{data.map((anim, i) => (
				<AnimalWrapper key={i} {...anim} />
			))}
		</group>
	)
}
