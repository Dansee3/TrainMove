import { useMemo, useRef, useState, useEffect } from 'react'
import { Billboard, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { useGameStore, TrainState } from '../store'
import { getTrackInfo } from './trackUtils'

// Pomocnicza funkcja obliczająca pozycję pasażera z przesunięciem względem toru
const getPassengerPosition = (distance: number, offsetSide: number = 2.5) => {
	const { x, z, heading, height } = getTrackInfo(distance)
	// Perpendicular vector
	const dx = Math.cos(heading) * offsetSide
	const dz = -Math.sin(heading) * offsetSide
	return new THREE.Vector3(x + dx, height, z + dz)
}

const AnimatedPassenger = ({
	startPos,
	targetPos,
	shouldMove,
	onFinishMove,
	name,
	color = '#22d3ee',
	visible = true,
	scale = 1,
	resetSignal,
}: any) => {
	const groupRef = useRef<THREE.Group>(null)
	const [opacity, setOpacity] = useState(1)
	const finishedRef = useRef(false)
	const prevReset = useRef(resetSignal)

	// Inicjalizacja pozycji startowej
	useEffect(() => {
		if (groupRef.current && !finishedRef.current) {
			groupRef.current.position.copy(startPos)
		}
	}, [startPos])

	// Logika resetowania stanu pasażera (powrót na pozycję startową)
	useEffect(() => {
		if (resetSignal !== prevReset.current) {
			finishedRef.current = false
			if (groupRef.current) {
				groupRef.current.position.copy(startPos)
			}
			setOpacity(1)
			prevReset.current = resetSignal
		}
	}, [resetSignal, startPos])

	useFrame((state, delta) => {
		if (!groupRef.current) return

		// Płynne przejście widoczności (fade-in / fade-out)
		const targetOpacity = visible ? 1 : 0
		if (opacity !== targetOpacity) {
			const step = delta * 5 // Fade speed
			const newOpacity = THREE.MathUtils.lerp(opacity, targetOpacity, step)
			setOpacity(newOpacity)
		}

		groupRef.current.visible = opacity > 0.01

		// Logika poruszania się postaci
		if (shouldMove && visible && !finishedRef.current) {
			const current = groupRef.current.position
			const dist = current.distanceTo(targetPos)

			if (dist > 0.1) {
				const speed = 6.0 * delta // Prędkość chodu (zwiększona dla dynamiki)
				current.lerp(targetPos, speed * 0.5) // Wygładzanie ruchu (lerp)

				// Animacja "bobbing" (symulacja kroków w osi Y)
				groupRef.current.position.y = Math.max(startPos.y, startPos.y + Math.sin(state.clock.elapsedTime * 20) * 0.05)
			} else {
				// Arrived
				finishedRef.current = true
				if (onFinishMove) onFinishMove()
			}
		}
	})

	return (
		<group ref={groupRef} scale={[scale, scale, scale]}>
			<mesh position={[0, 0.5, 0]}>
				<capsuleGeometry args={[0.3, 1, 4, 8]} />
				<meshStandardMaterial color={color} transparent opacity={opacity} />
			</mesh>
			<mesh position={[0, 1.2, 0]}>
				<sphereGeometry args={[0.25]} />
				<meshStandardMaterial color='#fca5a5' transparent opacity={opacity} />
			</mesh>
			<Billboard position={[0, 1.8, 0]}>
				<Text
					fontSize={0.25}
					color='white'
					outlineWidth={0.02}
					outlineColor='black'
					fillOpacity={opacity}
					outlineOpacity={opacity}>
					{name}
				</Text>
			</Billboard>
		</group>
	)
}

export const Passengers = () => {
	const trainState = useGameStore(s => s.trainState)
	const boardingStep = useGameStore(s => s.boardingStep)
	const setBoardingStep = useGameStore(s => s.setBoardingStep)
	const addToMass = useGameStore(s => s.addToMass)
	const setTrainState = useGameStore(s => s.setTrainState)

	// Dostęp do sygnału resetu
	const resetSignal = useGameStore(s => s.resetSignal)

	// STACJA POCZĄTKOWA: Krynica Zdrój
	// Pasażerowie ustawieni wzdłuż peronu w okolicach 3. wagonu od końca (srodek stacji ~20m).
	const startPassengersData = useMemo(
		() => [
			{ name: 'Thomos', dist: 12, offset: 6, color: '#3b82f6', weight: 74 },
			{ name: 'Sebastian', dist: 14, offset: 6, color: '#ef4444', weight: 71 },
			{ name: 'Rimald', dist: 16, offset: 6.2, color: '#f59e0b', weight: 80 },
			{ name: 'K_vanSant', dist: 18, offset: 6.5, color: '#10b981', weight: 500 },
			// Passengers moved from Nowy Sącz to Krynica
			{ name: 'Paweł SZ', dist: 22, offset: 6, color: '#8b5cf6', weight: 87 },
			{ name: 'Deltsaber', dist: 24, offset: 6.5, color: '#ec4899', weight: 70 },
			{ name: 'Stefankus', dist: 26, offset: 6, color: '#06b6d4', weight: 92 },
			{ name: 'victoria21', dist: 28, offset: 6.2, color: '#a855f7', weight: 4321 },
		],
		[],
	)

	// Pasażerowie wysiadający na stacji końcowej (Nowy Sącz)
	// Stacja kończy się na 4780m. Lokomotywa zatrzymuje się tamże.
	// Wagon jest przesunięty, więc pasażerowie wysiadają odpowiednio wcześniej (~4767m).
	const arrivingPassengersData = useMemo(
		() =>
			startPassengersData.map((p, i) => ({
				...p,
				dist: 4767 + (i - 4) * 1.5, // Spread out on platform at destination
				offset: -6, // Target platform offset
			})),
		[startPassengersData],
	)

	// --- LOGIKA STANU I SEKWENCJI RUCHU ---

	// Reset boarding step when arriving so we can reuse logic for deboarding?
	// Or use different state.
	// BOARDING: step 0 -> 1 -> 2 -> 3 -> 4 (Move train)
	// DEBOARDING: step 0 -> 1 -> 2 -> 3 -> 4 (Finish)

	// Separate effect to handle transitions?
	// We handle step changes via onFinishMove callbacks.

	return (
		<group>
			{/* GRUPA 1: Wsiadający pasażerowie (Krynica Zdrój) */}
			{startPassengersData.map((p, i) => {
				const standPos = getPassengerPosition(p.dist, p.offset)
				// Pozycja drzwi wagonu (uproszczenie: celujemy w pobliże toru)
				const doorPos = getPassengerPosition(p.dist, 3.0)

				// Logika ruchu:
				// Ruszamy się tylko, jeśli jest nasza kolej (i === boardingStep) ORAZ trwa wsiadanie (BOARDING).
				const isMyTurn = i === boardingStep
				const isBoarding = trainState === TrainState.BOARDING
				const shouldMove = isBoarding && isMyTurn

				// Logika widoczności:
				// Widoczni dopóki nie wsiedli. Po wejściu (step > i) znikają.
				// AnimatedPassenger obsłuży płynne zanikanie (opacity).
				const hasBoarded = boardingStep > i
				const isVisible =
					!hasBoarded &&
					trainState !== TrainState.MOVING &&
					trainState !== TrainState.ARRIVING &&
					trainState !== TrainState.DEBOARDING &&
					trainState !== TrainState.FINISHED

				return (
					<AnimatedPassenger
						key={`start-${i}`}
						name={p.name}
						color={p.color}
						scale={2.5}
						startPos={standPos}
						targetPos={doorPos}
						shouldMove={shouldMove}
						visible={isVisible}
						resetSignal={resetSignal}
						onFinishMove={() => {
							if (useGameStore.getState().resetSignal !== resetSignal) return
							if (isBoarding) {
								addToMass(p.weight)
								const nextStep = boardingStep + 1
								setBoardingStep(nextStep)
								// Check if all boarded
								if (nextStep >= startPassengersData.length) {
									// All boarded!
									// Wait a moment? or immediate.
									setTimeout(() => setTrainState(TrainState.MOVING), 500)
								}
							}
						}}
					/>
				)
			})}

			{/* GRUPA 2: Wysiadający pasażerowie (Nowy Sącz) */}
			{arrivingPassengersData.map((p, i) => {
				const doorPos = getPassengerPosition(p.dist, 3.0)
				// Common station exit point for everyone (Visual cleanup)
				// Station building at ~4780? Let's target side.
				const exitPos = getPassengerPosition(4780, -12)

				const isDeboarding = trainState === TrainState.DEBOARDING

				// "Two by Two" logic
				// i // 2  == boardingStep // 2
				// We increment boardingStep by 1 each time a *batch* or *person* finishes?
				// Let's increment boardingStep by 1 per person to keep state simple,
				// but 'shouldMove' condition is wider.
				// If we want 2 people to move simultaneously, their 'turn' must be active together.
				// If boardingStep = 0. Passengers 0 and 1 move.
				// When BOTH finish, we add +2 to boardingStep? Or independent?
				// Simplest: shouldMove = isDeboarding && (i >= boardingStep && i < boardingStep + 2)
				// And we only increment boardingStep when the "leader" (even index) finishes? Or both?
				// Let's use independent finishing. When p[i] finishes, it triggers increment?
				// Risk: race condition.
				// Better: Just check strictly:

				const batchIndex = Math.floor(i / 2)
				const currentBatch = Math.floor(boardingStep / 2)

				// Ruszają się, jeśli to tura ich pary (batcha)
				const shouldMove = isDeboarding && batchIndex === currentBatch

				// Visible if:
				// 1. I haven't finished moving yet (boardingStep <= i ?? No, logic is batch based)
				// 2. Actually, user wants them to "disappear".
				// So visible only during deboarding until they reach target.
				// We can track local "finished" state or deduce from boardingStep.
				// If batchIndex < currentBatch, I am done -> Invisible.

				const isDone = batchIndex < currentBatch
				const isVisible = isDeboarding && !isDone

				return (
					<AnimatedPassenger
						key={`arr-${i}`}
						name={p.name}
						color={p.color}
						scale={2.5}
						startPos={doorPos}
						targetPos={exitPos}
						shouldMove={shouldMove}
						visible={isVisible}
						resetSignal={resetSignal}
						onFinishMove={() => {
							if (useGameStore.getState().resetSignal !== resetSignal) return
							if (isDeboarding) {
								addToMass(-p.weight)
								// Increment boarding step
								// To avoid double stepping for pairs, we need to be careful.
								// Each person calls this.
								// If we just increments +1, the next person in pair (i+1) is also in same batch?
								// i=0, i=1. Batch 0.
								// i=0 finishes -> step becomes 1.
								// i=1 finishes -> step becomes 2.
								// Batch for step 1 is 0 (1/2 = 0). So i=1 still moves.
								// Batch for step 2 is 1. So i=2, i=3 start moving.
								// This works perfectly for "+1" logic!

								const nextStep = boardingStep + 1
								setBoardingStep(nextStep)

								if (nextStep >= arrivingPassengersData.length) {
									setTrainState(TrainState.FINISHED)
								}
							}
						}}
					/>
				)
			})}
		</group>
	)
}
