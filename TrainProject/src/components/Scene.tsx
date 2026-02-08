import { useRef, useEffect } from 'react'
import { useGameStore } from '../store'
import { PerspectiveCamera, Environment } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'
import { Track } from './Track'
import { Train } from './Train'
import { Ground } from './Ground'
import { Bridge } from './Bridge'
import { Animals } from './Animals'
import { Station } from './Station'
import { STATION_DEFS } from './worldConfig'
import { SpectatorControls, FollowCamera } from './CameraControls'

export const Scene = ({ resetSignal }: { resetSignal?: number }) => {
	const { cameraMode, flySpeed } = useControls('Kamera', {
		cameraMode: {
			options: ['Śledzenie Pociągu', 'FreeCam'],
			value: 'Śledzenie Pociągu',
			label: 'Tryb Kamery',
		},
		hudSpacer: {
			value: '',
			disabled: true,
			step: 0,
			label: '',
			render: get => get('Kamera.cameraMode') === 'Śledzenie Pociągu',
		},
		flySpeed: {
			value: 800,
			min: 30,
			max: 1500,
			step: 10,
			label: 'Prędkość Lotu',
			render: get => get('Kamera.cameraMode') === 'FreeCam',
		},
	})

	const setCameraMode = useGameStore(s => s.setCameraMode)

	// Synchronizacja wybranego trybu kamery z globalnym stanem aplikacji (Zustand)
	useEffect(() => {
		setCameraMode(cameraMode === 'FreeCam' ? 'FREECAM' : 'FOLLOW')
	}, [cameraMode, setCameraMode])

	useEffect(() => {
		const frame = window.requestAnimationFrame(() => {
			const root = document.querySelector('.leva-c')
			if (!root) return
			const labels = root.querySelectorAll('label')
			labels.forEach(label => {
				if (label.textContent?.trim() !== 'HUD_SPACER') return
				const row = label.parentElement?.parentElement ?? label.parentElement
				if (!row) return
				const rowEl = row as HTMLElement
				rowEl.style.opacity = '0'
				rowEl.style.pointerEvents = 'none'
			})
		})
		return () => window.cancelAnimationFrame(frame)
	}, [cameraMode])

	const { camera } = useThree()

	// Wstępna konfiguracja kamery (uruchamiana tylko raz przy starcie)
	useEffect(() => {
		// Ustawienie widoku "w głąb mapy" (pozycja z tyłu, skierowana na +Z)
		// Pozycja za pociągiem (-Z), patrząca w kierunku stacji docelowej.
		camera.position.set(-270, 40, -50)
	}, [])

	const isFollowing = cameraMode === 'Śledzenie Pociągu'
	const isFly = cameraMode === 'FreeCam'
	const trainRef = useRef<THREE.Group>(null)

	return (
		<>
			<color attach='background' args={['#000000']} />
			<PerspectiveCamera makeDefault fov={45} far={3000} />
			{isFly && <SpectatorControls speed={flySpeed} />}
			{isFollowing && <FollowCamera trainRef={trainRef} resetSignal={resetSignal} />}
			<ambientLight intensity={1.5} />
			<directionalLight position={[-50, 10, 5]} intensity={2.5} castShadow shadow-mapSize={[2048, 2048]} />
			<Environment preset='dawn' background />
			<Ground />
			<Track />
			<Animals />
			{/* MOST - struktura na odcinku 2050-2750m */}
			<Bridge startDist={2050} length={700} width={13} />

			{/* Dynamiczne renderowanie stacji na podstawie konfiguracji (worldConfig) */}
			{STATION_DEFS.map((s, i) => (
				<Station key={i} name={s.name} distance={s.dist} side={s.side} color={s.color} />
			))}

			<Train resetSignal={resetSignal} trainRef={trainRef} />
			<fog attach='fog' args={['#87CEEB', 50, 5000]} />
		</>
	)
}
