import { useRef, useEffect } from 'react'
import { PerspectiveCamera, Environment, Sky } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'
import { Track } from './Track'
import { Train } from './Train'
import { Ground } from './Ground'

// --- KOMPONENT INTUICYJNEGO STEROWANIA WSAD ---
const SpectatorControls = ({ speed = 40 }) => {
	const { camera, gl } = useThree()
	const keys = useRef<{ [key: string]: boolean }>({})
	const mouse = useRef({ x: 0, y: 0, isDown: false })
	const rotation = useRef({ yaw: -Math.PI / 4, pitch: -0.3 }) // Startowa rotacja

	// Obsługa klawiatury
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

	// Zainicjujemy rotację kontrolera z aktualnej orientacji kamery
	useEffect(() => {
		const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
		rotation.current.pitch = euler.x
		rotation.current.yaw = euler.y
	}, [camera])

	// Obsługa myszki (Drag to look - bezpieczniejsze w przeglądarce niż PointerLock)
	useEffect(() => {
		const handleMouseDown = () => (mouse.current.isDown = true)
		const handleMouseUp = () => (mouse.current.isDown = false)
		const handleMouseMove = (e: MouseEvent) => {
			if (mouse.current.isDown) {
				const sensitivity = 0.003
				rotation.current.yaw -= e.movementX * sensitivity
				rotation.current.pitch -= e.movementY * sensitivity

				// BLOKADA: Nie pozwalamy patrzeć pionowo w górę/dół (zapobiega koziołkom)
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
		// 1. APLIKACJA ROTACJI (Bez ROLL - oś Z kamery zawsze pozioma)
		const euler = new THREE.Euler(rotation.current.pitch, rotation.current.yaw, 0, 'YXZ')
		camera.quaternion.setFromEuler(euler)

		// 2. RUCH
		const moveVector = new THREE.Vector3(0, 0, 0)
		if (keys.current['KeyW']) moveVector.z -= 1
		if (keys.current['KeyS']) moveVector.z += 1
		if (keys.current['KeyA']) moveVector.x -= 1
		if (keys.current['KeyD']) moveVector.x += 1
		if (keys.current['KeyR'] || keys.current['Space']) moveVector.y += 1
		if (keys.current['KeyF'] || keys.current['ShiftLeft']) moveVector.y -= 1

		if (moveVector.length() > 0) {
			moveVector.normalize()
			// Ruch relatywny do kierunku patrzenia
			moveVector.applyQuaternion(camera.quaternion)
			camera.position.addScaledVector(moveVector, speed * delta)
		}
	})

	return null
}

const FollowCamera = ({
	trainRef,
	resetSignal,
}: {
	trainRef: React.RefObject<THREE.Group | null>
	resetSignal?: number
}) => {
	const { camera, gl } = useThree()
	const theta = useRef(-Math.PI / 4)
	const phi = useRef(Math.PI / 2 - 0.4)
	const radius = useRef(60)
	const isDown = useRef(false)
	const prev = useRef<{ x: number; y: number } | null>(null)
	const prevReset = useRef<number | undefined>(undefined)

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
			phi.current = Math.max(0.1, Math.min(Math.PI - 0.1, phi.current - dy * sensitivity))
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

		// Reset camera orientation on reset signal
		if (resetSignal !== undefined && prevReset.current !== resetSignal) {
			theta.current = -Math.PI / 4
			phi.current = Math.PI / 2 - 0.4
			radius.current = 60
			prevReset.current = resetSignal
		}

		const spherical = new THREE.Spherical(radius.current, phi.current, theta.current)
		const offset = new THREE.Vector3().setFromSpherical(spherical)
		const target = new THREE.Vector3().copy(tRef.position).add(offset)

		camera.position.lerp(target, 0.12)
		camera.lookAt(tRef.position)
	})

	return null
}

export const Scene = ({ resetSignal }: { resetSignal?: number }) => {
	const { cameraMode } = useControls('Kamera', {
		cameraMode: {
			options: ['Śledzenie Pociągu', 'Latanie (WSAD)'],
			value: 'Śledzenie Pociągu',
			label: 'Tryb Kamery',
		},
	})

	const isFollowing = cameraMode === 'Śledzenie Pociągu'
	const isFly = cameraMode === 'Latanie (WSAD)'
	const trainRef = useRef<THREE.Group>(null)

	return (
		<>
			{/* Zwiększony zakres kamery, aby objąć długą trasę */}
			<PerspectiveCamera makeDefault position={[-50, 30, -50]} fov={45} far={10000} />

			{/* Widok WSAD - sterowanie jak w grze/dronie */}
			{isFly && <SpectatorControls speed={200} />}
			{/* Kamera przyklejona do pociągu z możliwością orbity myszką */}
			{isFollowing && <FollowCamera trainRef={trainRef} resetSignal={resetSignal} />}

			<ambientLight intensity={0.5} />
			<directionalLight position={[50, 100, 50]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} />

			{/* Ustaw environment jako tło sceny oraz powiększ sky (duża odległość) */}
			<Environment preset='sunset' background />
			<Sky distance={450000} sunPosition={[1000, 200, 1000]} turbidity={8} rayleigh={2} />

			{/* Podłoże i roślinność */}
			<Ground />
			<Track />
			<Train resetSignal={resetSignal} trainRef={trainRef} />

			{/* Fog dopasowany do koloru nieba, żeby nie tworzył czarnej tuby */}
			<fog attach='fog' args={['#87CEEB', 50, 20000]} />
		</>
	)
}
