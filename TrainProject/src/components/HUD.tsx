import { useGameStore } from '../store'
import { useEffect, useState, useRef } from 'react'

// --- STYLE INŻYNIERSKIE (CSS-in-JS) ---
const styleSheet = document.createElement('style')
styleSheet.innerText = `
@import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;700&family=Inter:wght@400;600;800&display=swap');

.eng-hud {
	font-family: 'Inter', sans-serif;
	user-select: none;
	color: #e0e0e0;
}

.eng-panel {
	background: rgba(20, 20, 22, 0.9);
	border: 1px solid #444;
	border-radius: 4px;
	box-shadow: 0 4px 6px rgba(0,0,0,0.3);
}

.eng-label {
	font-family: 'Inter', sans-serif;
	font-size: 10px;
	font-weight: 600;
	color: #888;
	text-transform: uppercase;
	letter-spacing: 0.5px;
}

.eng-value {
	font-family: 'Roboto Mono', monospace;
	font-weight: 500;
	color: #fff;
}

.eng-table-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 4px 0;
	border-bottom: 1px solid #333;
}
.eng-table-row:last-child {
	border-bottom: none;
}

.bar-bg {
	background: #333;
	border-radius: 2px;
	overflow: hidden;
}
.bar-fill {
	transition: width 0.1s linear; /* Smooth CSS transition might be enough if state updates fast? No, explicit lerp is better requested */
}

/* LEVA ADJUSTMENT */
.leva-c {
    top: 50px !important; /* Move down/increase offset */
}

/* FLASHING TUTORIAL */
@keyframes flashRedYellow {
    0% { color: #f87171; opacity: 1; }
    50% { color: #facc15; opacity: 1; }
    100% { color: #f87171; opacity: 1; }
}

.tutorial-flash {
    font-family: 'Roboto Mono', monospace;
    font-weight: 700;
	height: auto;
    font-size: 24px;
    text-align: center;
    text-shadow: 0 2px 4px rgba(0,0,0,0.8);
    animation: flashRedYellow 1s infinite;
    background: rgba(0,0,0,0.6);
    padding: 10px 20px;
    border-radius: 8px;
    white-space: pre-line;
}
`
document.head.appendChild(styleSheet)

const TutorialOverlay = () => {
	const cameraMode = useGameStore(s => s.cameraMode)
	const [visible, setVisible] = useState(false)
	const [text, setText] = useState('')
	const timeoutRef = useRef<number>()

	useEffect(() => {
		setVisible(true)
		if (cameraMode === 'FOLLOW') {
			setText("CLICK & DRAG TO ROTATE.\nHOLD 'W' TO ACCELERATE.\n'S' TO DECELERATE.\nSPACE - BRAKE.\n'K' - HORN.")
		} else {
			setText("WASD - MOVE CAMERA.\nMOUSE - LOOK AROUND.\n'E' - TRAIN THROTTLE.\n'Q' - TRAIN BRAKE.\n'K' - HORN.")
		}

		if (timeoutRef.current) clearTimeout(timeoutRef.current)
		timeoutRef.current = setTimeout(() => {
			setVisible(false)
		}, 5000)

		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current)
		}
	}, [cameraMode])

	if (!visible) return null

	return (
		<div
			style={{
				position: 'absolute',
				top: '20%',
				left: '50%',
				transform: 'translateX(-50%)',
				pointerEvents: 'none',
				zIndex: 1000,
				width: '80%',
				display: 'flex',
				justifyContent: 'center',
			}}>
			<div className='tutorial-flash'>{text}</div>
		</div>
	)
}

