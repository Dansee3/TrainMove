export const STATION_DEFS = [
	{ name: 'KRYNICA ZDRÓJ', dist: 20, side: 1, color: '#8d5524' },
	{ name: 'PIWNICZNA ZDRÓJ', dist: 2950, side: -1, color: '#5d4037' },
	{ name: 'NOWY SĄCZ', dist: 4780, side: 1, color: '#8d5524' },
]

// Oblicza środek koryta rzeki dla danej współrzędnej Z, tworząc meandrujący kształt
export const getRiverCenterX = (z: number) => {
	if (z < 2000) {
		const t = z / 2000
		return -300 + t * 150
	} else if (z < 3500) {
		const t = (z - 2000) / 1500
		return -150 + t * 500
	}
	return 350
}
