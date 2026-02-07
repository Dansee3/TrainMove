import { create } from 'zustand'

export const TrainState = {
	IDLE: 'IDLE',
	BOARDING: 'BOARDING',
	MOVING: 'MOVING',
	ARRIVING: 'ARRIVING',
	DEBOARDING: 'DEBOARDING',
	FINISHED: 'FINISHED',
} as const

export type TrainStateType = (typeof TrainState)[keyof typeof TrainState]

interface GameState {
	trainState: TrainStateType
	boardingStep: number
	velocity: number // m/s
	mass: number // kg
	distance: number // m
	totalDistance: number // m (approx length of track)
	cameraMode: 'FOLLOW' | 'FREECAM'

	// Sekcja Fizyki i Sterowania
	physicsParams: {
		frictionCoefficient: number
		airResistance: number
		maxPower: number // Watts
		brakeForceMax: number // Newtons
		extraFriction: number // Newtons (T+)
		massMultiplier: number
		powerMultiplier: number
		maxSpeedLimit: number // m/s
	}
	// Stan sił w czasie rzeczywistym (do wyświetlania w HUD)
	forceState: {
		gravity: number
		friction: number
		airResistance: number
		drive: number
		brake: number
		slope: number // radians
	}
	throttle: number // 0-1
	brake: number // 0-1

	// Akcje (Actions)
	setTrainState: (state: TrainStateType) => void
	setCameraMode: (mode: 'FOLLOW' | 'FREECAM') => void
	updatePhysics: (velocity: number, mass: number, distance: number) => void
	updateForces: (forces: GameState['forceState']) => void
	addToMass: (amount: number) => void
	setBoardingStep: (step: number) => void
	setTotalDistance: (totalDistance: number) => void
	setPhysicsParam: (param: keyof GameState['physicsParams'], value: number) => void
	setThrottle: (throttle: number) => void
	setBrake: (brake: number) => void
	restart: () => void
	resetSignal: number
}

export const useGameStore = create<GameState>(set => ({
	trainState: TrainState.BOARDING,
	velocity: 0,
	mass: 200000,
	distance: 0,
	totalDistance: 3500, // Safe estimate
	boardingStep: 0,
	resetSignal: 0,
	cameraMode: 'FOLLOW',

	// Domyślne parametry fizyczne
	physicsParams: {
		frictionCoefficient: 0.15,
		airResistance: 10.0, // Współczynnik oporu powietrza (~Rho * Cd * A)
		maxPower: 40000000, // Moc maksymalna (40 MW) - skalowane dla masy 200t
		brakeForceMax: 200000, // Maksymalna siła hamowania (200 kN)
		extraFriction: 0,
		massMultiplier: 1.0,
		powerMultiplier: 1.0,
		maxSpeedLimit: 201 / 3.6, // 201 km/h
	},
	forceState: {
		gravity: 0,
		friction: 0,
		airResistance: 0,
		drive: 0,
		brake: 0,
		slope: 0,
	},
	throttle: 0,
	brake: 0,

	setTrainState: state => set({ trainState: state }),
	setCameraMode: mode => set({ cameraMode: mode }),
	updatePhysics: (velocity, mass, distance) => set({ velocity, mass, distance }),
	updateForces: forces => set({ forceState: forces }),
	addToMass: (amount: number) => set(state => ({ mass: state.mass + amount })),
	setBoardingStep: (step: number) => set({ boardingStep: step }),
	setTotalDistance: (totalDistance: number) => set({ totalDistance }),
	setPhysicsParam: (param, value) =>
		set(state => ({
			physicsParams: { ...state.physicsParams, [param]: value },
		})),
	setThrottle: (throttle: number) =>
		set(state => {
			if (state.trainState === TrainState.BOARDING || state.trainState === TrainState.DEBOARDING) {
				return { throttle: 0 }
			}
			return { throttle: Math.max(0, Math.min(1, throttle)) }
		}),
	setBrake: (brake: number) => set({ brake: Math.max(0, Math.min(1, brake)) }),

	restart: () =>
		set(state => ({
			trainState: TrainState.BOARDING,
			boardingStep: 0,
			velocity: 0,
			distance: 0,
			resetSignal: state.resetSignal + 1,
			mass: 10000, // Reset masy do samej lokomotywy (pasażerowie dodadzą swoją masę)
			throttle: 0,
			brake: 0,
			forceState: {
				gravity: 0,
				friction: 0,
				airResistance: 0,
				drive: 0,
				brake: 0,
				slope: 0,
			},
		})),
}))
