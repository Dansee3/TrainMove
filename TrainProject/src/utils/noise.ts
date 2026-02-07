import { createNoise2D } from 'simplex-noise'

const noise2D = createNoise2D()

export const getNoiseHeight = (x: number, z: number) => {
	// Bazowy szum terenu (Base terrain noise)
	let y = noise2D(x * 0.003, z * 0.003) * 15 // szerokie wzgórza (broad hills)
	y += noise2D(x * 0.01, z * 0.01) * 5 // średnie detale (medium details)
	y += noise2D(x * 0.03, z * 0.03) * 1 // małe detale (small details)

	// Dodanie charakteru - prosta suma kilku oktaw szumu wystarcza dla tego stylu.
	return y
}
