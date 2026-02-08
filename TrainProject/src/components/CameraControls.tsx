import React, { useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getTrackInfo, TRACK_SEGMENTS } from './trackUtils'
import { getNoiseHeight } from '../utils/noise'
import { STATION_DEFS } from './worldConfig'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const TRACK_STEP = 2
const EXTEND_STEPS = 60
const TRACK_SEARCH_STEP = 20
const TRACK_REFINE_STEP = 2

const TOTAL_TRACK_LENGTH = TRACK_SEGMENTS.reduce((s, seg) => s + seg.length, 0)
const MIN_TERRAIN_DIST = -EXTEND_STEPS * TRACK_STEP
const MAX_TERRAIN_DIST = TOTAL_TRACK_LENGTH + EXTEND_STEPS * TRACK_STEP

const TERRAIN_HALF_WIDTH = 600

const MAX_SIDE_OFFSET = TERRAIN_HALF_WIDTH

const MAX_CAMERA_Y = 200

const estimateTrackDistance = (position: THREE.Vector3) => {
	let bestDist = 0
	let bestSq = Number.POSITIVE_INFINITY

	for (let d = 0; d <= TOTAL_TRACK_LENGTH; d += TRACK_SEARCH_STEP) {
		const info = getTrackInfo(d)
		const dx = position.x - info.x
		const dz = position.z - info.z
		const sq = dx * dx + dz * dz
		if (sq < bestSq) {
			bestSq = sq
			bestDist = d
		}
	}

	const refineStart = Math.max(0, bestDist - TRACK_SEARCH_STEP)
	const refineEnd = Math.min(TOTAL_TRACK_LENGTH, bestDist + TRACK_SEARCH_STEP)
	for (let d = refineStart; d <= refineEnd; d += TRACK_REFINE_STEP) {
		const info = getTrackInfo(d)
		const dx = position.x - info.x
		const dz = position.z - info.z
		const sq = dx * dx + dz * dz
		if (sq < bestSq) {
			bestSq = sq
			bestDist = d
		}
	}

	return bestDist
}

const estimateTrackDistanceNear = (position: THREE.Vector3, hintDist?: number) => {
	if (hintDist === undefined) return estimateTrackDistance(position)

	const window = TRACK_SEARCH_STEP * 6
	let bestDist = hintDist
	let bestSq = Number.POSITIVE_INFINITY

	const start = Math.max(0, hintDist - window)
	const end = Math.min(TOTAL_TRACK_LENGTH, hintDist + window)
	for (let d = start; d <= end; d += TRACK_REFINE_STEP) {
		const info = getTrackInfo(d)
		const dx = position.x - info.x
		const dz = position.z - info.z
		const sq = dx * dx + dz * dz
		if (sq < bestSq) {
			bestSq = sq
			bestDist = d
		}
	}

	const farThreshold = MAX_SIDE_OFFSET * 2 * (MAX_SIDE_OFFSET * 2)
	if (bestSq > farThreshold) return estimateTrackDistance(position)
	return bestDist
}

const clampToTerrainBounds = (position: THREE.Vector3, hintDist?: number) => {
	const nearestDist = estimateTrackDistanceNear(position, hintDist)
	const nearestInfo = getTrackInfo(nearestDist)
	const h = nearestInfo.heading || 0
	const rightX = Math.cos(h)
	const rightZ = -Math.sin(h)
	const forwardX = Math.sin(h)
	const forwardZ = Math.cos(h)

	const relX = position.x - nearestInfo.x
	const relZ = position.z - nearestInfo.z
	const sideOffset = relX * rightX + relZ * rightZ
	const forwardOffset = relX * forwardX + relZ * forwardZ
	const estimatedDist = nearestDist + forwardOffset
	const clampedDist = clamp(estimatedDist, MIN_TERRAIN_DIST, MAX_TERRAIN_DIST)

	const clampedInfo = getTrackInfo(clampedDist)
	const clampedHeading = clampedInfo.heading || 0
	const clampedRightX = Math.cos(clampedHeading)
	const clampedRightZ = -Math.sin(clampedHeading)
	const clampedSide = clamp(sideOffset, -MAX_SIDE_OFFSET, MAX_SIDE_OFFSET)

	position.x = clampedInfo.x + clampedRightX * clampedSide
	position.z = clampedInfo.z + clampedRightZ * clampedSide

	return clampedDist
}

