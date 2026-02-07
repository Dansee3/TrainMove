import { useMemo, useRef, useState, useEffect } from 'react'
import { Billboard, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { useGameStore, TrainState } from '../store'
import { getTrackInfo } from './trackUtils'

// Pomocnicza funkcja obliczająca pozycję pasażera z przesunięciem względem toru
const getPassengerPosition = (distance: number, offsetSide: number = 2.5) => {
	const { x, z, heading, height } = getTrackInfo(distance)
	// Wektor prostopadły
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

		// Płynne przejście widoczności (pojawia/zanika)
		const targetOpacity = visible ? 1 : 0
		if (opacity !== targetOpacity) {
			const step = delta * 5 // Szybkość zanikania
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
				// Dotarł
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
			// Pasażerowie przeniesieni z Nowego Sącza do Krynicy
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
				dist: 4767 + (i - 4) * 1.5, // Rozsiane na peronie końcowym
				offset: -6, // Przesunięcie docelowego peronu
			})),
		[startPassengersData],
	)

	// --- LOGIKA STANU I SEKWENCJI RUCHU ---

	// Reset kroku przy dojeździe, żeby użyć tej samej logiki do wysiadania?
	// Albo osobny stan.
	// WSIADANIE: krok 0 -> 1 -> 2 -> 3 -> 4 (ruszenie pociągu)
	// WYSIADANIE: krok 0 -> 1 -> 2 -> 3 -> 4 (koniec)

	// Osobny efekt na przejścia?
	// Na razie kroki zmieniam w callbackach onFinishMove.

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
								// Sprawdzam, czy wszyscy wsiedli
								if (nextStep >= startPassengersData.length) {
									// Wszyscy wsiedli
									// Chwila pauzy czy od razu?
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
				// Wspólny punkt wyjścia (ładniejszy obrazek)
				// Budynek stacji ~4780? Celuję obok.
				const exitPos = getPassengerPosition(4780, -12)

				const isDeboarding = trainState === TrainState.DEBOARDING

				// Logika "po dwóch"
				// i // 2 == boardingStep // 2
				// Zwiększać boardingStep po całej parze czy po każdej osobie?
				// Dla prostoty: +1 na osobę, a warunek shouldMove jest szerszy.
				// Jeśli chcę 2 osoby naraz, ich "tura" musi się pokrywać.
				// Gdy boardingStep = 0, ruszają 0 i 1.
				// Gdy obie skończą, krok rośnie do 2.
				// Najprościej: shouldMove = isDeboarding && (i >= boardingStep && i < boardingStep + 2)
				// A krok zwiększam przy każdej osobie.
				// Ryzyko: wyścig.
				// Lepiej: sprawdzać batchy na sztywno.

				const batchIndex = Math.floor(i / 2)
				const currentBatch = Math.floor(boardingStep / 2)

				// Ruszają się, jeśli to tura ich pary (batcha)
				const shouldMove = isDeboarding && batchIndex === currentBatch

				// Widoczność:
				// 1. Jeszcze nie skończyłem ruchu (tu batchy, nie per osoba)
				// 2. Użytkownik chce, żeby "znikali" po dojściu
				// Czyli widać tylko podczas wysiadania, aż do celu
				// Można trzymać lokalny stan albo wyliczać z boardingStep
				// Jeśli batchIndex < currentBatch, to już znikam

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
								// Zwiększam krok
								// Trzeba uważać na duble w parach
								// Każda osoba wywołuje ten blok
								// Jeśli +1, to druga osoba z pary nadal jest w tym samym batchu
								// i=0, i=1 to batch 0
								// i=0 kończy -> krok 1
								// i=1 kończy -> krok 2
								// Batch dla kroku 1 to 0, więc i=1 nadal się rusza
								// Batch dla kroku 2 to 1, więc ruszają i=2, i=3
								// To działa dobrze przy logice "+1"

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
