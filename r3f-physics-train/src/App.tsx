import { Canvas } from '@react-three/fiber'
import { Scene } from './components/Scene'
import { Leva } from 'leva'
import { useState } from 'react'

function App() {
	const [resetCounter, setResetCounter] = useState(0)

	return (
		<div style={{ width: '100vw', height: '100vh', background: '#111', position: 'relative' }}>
			{/* GUI Panel (Leva) - tutaj będą nasze suwaki do fizyki */}
			<Leva collapsed={false} />

			{/* Przycisk resetu na nakładce UI */}
			<button
				onClick={() => setResetCounter(c => c + 1)}
				style={{ position: 'absolute', left: 12, top: 12, zIndex: 20, padding: '8px 12px' }}>
				Resetuj pociąg
			</button>

			{/* Canvas - nasze okno na świat 3D */}
			<Canvas shadows>
				<Scene resetSignal={resetCounter} />
			</Canvas>
		</div>
	)
}

export default App
