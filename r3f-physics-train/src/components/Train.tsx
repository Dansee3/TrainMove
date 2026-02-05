import { useRef } from 'react'
import { useGLTF, Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'
import { getTrackInfo } from './trackUtils'

// --- PARAMETRY FIZYCZNE ---
// --- PARAMETRY FIZYCZNE ---
const MASS_LOCO = 75000
const MASS_TRAIN = 200000
const TOTAL_MASS = MASS_LOCO + MASS_TRAIN
const GRAVITY = 9.81

const TrainModel = () => {
	const { scene } = useGLTF('/Train.glb')
	const primitive = scene.clone()
	return <primitive object={primitive} scale={[0.07, 0.07, 0.07]} />
}

interface TrainProps {
	resetSignal?: number
	trainRef?: React.RefObject<THREE.Group | null>
}

export const Train = ({ resetSignal, trainRef: externalRef }: TrainProps) => {
	const internalRef = useRef<THREE.Group>(null)
	const trainRef = externalRef ?? internalRef

	// Zostawiamy suwaki wymagane przez użytkownika oraz dodajemy sterowanie mocy i prędkości maksymalnej
	const { throttle, brakeForce, rollingResistance, adhesionCoeff, maxPower, powerMultiplier, maxSpeedKmh } =
		useControls('Kokpit Maszynisty', {
			throttle: { value: 0, min: 0, max: 100, step: 1, label: 'Siła ciągu (Napęd) (%)' },
			brakeForce: { value: 0, min: 0, max: 100, step: 1, label: 'Siła hamowania (%)' },

			// Parametry sił potrzebne do obliczeń
			rollingResistance: { value: 0.002, min: 0, max: 0.05, step: 0.0001, label: 'Opór kół (Tarcie toczenia)' },
			adhesionCoeff: { value: 0.25, min: 0.05, max: 1.0, step: 0.01, label: 'Granica przyczepności (μ)' },

			// Dodatkowe sterowania dla szybszego rozpędu i większej prędkości maksymalnej
			maxPower: { value: 4000000, min: 500000, max: 10000000, step: 100000, label: 'Moc maksymalna (W)' },
			powerMultiplier: { value: 1.15, min: 0.5, max: 3, step: 0.01, label: 'Mnożnik mocy (accel)' },
			maxSpeedKmh: { value: 200, min: 50, max: 400, step: 1, label: 'Prędkość maksymalna (km/h)' },
		})

	const state = useRef({
		distance: 0,
		velocity: 0,
		acceleration: 0,
		banking: 0, // Current smoothed banking angle
	})

	// Prev reset value to detect changes
	const prevReset = useRef<number | undefined>(undefined)

	const speedRef = useRef<HTMLSpanElement>(null)
	const forceGravityRef = useRef<HTMLSpanElement>(null)
	const forceRollRef = useRef<HTMLSpanElement>(null)
	const forceBrakeRef = useRef<HTMLSpanElement>(null)
	const forceDragRef = useRef<HTMLSpanElement>(null)
	const forceLateralRef = useRef<HTMLSpanElement>(null)
	const adhesionRef = useRef<HTMLSpanElement>(null)
	const accelRef = useRef<HTMLSpanElement>(null)
	const vmaxRef = useRef<HTMLSpanElement>(null)
	const slipRef = useRef<HTMLSpanElement>(null)
	const slopeRef = useRef<HTMLSpanElement>(null)
	const heightRef = useRef<HTMLSpanElement>(null)

	useFrame((_, delta) => {
		// Obsługa sygnału resetu: jeśli `resetSignal` się zmienia, ustawiamy stan pociągu na start
		if (resetSignal !== undefined && prevReset.current !== resetSignal) {
			state.current.distance = 0
			state.current.velocity = 0
			state.current.acceleration = 0
			state.current.banking = 0
			prevReset.current = resetSignal
		}

		if (!trainRef.current) return

		const dt = Math.min(delta, 0.1)

		// 1. Fizyka
		const trackInfo = getTrackInfo(state.current.distance)
		const { angle, height, finished, heading = 0, x = 0, z = 0, curvature = 0 } = trackInfo

		if (finished && state.current.velocity > 0) {
			state.current.velocity = 0
			state.current.acceleration = 0
			return
		}

		const currentMass = TOTAL_MASS

		// Siła grawitacji wzdłuż toru (wspomaga zjazd, przeciwstawia się podjazdowi)
		const fGravity = -currentMass * GRAVITY * Math.sin(angle)

		// Moc silnika -> siła trakcyjna (przy niskich prędkościach ograniczamy dzielenie przez zero)
		const currentPower = (throttle / 100) * (maxPower as number) * (powerMultiplier as number)
		const speedForForce = Math.max(0.5, Math.abs(state.current.velocity))
		const fEngineRaw = currentPower / speedForForce // w N

		// Normalna i granica przyczepności
		const fNormal = currentMass * GRAVITY * Math.cos(angle)
		const adhesionLimit = adhesionCoeff * fNormal

		// Jeśli siła trakcyjna przekracza przyczepność => buksowanie, ograniczamy siłę do limitu
		let slipping = false
		let fEngine = fEngineRaw
		if (Math.abs(fEngineRaw) > adhesionLimit) {
			slipping = true
			fEngine = Math.sign(fEngineRaw) * adhesionLimit
		}

		// Opór powietrza (quadratic) - stałe domyślne (użytkownik nie ma suwaka dla tych wartości)
		const AIR_DENSITY_LOCAL = 1.225
		const DEFAULT_DRAG_COEFF = 1.0
		const DEFAULT_FRONTAL_AREA = 10
		const fDrag =
			-Math.sign(state.current.velocity || 1) *
			(0.5 * AIR_DENSITY_LOCAL * DEFAULT_FRONTAL_AREA * DEFAULT_DRAG_COEFF * state.current.velocity ** 2)

		// Opór toczenia (stały współczynnik razy siła normalna)
		const fRolling = -Math.sign(state.current.velocity || 1) * (fNormal * rollingResistance)

		// Siła hamowania zależna od ustawienia hamulca (prosty model)
		const maxBrakeCoeff = 0.5 // maksymalny udział siły hamowania względem siły normalnej (bezpieczeństwo)
		const fBrake = -Math.sign(state.current.velocity || 1) * (fNormal * (brakeForce / 100) * maxBrakeCoeff)

		// Suma sił
		const fResist = fRolling + fBrake
		let fNet = fEngine + fGravity + fResist + fDrag

		// Trzymamy pociąg w miejscu jeśli siły są bardzo małe i prędkość bliska zeru
		if (Math.abs(state.current.velocity) < 0.05 && Math.abs(fNet) < Math.abs(fResist) && throttle === 0) {
			fNet = 0
			state.current.velocity = 0
		}

		const acceleration = fNet / currentMass
		state.current.acceleration = acceleration
		state.current.velocity += acceleration * dt
		// Ograniczenie prędkości do ustawionej maksymalnej
		const maxSpeedMps = (maxSpeedKmh as number) / 3.6
		if (Math.abs(state.current.velocity) > maxSpeedMps) {
			state.current.velocity = Math.sign(state.current.velocity) * maxSpeedMps
			state.current.acceleration = 0
		}
		state.current.distance += state.current.velocity * dt
		if (state.current.distance < 0) {
			state.current.distance = 0
			state.current.velocity = 0
		}

		// Siła boczna (przyspieszenie dośrodkowe = v^2 * curvature)
		const lateralAccel = state.current.velocity ** 2 * curvature
		const lateralForce = currentMass * lateralAccel

		// Przechył pociągu (banking) - pochylenie w stronę zakrętu (do wewnątrz)
		// Fizycznie: kąt przechyłu kompensujący siłę odśrodkową to atan(v^2 / (R*g))
		// Zmniejszamy nieco efekt wizualny (0.8) i ograniczamy maksymalny wychył (clamp)
		// żeby uniknąć nienaturalnych przechyleń przy bardzo dużych prędkościach/ostrych zakrętach.
		const MAX_BANKING = 0.1 // ok. 14 stopni
		const BANKING_FACTOR = 0.4

		const optimalBanking = Math.atan((lateralAccel * BANKING_FACTOR) / GRAVITY)
		let targetBanking = -optimalBanking

		// Clamp banking
		targetBanking = Math.max(-MAX_BANKING, Math.min(MAX_BANKING, targetBanking))

		// Smooth banking transition
		// Zwiększamy szybkość reakcji (z 1.0 na 3.0), żeby pociąg szybciej reagował na zakręt ("nonstop"),
		// ale używamy lerp, żeby ukryć skokową zmianę krzywizny toru między segmentami.
		const smoothingSpeed = 3.0
		state.current.banking += (targetBanking - state.current.banking) * Math.min(1, dt * smoothingSpeed)

		trainRef.current.position.x = x
		trainRef.current.position.z = z
		trainRef.current.position.y = height
		trainRef.current.rotation.x = -angle
		trainRef.current.rotation.y = heading
		trainRef.current.rotation.z = state.current.banking
		// UI
		if (speedRef.current) speedRef.current.innerText = (state.current.velocity * 3.6).toFixed(1)
		if (forceGravityRef.current) forceGravityRef.current.innerText = (fGravity / 1000).toFixed(2)
		if (forceRollRef.current) forceRollRef.current.innerText = (Math.abs(fRolling) / 1000).toFixed(2)
		if (forceBrakeRef.current) forceBrakeRef.current.innerText = (Math.abs(fBrake) / 1000).toFixed(2)
		if (forceDragRef.current) forceDragRef.current.innerText = (Math.abs(fDrag) / 1000).toFixed(2)
		if (forceLateralRef.current) forceLateralRef.current.innerText = (Math.abs(lateralForce) / 1000).toFixed(2)
		if (adhesionRef.current) adhesionRef.current.innerText = (adhesionLimit / 1000).toFixed(2)
		if (slipRef.current) slipRef.current.innerText = slipping ? 'TAK' : 'NIE'
		if (slopeRef.current) slopeRef.current.innerText = (Math.tan(angle) * 100).toFixed(1)
		if (heightRef.current) heightRef.current.innerText = height.toFixed(1)
	})

	return (
		<group ref={trainRef}>
			<TrainModel />

			<Html position={[0, 9, 0]} center distanceFactor={15}>
				<div style={panelStyle}>
					<h3>Komputer Pokładowy</h3>
					<div style={rowStyle}>
						Prędkość:{' '}
						<span ref={speedRef} style={valStyle}>
							0
						</span>{' '}
						km/h
					</div>
					<hr style={{ borderColor: '#555' }} />
					<div style={rowStyle}>
						Opór powietrza:{' '}
						<span ref={forceDragRef} style={{ color: '#aaf' }}>
							0
						</span>{' '}
						kN
					</div>
					<div style={rowStyle}>
						Opór kół (toczenie):{' '}
						<span ref={forceRollRef} style={{ color: '#fa0' }}>
							0
						</span>{' '}
						kN
					</div>
					<div style={rowStyle}>
						Siła wzniesienia (grawitacja):{' '}
						<span ref={forceGravityRef} style={{ color: '#f44' }}>
							0
						</span>{' '}
						kN
					</div>
					<div style={rowStyle}>
						Siła hamowania:{' '}
						<span ref={forceBrakeRef} style={{ color: '#faa' }}>
							0
						</span>{' '}
						kN
					</div>
					<div style={rowStyle}>
						Siła boczna (zakręt):{' '}
						<span ref={forceLateralRef} style={{ color: '#8cf' }}>
							0
						</span>{' '}
						kN
					</div>
					<div style={rowStyle}>
						Przyspieszenie:{' '}
						<span ref={accelRef} style={{ color: '#afa' }}>
							0
						</span>{' '}
						m/s²
					</div>
					<div style={rowStyle}>
						Prędkość maksymalna:{' '}
						<span ref={vmaxRef} style={{ color: '#fff' }}>
							0
						</span>{' '}
						km/h
					</div>
					<div style={rowStyle}>
						Granica przyczepności (kN):{' '}
						<span ref={adhesionRef} style={{ color: '#fff' }}>
							0
						</span>
					</div>
					<div style={rowStyle}>
						Poślizg (buksowanie):{' '}
						<span ref={slipRef} style={{ color: '#f55' }}>
							NIE
						</span>
					</div>
					<hr style={{ borderColor: '#555' }} />
					<div style={rowStyle}>
						Nachylenie: <span ref={slopeRef}>0</span> %
					</div>
					<div style={rowStyle}>
						Wysokość: <span ref={heightRef}>0</span> m
					</div>
				</div>
			</Html>
		</group>
	)
}

const panelStyle: React.CSSProperties = {
	background: 'rgba(0, 0, 0, 0.85)',
	color: 'white',
	padding: '10px',
	borderRadius: '8px',
	fontFamily: 'monospace',
	width: '300px',
	height: 'auto',
	fontSize: '12px',
	backdropFilter: 'blur(4px)',
	border: '1px solid #444',
	userSelect: 'none',
	boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
}

const rowStyle: React.CSSProperties = {
	display: 'flex',
	justifyContent: 'space-between',
	marginBottom: '6px',
	fontSize: '12px',
}

const valStyle: React.CSSProperties = {
	fontWeight: 'bold',
	fontSize: '12px',
}
