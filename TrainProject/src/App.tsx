import { Canvas } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { Scene } from './components/Scene'
import { Leva } from 'leva'
import { useGameStore } from './store'
import { HUD } from './components/HUD'
import { Passengers } from './components/Passengers'

function App() {
	const resetSignal = useGameStore(s => s.resetSignal)
	const [isLoading, setIsLoading] = useState(true)
	const [sceneVisible, setSceneVisible] = useState(false)

	useEffect(() => {
		const frame = window.requestAnimationFrame(() => setSceneVisible(true))
		return () => window.cancelAnimationFrame(frame)
	}, [])

	useEffect(() => {
		const timer = window.setTimeout(() => setIsLoading(false), 5000)
		return () => window.clearTimeout(timer)
	}, [])

	// Logika ukrywania panelu deweloperskiego (Leva) podczas scenek filmowych (przyjazd/odjazd)
	const trainState = useGameStore(s => s.trainState)
	const isHidden = ['ARRIVING', 'DEBOARDING', 'FINISHED'].includes(trainState)

	return (
		<div style={{ width: '100vw', height: '100vh', background: '#111', position: 'relative' }}>
			{isLoading && (
				<div className='bg-loading'>
					<div className='loading'>
						<div className='logo-wrap'>
							<img className='logo-img' src='avatars/avatarDansee.avif' alt='Logo' />
						</div>
						<div className='loading-text'>Loading...</div>
					</div>
				</div>
			)}
			{/* Panel GUI (Leva) - narzędzie konfiguracyjne, ukrywane w trybie "filmowym" */}
			<Leva collapsed={false} hidden={isHidden} />

			{/* Warstwa interfejsu 3D */}
			{/* Canvas - nasze okno na świat 3D */}
			<div className={`scene-fade${sceneVisible ? ' is-visible' : ''}`}>
				<Canvas shadows>
					<Scene resetSignal={resetSignal} />
					<Passengers />
				</Canvas>
			</div>

			{/* HUD (Head-Up Display) - renderowany poza Canvasem dla poprawnego Z-indexu (zawsze na wierzchu) */}
			<HUD isLoading={isLoading} />
		</div>
	)
}

export default App
