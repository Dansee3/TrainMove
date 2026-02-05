import * as THREE from 'three'

export const TRACK_SEGMENTS = [
	// length (m), slope angle (rad), turn (radians) - turn is total heading change across segment
	{ length: 200, angle: 0, turn: 0 }, // Stacja początkowa (płasko)
	{ length: 400, angle: 0.02, turn: 0.2 }, // Lekki podjazd + lekki łuk
	{ length: 600, angle: 0.05, turn: -0.4 }, // Ostry podjazd z zakrętem
	{ length: 400, angle: 0, turn: 0.3 }, // Płaskowyż z łukiem
	{ length: 600, angle: -0.03, turn: -0.25 }, // Zjazd do doliny z łukiem
	{ length: 1000, angle: 0.015, turn: 0.15 }, // Długi łagodny podjazd do Krynicy z niewielkim skrętem
	{ length: 300, angle: 0, turn: 0 }, // Stacja końcowa
]

export const getTrackInfo = (distance: number) => {
	let currentDist = 0
	let currentHeight = 0
	let currentHeading = 0 // heading in radians, 0 == +Z
	let currentX = 0
	let currentZ = 0

	for (const seg of TRACK_SEGMENTS) {
		const segLength = seg.length
		const segSlope = seg.angle
		const segTurn = seg.turn || 0

		if (distance >= currentDist && distance < currentDist + segLength) {
			const local = distance - currentDist
			// curvature (radians per meter)
			const curvature = segTurn / segLength

			// approximate horizontal projection of the local distance
			const localHorizontal = local * Math.cos(segSlope)
			// approximate mid-heading for better coordinate estimate
			const midHeading = currentHeading + segTurn * (local / segLength) * 0.5
			const dx = localHorizontal * Math.sin(midHeading)
			const dz = localHorizontal * Math.cos(midHeading)

			const x = currentX + dx
			const z = currentZ + dz
			const height = currentHeight + local * Math.sin(segSlope)

			return {
				angle: segSlope,
				height,
				finished: false,
				heading: currentHeading + segTurn * (local / segLength),
				x,
				z,
				curvature,
			}
		}

		// full segment advance
		const horiz = segLength * Math.cos(segSlope)
		const midH = currentHeading + segTurn * 0.5
		currentX += horiz * Math.sin(midH)
		currentZ += horiz * Math.cos(midH)
		currentHeading += segTurn
		currentHeight += segLength * Math.sin(segSlope)
		currentDist += segLength
	}

	return {
		angle: 0,
		height: currentHeight,
		finished: true,
		heading: currentHeading,
		x: currentX,
		z: currentZ,
		curvature: 0,
	}
}
