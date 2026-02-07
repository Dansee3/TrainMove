import { useRef, useEffect, Suspense } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, Clone } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore } from '../store'
import { getTrackInfo, TRACK_SEGMENTS } from './trackUtils'

interface TrainProps {
	resetSignal?: number
	trainRef: React.RefObject<THREE.Group | null>
}

export const Train = ({ resetSignal, trainRef }: TrainProps) => {
	const locomotive = useGLTF('/Train.glb')
	const carriage = useGLTF('/train_carriage.glb')

	const locomotiveScale = .0025
	const carriageScale = .9
	const locomotiveOffset: [number, number, number] = [-0.3, -2.4, 0]
	const carriageOffset: [number, number, number] = [0, 0.15, 0]
	const carriageSpacing = 18.5
	const carriageCount = 4
	const carriageHalfLength = carriageSpacing * 0.45
	const locomotiveHalfLength = carriageSpacing * 0.5
	const modelRotation: [number, number, number] = [0, Math.PI, 0]
	const carriageRotation: [number, number, number] = [0, 1.57, 0]

	const carriageRefs = useRef<Array<THREE.Group | null>>([])
	const setCarriageRef = (index: number) => (node: THREE.Group | null) => {
		carriageRefs.current[index] = node
	}

	const applyGroupOnTrack = (group: THREE.Group | null, dist: number, halfLength: number) => {
		if (!group) return
		const center = getTrackInfo(dist)
		const front = getTrackInfo(dist + halfLength)
		const rear = getTrackInfo(dist - halfLength)
		const dx = front.x - rear.x
		const dy = front.height - rear.height
		const dz = front.z - rear.z
		const yaw = Math.atan2(dx, dz)
		const pitch = Math.atan2(dy, Math.hypot(dx, dz))

		group.position.set(center.x, center.height, center.z)
		group.rotation.set(0, yaw, 0)
		group.rotateX(-pitch)
	}

	// Stan fizyki - referencje do zmiennych mutowalnych, aby uniknąć zbędnych re-renderów
	const velocity = useRef(0)
	const distance = useRef(0)
	const smoothedBrake = useRef(0) // Startowa wartość hamowania: 0

	// Subskrypcja do store'a zmian w stanie gry (Zustand)
	const mass = useGameStore(s => s.mass)
	const physicsParams = useGameStore(s => s.physicsParams)
	const throttle = useGameStore(s => s.throttle)
	const brake = useGameStore(s => s.brake)
	const updatePhysics = useGameStore(s => s.updatePhysics)
	const updateForces = useGameStore(s => s.updateForces)

	const startStationCenter = 20
	const startTrainDistance = startStationCenter + carriageSpacing * 2

	// Inicjalizacja pozycji pociągu
	useEffect(() => {
		// Startujemy tak, aby 3. wagon od końca stał na polowie dlugosci stacji (srodek peronu ~20m)
		distance.current = startTrainDistance
		velocity.current = 0
		smoothedBrake.current = 0
		if (trainRef.current) {
			applyGroupOnTrack(trainRef.current, startTrainDistance, locomotiveHalfLength)
		}
		updatePhysics(0, startTrainDistance)
	}, [resetSignal])

	useEffect(() => {
		const enableShadows = (root: THREE.Object3D) => {
			root.traverse(obj => {
				const mesh = obj as THREE.Mesh
				if (mesh.isMesh) {
					mesh.castShadow = true
					mesh.receiveShadow = true
				}
			})
		}

		enableShadows(locomotive.scene)
		enableShadows(carriage.scene)
	}, [locomotive, carriage])

	useFrame((_, delta) => {
		// ... existing physics loop ...
		// No changes needed here, just the Init effect above.
		if (!trainRef.current) return

		// Ograniczenie kroku czasowego (time step clamping) dla zachowania stabilności symulacji
		const dt = Math.min(delta, 0.1)

		// 1. Pobranie danych o torze i otoczeniu

		// LOGIKA WYGŁADZANIA NACHYLENIA (SMOOTH SLOPE):
		// Zamiast brać natychmiastowe nachylenie segmentu (które może gwałtownie skakać),
		// obliczamy nachylenie na długości lokomotywy (~10m), co daje bardziej naturalne zachowanie.
		const frontInfo = getTrackInfo(distance.current + 5)
		const rearInfo = getTrackInfo(distance.current - 5)
		const angle = Math.atan2(frontInfo.height - rearInfo.height, 10) // Wygładzony kąt nachylenia

		// 2. Stałe fizyczne i parametry konfiguracyjne
		const g = 9.81
		const {
			frictionCoefficient,
			airResistance,
			maxPower,
			brakeForceMax,
			brakeAdhesionCoeff,
			extraFriction,
			massMultiplier,
			powerMultiplier,
			maxSpeedLimit,
		} = physicsParams

		const m = mass * massMultiplier
		const v = velocity.current

		// Logika stopniowego hamowania (Gradual Braking)
		// Hamulce pociągu aplikują się szybciej niż zwalniają (symulacja hamulców pneumatycznych)
		const brakeApplyRate = 0.6 // ~1.6s do pełnego zahamowania
		const brakeReleaseRate = 0.2 // ~5s do pełnego zwolnienia hamulca

		if (smoothedBrake.current < brake) {
			// Applying brakes
			smoothedBrake.current = Math.min(brake, smoothedBrake.current + brakeApplyRate * dt)
		} else {
			// Zwalnianie hamulców
			smoothedBrake.current = Math.max(brake, smoothedBrake.current - brakeReleaseRate * dt)
		}

		// Kierunek ruchu (lub potencjalnego ruchu, jeśli pociąg stoi)
		const F_gravity = -m * g * Math.sin(angle)
		const F_normal = m * g * Math.cos(angle)
		const speedAbs = Math.abs(v)
		const safeSpeed = Math.max(speedAbs, 1.0)
		// Realistic: cut traction when brakes are applied
		const effectiveThrottle = brake > 0 ? 0 : throttle
		let F_drive = (effectiveThrottle * maxPower * powerMultiplier) / safeSpeed
		const maxAdhesion = 0.3 * F_normal
		if (F_drive > maxAdhesion) F_drive = maxAdhesion

		const brakeAdhesionMax = brakeAdhesionCoeff * F_normal
		const brakingForceMag = Math.min(smoothedBrake.current * brakeForceMax, brakeAdhesionMax)

		const airForceMag = 0.5 * airResistance * v * v
		const F_air = -Math.sign(v) * airForceMag
		const rollingResistanceMag = frictionCoefficient * F_normal + extraFriction

		const isStopped = speedAbs < 0.05
		let F_total = 0

		if (isStopped) {
			const netExternalForce = F_gravity + F_drive
			const holdingForceMax = rollingResistanceMag + brakingForceMag
			if (Math.abs(netExternalForce) > holdingForceMax) {
				const moveDir = Math.sign(netExternalForce)
				const F_resist = -moveDir * (rollingResistanceMag + brakingForceMag)
				F_total = netExternalForce + F_resist
			} else {
				F_total = 0
				velocity.current = 0
			}
		} else {
			const dir = Math.sign(v)
			const F_friction = -dir * rollingResistanceMag
			const F_braking = -dir * brakingForceMag
			F_total = F_gravity + F_drive + F_friction + F_air + F_braking
		}

		if (!isStopped || F_total !== 0) {
			const acceleration = F_total / m
			let v_new = v + acceleration * dt
			if (Math.abs(v_new) > maxSpeedLimit) {
				v_new = Math.sign(v_new) * maxSpeedLimit
			}
			if (!isStopped && Math.sign(v_new) !== Math.sign(v) && Math.abs(v) < 0.5) {
				if (throttle === 0) {
					v_new = 0
				}
			}
			velocity.current = v_new
			distance.current += v_new * dt
		}

		if (distance.current < 0) {
			distance.current = 0
			velocity.current = 0
		}

		// Twarde zatrzymanie na końcu toru (zabezpieczenie przed wypadnięciem)
		const totalTrackLength = TRACK_SEGMENTS.reduce((sum, seg) => sum + seg.length, 0)
		if (distance.current > totalTrackLength) {
			distance.current = totalTrackLength
			velocity.current = 0
		}

		applyGroupOnTrack(trainRef.current, distance.current, locomotiveHalfLength)
		for (let i = 0; i < carriageCount; i += 1) {
			const carriageDist = distance.current - carriageSpacing * (i + 1)
			applyGroupOnTrack(carriageRefs.current[i], carriageDist, carriageHalfLength)
		}

		updatePhysics(velocity.current, distance.current)
		updateForces({
			gravity: F_gravity,
			friction: isStopped ? 0 : -Math.sign(v) * rollingResistanceMag,
			airResistance: F_air,
			drive: F_drive,
			brake: isStopped && F_total === 0 ? -F_gravity : -Math.sign(v) * brakingForceMag, // Show holding force if stopped? Or just max potential? Let's show applied.
			slope: angle,
		})
	})

	return (
		<>
			<group ref={trainRef}>
				<Suspense fallback={null}>
					<group position={locomotiveOffset} rotation={modelRotation} scale={locomotiveScale}>
						<primitive object={locomotive.scene} />
					</group>
				</Suspense>
			</group>

			{Array.from({ length: carriageCount }).map((_, index) => (
				<group key={index} ref={setCarriageRef(index)}>
					<Suspense fallback={null}>
						<group position={carriageOffset} rotation={carriageRotation} scale={carriageScale}>
							<Clone object={carriage.scene} />
						</group>
					</Suspense>
				</group>
			))}
		</>
	)
}

useGLTF.preload('/Train.glb')
useGLTF.preload('/train_carriage.glb')
