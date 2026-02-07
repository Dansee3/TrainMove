import React, { useRef, useEffect, useState } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getTrackInfo } from './trackUtils'
import { getNoiseHeight } from '../utils/noise'
import { STATION_DEFS } from './worldConfig'

// --- KOMPONENT INTUICYJNEGO STEROWANIA WSAD ---
export const SpectatorControls = ({ speed }: { speed: number }) => {
	const { camera, gl } = useThree()
	const keys = useRef<{ [key: string]: boolean }>({})
	const mouse = useRef({ x: 0, y: 0, isDown: false })
	const rotation = useRef({ yaw: 0, pitch: 0 })
	const isInitialized = useRef(false)

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
		if (keys.current['KeyR']) moveVector.y += 1
		if (keys.current['KeyF']) moveVector.y -= 1

		if (moveVector.length() > 0) {
			moveVector.normalize()
			moveVector.applyQuaternion(camera.quaternion)
			camera.position.addScaledVector(moveVector, speed * delta)
		}

		// --- ŚCISŁE GRANICE MAPY (Blokada kamery) ---
		// Blokujemy pozycję kamery, aby gracz nie wyleciał poza wygenerowany świat gry.
		const maxX = 700
		const minX = -700
		const maxZ = 5200
		const minZ = -100

		if (camera.position.x > maxX) camera.position.x = maxX
		if (camera.position.x < minX) camera.position.x = minX
		if (camera.position.z > maxZ) camera.position.z = maxZ
		if (camera.position.z < minZ) camera.position.z = minZ

		// Detekcja kolizji z terenem
		// Obliczamy dokładną wysokość terenu pod kamerą, aby nie wpadła pod ziemię.
		const info = getTrackInfo(camera.position.z)
		const baseHeight = info.height - 0.25
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
		const minY = terrainY + 2.0
		if (camera.position.y < minY) camera.position.y = minY
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
			// Przy resecie gry, ustawiamy kamerę na domyślną, "ładną" pozycję (patrząc w przód/prawo)
			theta.current = Math.PI * 1.1 // ~144 degrees (Behind/Left) looking Forward/Right
			phi.current = Math.PI / 2.2 // Closer to horizontal
			radius.current = 110
			prevReset.current = resetSignal
		}

		const spherical = new THREE.Spherical(radius.current, phi.current, theta.current)
		const offset = new THREE.Vector3().setFromSpherical(spherical)
		const target = new THREE.Vector3().copy(tRef.position).add(offset)

		// Ograniczenie celu kamery (Target Clamping) - kamera nie wyjeżdża poza mapę
		const maxX = 700
		const minX = -700
		const maxZ = 5200
		const minZ = -100

		if (target.x > maxX) target.x = maxX
		if (target.x < minX) target.x = minX
		if (target.z > maxZ) target.z = maxZ
		if (target.z < minZ) target.z = minZ

		// Ground Collision
		const info = getTrackInfo(target.z)
		// Przybliżona wysokość bazowa od toru
		const baseHeight = info.height - 0.25
		let terrainY = getNoiseHeight(target.x, target.z) * 1.5 + baseHeight

		// Station flattening check
		for (const s of STATION_DEFS) {
			const dist = Math.abs(target.z - s.dist)
			if (dist < 100) {
				const flatFactor = Math.max(0, 1.0 - dist / 100)
				terrainY = terrainY * (1 - flatFactor) + baseHeight * flatFactor
			}
		}

		const minY = terrainY + 2.0
		if (target.y < minY) target.y = minY

		camera.position.lerp(target, 0.12)
		camera.lookAt(tRef.position)
	})

	return null
}