// --- KOMPONENT INTUICYJNEGO STEROWANIA WSAD ---
export const SpectatorControls = ({ speed }: { speed: number }) => {
	const { camera, gl } = useThree()
	const keys = useRef<{ [key: string]: boolean }>({})
	const mouse = useRef({ x: 0, y: 0, isDown: false })
	const rotation = useRef({ yaw: 0, pitch: 0 })
	const isInitialized = useRef(false)
	const lastTrackDist = useRef<number | undefined>(undefined)

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => (keys.current[e.code] = true)
		const handleKeyUp = (e: KeyboardEvent) => (keys.current[e.code] = false)
		window.addEventListener('keydown', handleKeyDown)
		window.addEventListener('keyup', handleKeyUp)
		return () => {
			window.removeEventListener('keydown', handleKeyDown)
			window.removeEventListener('keyup', handleKeyUp)
		}
	}, [])

	useEffect(() => {
		const handleMouseDown = () => (mouse.current.isDown = true)
		const handleMouseUp = () => (mouse.current.isDown = false)
		const handleMouseMove = (e: MouseEvent) => {
			if (mouse.current.isDown) {
				const sensitivity = 0.003
				rotation.current.yaw -= e.movementX * sensitivity
				rotation.current.pitch -= e.movementY * sensitivity
				rotation.current.pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, rotation.current.pitch))
			}
		}
		gl.domElement.addEventListener('mousedown', handleMouseDown)
		window.addEventListener('mouseup', handleMouseUp)
		window.addEventListener('mousemove', handleMouseMove)
		return () => {
			gl.domElement.removeEventListener('mousedown', handleMouseDown)
			window.removeEventListener('mouseup', handleMouseUp)
			window.removeEventListener('mousemove', handleMouseMove)
		}
	}, [gl])

	useFrame((_, delta) => {
		if (!isInitialized.current) {
			const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
			rotation.current.pitch = euler.x
			rotation.current.yaw = euler.y
			isInitialized.current = true
		}

		const euler = new THREE.Euler(rotation.current.pitch, rotation.current.yaw, 0, 'YXZ')
		camera.quaternion.setFromEuler(euler)

		const moveVector = new THREE.Vector3(0, 0, 0)
		if (keys.current['KeyW']) moveVector.z -= 1
		if (keys.current['KeyS']) moveVector.z += 1
		if (keys.current['KeyA']) moveVector.x -= 1
		if (keys.current['KeyD']) moveVector.x += 1
		if (keys.current['KeyR'] || keys.current['Space']) moveVector.y += 1
		if (keys.current['KeyF'] || keys.current['ShiftLeft'] || keys.current['ShiftRight']) moveVector.y -= 1

		if (moveVector.length() > 0) {
			moveVector.normalize()
			moveVector.applyQuaternion(camera.quaternion)
			camera.position.addScaledVector(moveVector, speed * delta)
		}

		// --- ŚCISŁE GRANICE MAPY (Blokada kamery) ---
		// Blokujemy pozycję kamery, aby gracz nie wyleciał poza wygenerowany świat gry.
		const clampedDist = clampToTerrainBounds(camera.position, lastTrackDist.current)
		lastTrackDist.current = clampedDist

		// Detekcja kolizji z terenem
		// Obliczamy dokładną wysokość terenu pod kamerą, aby nie wpadła pod ziemię.
		const info = getTrackInfo(clampedDist)
		const baseHeight = info.height + 10.25
		let terrainY = getNoiseHeight(camera.position.x, camera.position.z) * 1.5 + baseHeight

		// Wygładzanie terenu w pobliżu stacji (spójne z logiką w Ground.tsx)
		// Zapobiega "skakaniu" kamery na peronach.
		for (const s of STATION_DEFS) {
			const dist = Math.abs(camera.position.z - s.dist)
			if (dist < 100) {
				const flatFactor = Math.max(0, 1.0 - dist / 100)
				terrainY = terrainY * (1 - flatFactor) + baseHeight * flatFactor
			}
		}

		// Utrzymywanie minimalnej wysokości nad terenem (2.0 jednostki)
		const minY = terrainY + 3.0
		if (camera.position.y < minY) camera.position.y = minY
		if (camera.position.y > MAX_CAMERA_Y) camera.position.y = MAX_CAMERA_Y
	})

	return null
}