export const HUD = () => {
	const {
		trainState,
		velocity,
		mass,
		distance,
		totalDistance,
		throttle,
		// brake, // Removed unused variable
		forceState,
		cameraMode,
		setThrottle,
		setBrake,
		setPhysicsParam,
		restart,
	} = useGameStore()

	const hornRef = useRef<HTMLAudioElement | null>(null)

	useEffect(() => {
		hornRef.current = new Audio('/sounds/trainHorn.mp3')
		hornRef.current.volume = 0.8
	}, [])

	// Wygładzona wizualizacja hamulca
	const [visualBrake, setVisualBrake] = useState(0)

	// --- OBSŁUGA WEJŚCIA (Klawiatura) ---
	useEffect(() => {
		const keys = {
			w: false,
			s: false,
			e: false,
			q: false,
			arrowUp: false,
			arrowDown: false,
			space: false,
		}

		const handleKeyDown = (e: KeyboardEvent) => {
			const code = e.code.toLowerCase()
			if (code === 'keyk' && !e.repeat) {
				const horn = hornRef.current
				if (horn) {
					horn.currentTime = 0
					void horn.play()
				}
			}
			if (code === 'keyw') keys.w = true
			if (code === 'keys') keys.s = true
			if (code === 'keye') keys.e = true
			if (code === 'keyq') keys.q = true
			if (code === 'arrowup') keys.arrowUp = true
			if (code === 'arrowdown') keys.arrowDown = true
			if (code === 'space') keys.space = true

			// Power Multiplier (Moved to brackets to avoid E/Q conflict in FreeCam)
			if (code === 'bracketright') {
				const current = useGameStore.getState().physicsParams.powerMultiplier
				setPhysicsParam('powerMultiplier', Math.min(5.0, current + 0.25))
			}
			if (code === 'bracketleft') {
				const current = useGameStore.getState().physicsParams.powerMultiplier
				setPhysicsParam('powerMultiplier', Math.max(0.25, current - 0.25))
			}
		}

		const handleKeyUp = (e: KeyboardEvent) => {
			const code = e.code.toLowerCase()
			if (code === 'keyw') keys.w = false
			if (code === 'keys') keys.s = false
			if (code === 'keye') keys.e = false
			if (code === 'keyq') keys.q = false
			if (code === 'arrowup') keys.arrowUp = false
			if (code === 'arrowdown') keys.arrowDown = false
			if (code === 'space') keys.space = false
		}

		window.addEventListener('keydown', handleKeyDown)
		window.addEventListener('keyup', handleKeyUp)

		let animationFrameId: number

		const loop = () => {
			const currentThrottle = useGameStore.getState().throttle
			const currentBrake = useGameStore.getState().brake
			let newThrottle = currentThrottle
			let newBrake = currentBrake
			const camMode = useGameStore.getState().cameraMode
			const brakeApplyStep = 0.02
			const brakeReleaseStep = 0.015

			if (camMode === 'FOLLOW') {
				// Wejście gazu (W/S)
				if (keys.w || keys.arrowUp) {
					newThrottle = Math.min(1, currentThrottle + 0.01)
				} else if (keys.s || keys.arrowDown) {
					newThrottle = Math.max(0, currentThrottle - 0.01)
				}
				// Brake inputs (SPACE)
				if (keys.space) {
					newBrake = Math.min(1, currentBrake + brakeApplyStep)
				} else {
					newBrake = Math.max(0, currentBrake - brakeReleaseStep)
				}
			} else {
				// FreeCam Mode
				// E = Increase Throttle
				if (keys.e) {
					newThrottle = Math.min(1, currentThrottle + 0.01)
				}
				// Q = Brake (and reduce throttle for control?)
				if (keys.q) {
					newBrake = Math.min(1, currentBrake + brakeApplyStep)
					newThrottle = Math.max(0, currentThrottle - 0.01) // Let Q also reduce throttle
				} else {
					newBrake = Math.max(0, currentBrake - brakeReleaseStep)
				}
			}

			if (Math.abs(newThrottle - currentThrottle) > 0.0001) setThrottle(newThrottle)
			setBrake(newBrake)

			// Update Visual Smoothed Brake
			// Lerp towards actual brake value
			setVisualBrake(prev => {
				const diff = newBrake - prev
				if (Math.abs(diff) < 0.01) return newBrake
				return prev + diff * 0.1 // Współczynnik wygładzania
			})

			animationFrameId = requestAnimationFrame(loop)
		}

		loop()

		return () => {
			window.removeEventListener('keydown', handleKeyDown)
			window.removeEventListener('keyup', handleKeyUp)
			cancelAnimationFrame(animationFrameId)
		}
	}, [setThrottle, setBrake, setPhysicsParam])

	// --- FORMATTERS ---
	const formatForce = (n: number) => {
		const abs = Math.abs(n)
		if (abs >= 1000000) return (n / 1000000).toFixed(2) + ' MN'
		if (abs >= 1000) return (n / 1000).toFixed(2) + ' kN'
		return n.toFixed(2) + ' N'
	}

	const speedKmh = Math.abs(velocity * 3.6)
	const speedDisplay = speedKmh.toFixed(2).padStart(6, '0')
	const progressPercent = Math.min(100, Math.max(0, (distance / totalDistance) * 100))

	return (
		<div className='eng-hud' style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
			<TutorialOverlay />

			{/* GÓRNY PASEK - STATUS (Top Center) */}
			<div
				style={{
					position: 'absolute',
					top: 10,
					left: '50%',
					transform: 'translateX(-50%)',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					gap: 4,
				}}>
				<div className='eng-panel' style={{ padding: '6px 20px', display: 'flex', gap: 20 }}>
					<span className='eng-label' style={{ alignSelf: 'center' }}>
						SYSTEM STATUS
					</span>
					<span
						style={{
							fontWeight: 700,
							color: trainState === 'MOVING' ? '#4ade80' : trainState === 'ARRIVING' ? '#facc15' : '#fff',
						}}>
						{trainState}
					</span>
				</div>
				{/* Progress Strip */}
				<div style={{ width: 300, height: 4, background: 'rgba(0,0,0,0.5)', marginTop: 4 }}>
					<div style={{ width: `${progressPercent}%`, height: '100%', background: '#4ade80' }} />
				</div>
				<div
					style={{
						width: 300,
						display: 'flex',
						justifyContent: 'space-between',
						fontSize: 10,
						color: '#888',
						marginTop: 2,
					}}>
					<span>KRYNICA</span>
					<span>NOWY SĄCZ</span>
				</div>
			</div>

			{/* LEWY PANEL - TELEMETRIA (Left Panel) */}
			<div className='eng-panel' style={{ position: 'absolute', top: 20, left: 20, width: 280, padding: 12 }}>
				<div className='eng-label' style={{ marginBottom: 8, borderBottom: '1px solid #444', paddingBottom: 4 }}>
					PHYSICS TELEMETRY
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
					<TelemetryRow label='Drive Force' value={formatForce(forceState.drive)} color='#4ade80' />
					<TelemetryRow
						label='Brake Force'
						value={formatForce(forceState.brake)}
						color={forceState.brake < -100 ? '#f87171' : undefined}
					/>
					<TelemetryRow label='Slope Force' subLabel='(Gravity Component)' value={formatForce(forceState.gravity)} />
					<TelemetryRow label='Friction' value={formatForce(forceState.friction)} />
					<TelemetryRow label='Air Resist' value={formatForce(forceState.airResistance)} />
					<div style={{ height: 1, background: '#333', margin: '4px 0' }} />
					<TelemetryRow label='Total Mass' value={mass.toFixed(0) + ' kg'} />
					<TelemetryRow
						label='Slope'
						value={(forceState.slope * 57.29).toFixed(2) + '°'}
						color={Math.abs(forceState.slope) > 0.02 ? '#facc15' : undefined}
					/>
				</div>

				{/* PRZEWODNIK PO STEROWANIU (Dynamiczny) */}
				<div style={{ marginTop: 15, borderTop: '1px solid #444', paddingTop: 8 }}>
					<div className='eng-label' style={{ marginBottom: 4 }}>
						MANUAL CONTROL ({cameraMode === 'FOLLOW' ? 'TRAIN' : 'FREE CAM'})
					</div>
					<div style={{ fontSize: 11, display: 'grid', gridTemplateColumns: '40px 1fr', gap: 4, color: '#aaa' }}>
						{cameraMode === 'FOLLOW' ? (
							<>
								<span style={{ color: '#fff', fontWeight: 600 }}>W</span> <span>Increase Power</span>
								<span style={{ color: '#fff', fontWeight: 600 }}>S</span> <span>Decrease Power</span>
								<span style={{ color: '#fff', fontWeight: 600 }}>SPACE</span> <span>Brake</span>
								<span style={{ color: '#fff', fontWeight: 600 }}>K</span> <span>Horn</span>
							</>
						) : (
							<>
								<span style={{ color: '#fff', fontWeight: 600 }}>WASD</span> <span>Move Camera</span>
								<span style={{ color: '#fff', fontWeight: 600 }}>E</span> <span>Train Power</span>
								<span style={{ color: '#fff', fontWeight: 600 }}>Q</span> <span>Train Brake</span>
								<span style={{ color: '#fff', fontWeight: 600 }}>K</span> <span>Horn</span>
							</>
						)}
					</div>
				</div>
			</div>

			{/* DOLNY PASEK - PRĘDKOŚĆ I WEJŚCIA (Bottom Center) */}
			<div
				style={{
					position: 'absolute',
					bottom: 20,
					left: '50%',
					transform: 'translateX(-50%)',
					display: 'flex',
					alignItems: 'flex-end',
					gap: 20,
				}}>
				{/* Throttle */}
				<InputBar label='THROTTLE' value={throttle} color='#4ade80' />

				{/* Speedometer */}
				<div
					className='eng-panel'
					style={{ padding: '20px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
					<div className='eng-label'>VELOCITY</div>
					<div style={{ fontSize: 64, fontWeight: 700, fontFamily: 'Roboto Mono', lineHeight: 1 }}>{speedDisplay}</div>
					<div style={{ fontSize: 14, color: '#888' }}>km/h</div>
				</div>

				{/* Brake (Smoothed) */}
				<InputBar label='BRAKE' value={visualBrake} color='#f87171' />
			</div>

			{/* PRAWY PANEL - INFORMACJE I RESET */}
			<div className='eng-panel' style={{ position: 'absolute', bottom: 20, right: 20, padding: 12, minWidth: 200 }}>
				{/* Restart Button */}
				<button
					onClick={restart}
					style={{
						width: '100%',
						background: '#333',
						color: '#fff',
						border: '1px solid #555',
						padding: '6px 0',
						fontSize: 11,
						fontFamily: 'Inter',
						fontWeight: 600,
						cursor: 'pointer',
						pointerEvents: 'auto',
						textTransform: 'uppercase',
					}}
					onMouseEnter={e => (e.currentTarget.style.background = '#444')}
					onMouseLeave={e => (e.currentTarget.style.background = '#333')}>
					Reset Simulation
				</button>
			</div>
		</div>
	)
}

const TelemetryRow = ({
	label,
	value,
	color,
	subLabel,
}: {
	label: string
	value: string
	color?: string
	subLabel?: string
}) => (
	<div className='eng-table-row'>
		<div style={{ display: 'flex', flexDirection: 'column' }}>
			<span className='eng-label' style={{ textTransform: 'none' }}>
				{label}
			</span>
			{subLabel && <span style={{ fontSize: 9, color: '#666', marginTop: -2, fontStyle: 'italic' }}>{subLabel}</span>}
		</div>
		<span className='eng-value' style={{ fontSize: 12, color: color || '#fff' }}>
			{value}
		</span>
	</div>
)

const InputBar = ({ label, value, color }: { label: string; value: number; color: string }) => (
	<div
		className='eng-panel'
		style={{ padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', width: 60 }}>
		<div className='bar-bg' style={{ width: 12, height: 100, position: 'relative' }}>
			<div
				className='bar-fill'
				style={{
					position: 'absolute',
					bottom: 0,
					left: 0,
					right: 0,
					height: `${value * 100}%`,
					background: color,
					transition: 'none', // Wygładzanie robię w pętli stanu
				}}
			/>
		</div>
		<div style={{ marginTop: 6, fontSize: 12, fontWeight: 700 }}>{(value * 100).toFixed(2)}%</div>
		<div className='eng-label' style={{ marginTop: 2 }}>
			{label}
		</div>
	</div>
)
