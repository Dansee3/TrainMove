import { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../store'
import { getTrackInfo, TRACK_SEGMENTS } from './trackUtils'

interface TrainProps {
	resetSignal?: number
	trainRef: React.RefObject<THREE.Group | null>
}

export const Train = ({ resetSignal, trainRef }: TrainProps) => {
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

	// Inicjalizacja pozycji pociągu
	useEffect(() => {
		// Startujemy na 33 metrze, aby wagon (znajdujący się -13m względem lokomotywy) idealnie wpasował się w peron na 20 metrze
		distance.current = 33
		velocity.current = 0
		smoothedBrake.current = 0
		if (trainRef.current) {
			const info = getTrackInfo(33)
			trainRef.current.position.set(info.x, info.height, info.z)
			trainRef.current.rotation.set(0, info.heading, 0)
		}
		updatePhysics(0, mass, 33)
	}, [resetSignal, mass, updatePhysics]) // trainRef is stable

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
		let F_drive = (throttle * maxPower * powerMultiplier) / safeSpeed
		const maxAdhesion = 0.3 * F_normal
		if (F_drive > maxAdhesion) F_drive = maxAdhesion

		const brakingForceMag = smoothedBrake.current * brakeForceMax

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

		const newInfo = getTrackInfo(distance.current)
		trainRef.current.position.set(newInfo.x, newInfo.height, newInfo.z)
		trainRef.current.rotation.set(0, newInfo.heading, 0)
		trainRef.current.rotateX(-newInfo.angle)

		updatePhysics(velocity.current, mass, distance.current)
		updateForces({
			gravity: F_gravity,
			friction: isStopped ? 0 : -Math.sign(v) * rollingResistanceMag,
			airResistance: F_air,
			drive: F_drive,
			brake: isStopped && F_total === 0 ? -F_gravity : -Math.sign(v) * brakingForceMag, // Show holding force if stopped? Or just max potential? Let's show applied.
			slope: angle,
		})
	})

	// Elementy wizualne (Materiały i geometria)
	const trainMaterial = useMemo(
		() =>
			new THREE.MeshStandardMaterial({
				color: '#e67e22',
				roughness: 0.2,
				metalness: 0.6,
			}),
		[],
	)

	const cabMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2c3e50', roughness: 0.7 }), [])
	const wagonMaterial = useMemo(
		() => new THREE.MeshStandardMaterial({ color: '#3498db', roughness: 0.3, metalness: 0.4 }),
		[],
	)

	return (
		<group ref={trainRef}>
			{/* --- LOKOMOTYWA --- */}
			{/* Główny korpus */}
			{/* Kabina */}
			{/* Przedni nos */}
			{/* Komin */}
			{/* Wskaźniki kół (proste prostopadłościany) */}
			<mesh position={[0, 1.4, 0]} castShadow receiveShadow>
				<boxGeometry args={[3, 2.2, 10]} />
				<primitive object={trainMaterial} attach='material' />
			</mesh>

			<mesh position={[0, 2.5, 3]} castShadow receiveShadow>
				<boxGeometry args={[3.1, 1.5, 2.5]} />
				<primitive object={cabMaterial} attach='material' />
			</mesh>

			<mesh position={[0, 1.4, -4]} castShadow receiveShadow>
				<boxGeometry args={[3, 1.5, 3]} />
				<primitive object={trainMaterial} attach='material' />
			</mesh>

			<mesh position={[0, 3, -3]} castShadow receiveShadow>
				<cylinderGeometry args={[0.4, 0.4, 1]} />
				<meshStandardMaterial color='#111' />
			</mesh>

			<mesh position={[1.2, 0.3, 3]}>
				<boxGeometry args={[0.3, 0.6, 2]} />
				<meshStandardMaterial color='#111' />
			</mesh>
			<mesh position={[-1.2, 0.3, 3]}>
				<boxGeometry args={[0.3, 0.6, 2]} />
				<meshStandardMaterial color='#111' />
			</mesh>

			<mesh position={[1.2, 0.3, -3]}>
				<boxGeometry args={[0.3, 0.6, 2]} />
				<meshStandardMaterial color='#111' />
			</mesh>
			<mesh position={[-1.2, 0.3, -3]}>
				<boxGeometry args={[0.3, 0.6, 2]} />
				<meshStandardMaterial color='#111' />
			</mesh>

			{/* --- WAGON PASAŻERSKI --- */}
			<group position={[0, 0, -13]}>
				{/* Łącznik */}
				<mesh position={[0, 1, 5.5]}>
					<boxGeometry args={[0.5, 0.5, 1]} />
					<meshStandardMaterial color='#111' />
				</mesh>

				{/* Korpus wagonu */}
				<mesh position={[0, 1.8, 0]} castShadow receiveShadow>
					<boxGeometry args={[3.2, 2.8, 11]} />
					<primitive object={wagonMaterial} attach='material' />
				</mesh>

				{/* Dach */}
				{/* Obrót dachu, aby wyrównać z osią Z */}
				{/* Uwaga: W Three.js walec jest wzdłuż osi Y. Chcemy go wzdłuż Z. Obrót X = PI/2. */}
				<mesh position={[0, 3.3, 0]} castShadow>
					<cylinderGeometry args={[1.7, 1.7, 11.2, 16, 1, false, 0, Math.PI]} />
					<meshStandardMaterial color='#2c3e50' />
				</mesh>

				{/* Cylinder default is Y-up. Rotate X 90. */}

				{/* But we need half cylinder. thetaLength=PI. */}
				{/* Let's redo with a box or standard cylinder properly rotated. */}
				{/* Actually just a slightly rounded top box is easier or full cylinder segment. */}

				{/* Okna (proste czarne paski) */}
				{/* Koła */}
				<mesh position={[1.61, 2, 0]}>
					<boxGeometry args={[0.1, 1, 9]} />
					<meshStandardMaterial color='#111' roughness={0.1} />
				</mesh>
				<mesh position={[-1.61, 2, 0]}>
					<boxGeometry args={[0.1, 1, 9]} />
					<meshStandardMaterial color='#111' roughness={0.1} />
				</mesh>

				<mesh position={[1.2, 0.3, 3.5]}>
					<boxGeometry args={[0.3, 0.6, 2]} />
					<meshStandardMaterial color='#111' />
				</mesh>
				<mesh position={[-1.2, 0.3, 3.5]}>
					<boxGeometry args={[0.3, 0.6, 2]} />
					<meshStandardMaterial color='#111' />
				</mesh>
				<mesh position={[1.2, 0.3, -3.5]}>
					<boxGeometry args={[0.3, 0.6, 2]} />
					<meshStandardMaterial color='#111' />
				</mesh>
				<mesh position={[-1.2, 0.3, -3.5]}>
					<boxGeometry args={[0.3, 0.6, 2]} />
					<meshStandardMaterial color='#111' />
				</mesh>
			</group>

			{/* --- WAGON 2 --- */}
			<group position={[0, 0, -26]}>
				{/* Connector */}
				<mesh position={[0, 1, 5.5]}>
					<boxGeometry args={[0.5, 0.5, 1]} />
					<meshStandardMaterial color='#111' />
				</mesh>

				{/* Body */}
				<mesh position={[0, 1.8, 0]} castShadow receiveShadow>
					<boxGeometry args={[3.2, 2.8, 11]} />
					<primitive object={wagonMaterial} attach='material' />
				</mesh>

				{/* Roof */}
				<mesh position={[0, 3.3, 0]} castShadow>
					<cylinderGeometry args={[1.7, 1.7, 11.2, 16, 1, false, 0, Math.PI]} />
					<meshStandardMaterial color='#2c3e50' />
				</mesh>

				{/* Windows */}
				<mesh position={[1.61, 2, 0]}>
					<boxGeometry args={[0.1, 1, 9]} />
					<meshStandardMaterial color='#111' roughness={0.1} />
				</mesh>
				<mesh position={[-1.61, 2, 0]}>
					<boxGeometry args={[0.1, 1, 9]} />
					<meshStandardMaterial color='#111' roughness={0.1} />
				</mesh>

				{/* Wheels */}
				<mesh position={[1.2, 0.3, 3.5]}>
					<boxGeometry args={[0.3, 0.6, 2]} />
					<meshStandardMaterial color='#111' />
				</mesh>
				<mesh position={[-1.2, 0.3, 3.5]}>
					<boxGeometry args={[0.3, 0.6, 2]} />
					<meshStandardMaterial color='#111' />
				</mesh>
				<mesh position={[1.2, 0.3, -3.5]}>
					<boxGeometry args={[0.3, 0.6, 2]} />
					<meshStandardMaterial color='#111' />
				</mesh>
				<mesh position={[-1.2, 0.3, -3.5]}>
					<boxGeometry args={[0.3, 0.6, 2]} />
					<meshStandardMaterial color='#111' />
				</mesh>
			</group>

			{/* --- WAGON 3 --- */}
			<group position={[0, 0, -39]}>
				{/* Connector */}
				<mesh position={[0, 1, 5.5]}>
					<boxGeometry args={[0.5, 0.5, 1]} />
					<meshStandardMaterial color='#111' />
				</mesh>

				{/* Body */}
				<mesh position={[0, 1.8, 0]} castShadow receiveShadow>
					<boxGeometry args={[3.2, 2.8, 11]} />
					<primitive object={wagonMaterial} attach='material' />
				</mesh>

				{/* Roof */}
				<mesh position={[0, 3.3, 0]} castShadow>
					<cylinderGeometry args={[1.7, 1.7, 11.2, 16, 1, false, 0, Math.PI]} />
					<meshStandardMaterial color='#2c3e50' />
				</mesh>

				{/* Windows */}
				<mesh position={[1.61, 2, 0]}>
					<boxGeometry args={[0.1, 1, 9]} />
					<meshStandardMaterial color='#111' roughness={0.1} />
				</mesh>
				<mesh position={[-1.61, 2, 0]}>
					<boxGeometry args={[0.1, 1, 9]} />
					<meshStandardMaterial color='#111' roughness={0.1} />
				</mesh>

				{/* Wheels */}
				<mesh position={[1.2, 0.3, 3.5]}>
					<boxGeometry args={[0.3, 0.6, 2]} />
					<meshStandardMaterial color='#111' />
				</mesh>
				<mesh position={[-1.2, 0.3, 3.5]}>
					<boxGeometry args={[0.3, 0.6, 2]} />
					<meshStandardMaterial color='#111' />
				</mesh>
				<mesh position={[1.2, 0.3, -3.5]}>
					<boxGeometry args={[0.3, 0.6, 2]} />
					<meshStandardMaterial color='#111' />
				</mesh>
				<mesh position={[-1.2, 0.3, -3.5]}>
					<boxGeometry args={[0.3, 0.6, 2]} />
					<meshStandardMaterial color='#111' />
				</mesh>
			</group>

			{/* --- WAGON 4 --- */}
			<group position={[0, 0, -52]}>
				{/* Connector */}
				<mesh position={[0, 1, 5.5]}>
					<boxGeometry args={[0.5, 0.5, 1]} />
					<meshStandardMaterial color='#111' />
				</mesh>

				{/* Body */}
				<mesh position={[0, 1.8, 0]} castShadow receiveShadow>
					<boxGeometry args={[3.2, 2.8, 11]} />
					<primitive object={wagonMaterial} attach='material' />
				</mesh>

				{/* Roof */}
				<mesh position={[0, 3.3, 0]} castShadow>
					<cylinderGeometry args={[1.7, 1.7, 11.2, 16, 1, false, 0, Math.PI]} />
					<meshStandardMaterial color='#2c3e50' />
				</mesh>

				{/* Windows */}
				<mesh position={[1.61, 2, 0]}>
					<boxGeometry args={[0.1, 1, 9]} />
					<meshStandardMaterial color='#111' roughness={0.1} />
				</mesh>
				<mesh position={[-1.61, 2, 0]}>
					<boxGeometry args={[0.1, 1, 9]} />
					<meshStandardMaterial color='#111' roughness={0.1} />
				</mesh>

				{/* Wheels */}
				<mesh position={[1.2, 0.3, 3.5]}>
					<boxGeometry args={[0.3, 0.6, 2]} />
					<meshStandardMaterial color='#111' />
				</mesh>
				<mesh position={[-1.2, 0.3, 3.5]}>
					<boxGeometry args={[0.3, 0.6, 2]} />
					<meshStandardMaterial color='#111' />
				</mesh>
				<mesh position={[1.2, 0.3, -3.5]}>
					<boxGeometry args={[0.3, 0.6, 2]} />
					<meshStandardMaterial color='#111' />
				</mesh>
				<mesh position={[-1.2, 0.3, -3.5]}>
					<boxGeometry args={[0.3, 0.6, 2]} />
					<meshStandardMaterial color='#111' />
				</mesh>
			</group>
		</group>
	)
}