export const FollowCamera = ({
	trainRef,
	resetSignal,
}: {
	trainRef: React.RefObject<THREE.Group | null>
	resetSignal?: number
}) => {
	const { camera, gl } = useThree()
	const theta = useRef(-Math.PI / 4)
	const phi = useRef(Math.PI / 2 - 0.4)
	const radius = useRef(90)
	const isDown = useRef(false)
	const prev = useRef<{ x: number; y: number } | null>(null)
	const prevReset = useRef<number | undefined>(undefined)
	const isInitialized = useRef(false)
	const lastTrackDist = useRef<number | undefined>(undefined)

	useEffect(() => {
		const el = gl.domElement
		const onDown = (e: PointerEvent) => {
			if (e.button !== 0) return
			isDown.current = true
			prev.current = { x: e.clientX, y: e.clientY }
			el.setPointerCapture?.(e.pointerId)
		}
		const onUp = () => {
			isDown.current = false
			prev.current = null
		}
		const onMove = (e: PointerEvent) => {
			if (!isDown.current || !prev.current) return
			const dx = e.clientX - prev.current.x
			const dy = e.clientY - prev.current.y
			prev.current = { x: e.clientX, y: e.clientY }
			const sensitivity = 0.005
			theta.current -= dx * sensitivity
			const maxPhi = (85 * Math.PI) / 180
			phi.current = Math.max(0.1, Math.min(maxPhi, phi.current - dy * sensitivity))
		}
		const onWheel = (e: WheelEvent) => {
			radius.current = Math.max(10, radius.current + e.deltaY * 0.05)
		}

		el.addEventListener('pointerdown', onDown)
		window.addEventListener('pointerup', onUp)
		window.addEventListener('pointermove', onMove)
		el.addEventListener('wheel', onWheel, { passive: true })
		return () => {
			el.removeEventListener('pointerdown', onDown)
			window.removeEventListener('pointerup', onUp)
			window.removeEventListener('pointermove', onMove)
			el.removeEventListener('wheel', onWheel)
		}
	}, [gl])

	useFrame(() => {
		const tRef = trainRef.current
		if (!tRef) return

		// Inicjalizacja pozycji startowej kamery na podstawie aktualnego widoku ze Sceny
		// Zapewnia płynne przejście między trybami kamer.
		if (!isInitialized.current) {
			const offset = new THREE.Vector3().subVectors(camera.position, tRef.position)
			const sphere = new THREE.Spherical().setFromVector3(offset)
			theta.current = sphere.theta
			phi.current = sphere.phi
			radius.current = sphere.radius
			isInitialized.current = true
		}

		if (resetSignal !== undefined && prevReset.current !== resetSignal) {
			// Przy resecie gry ustawiam kamerę na domyślną, "ładną" pozycję (patrzy w przód/prawo)
			theta.current = Math.PI * 1.05 // ok. 144 stopnie (za/lewo), patrzy w przód/prawo
			phi.current = Math.PI / 2.3 // bliżej poziomu
			radius.current = 110
			prevReset.current = resetSignal
		}

		const spherical = new THREE.Spherical(radius.current, phi.current, theta.current)
		const offset = new THREE.Vector3().setFromSpherical(spherical)
		const target = new THREE.Vector3().copy(tRef.position).add(offset)

		// Ograniczenie celu kamery (przycinanie) - kamera nie wyjeżdża poza mapę
		const clampedDist = clampToTerrainBounds(target, lastTrackDist.current)
		lastTrackDist.current = clampedDist

		// Kolizja z ziemią
		const info = getTrackInfo(clampedDist)
		// Przybliżona wysokość bazowa od toru
		const baseHeight = info.height - 0.25
		let terrainY = getNoiseHeight(target.x, target.z) * 1.5 + baseHeight

		// Sprawdzenie spłaszczenia przy stacji
		for (const s of STATION_DEFS) {
			const dist = Math.abs(target.z - s.dist)
			if (dist < 100) {
				const flatFactor = Math.max(0, 1.0 - dist / 100)
				terrainY = terrainY * (1 - flatFactor) + baseHeight * flatFactor
			}
		}

		const minY = terrainY + 2.0
		if (target.y < minY) target.y = minY
		if (target.y > MAX_CAMERA_Y) target.y = MAX_CAMERA_Y

		camera.position.lerp(target, 0.12)
		if (camera.position.y > MAX_CAMERA_Y) camera.position.y = MAX_CAMERA_Y
		camera.lookAt(tRef.position)
	})

	return null
}
