import { Canvas } from '@react-three/fiber'
import { Scene } from './components/Scene'
import { Leva } from 'leva'
import { useGameStore } from './store'
import { HUD } from './components/HUD'
import { Passengers } from './components/Passengers'

function App() {
	const resetSignal = useGameStore(s => s.resetSignal)

	// Logika ukrywania panelu deweloperskiego (Leva) podczas scenek filmowych (przyjazd/odjazd)
	const trainState = useGameStore(s => s.trainState)
	const isHidden = ['ARRIVING', 'DEBOARDING', 'FINISHED'].includes(trainState)

	return (
		<div style={{ width: '100vw', height: '100vh', background: '#111', position: 'relative' }}>
			{/* Panel GUI (Leva) - narzędzie konfiguracyjne, ukrywane w trybie "filmowym" */}
			<Leva collapsed={false} hidden={isHidden} />

			{/* Warstwa interfejsu 3D */}
			{/* Canvas - nasze okno na świat 3D */}
			<Canvas shadows>
				<Scene resetSignal={resetSignal} />
				<Passengers />
			</Canvas>

			{/* HUD (Head-Up Display) - renderowany poza Canvasem dla poprawnego Z-indexu (zawsze na wierzchu) */}
			<HUD />
		</div>
	)
}

export default App
