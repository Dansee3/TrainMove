export const TRACK_SEGMENTS = [
	// Definicja segmentów toru:
	// length: długość segmentu w metrach
	// angle: kąt nachylenia (radiany) - dodatni to podjazd, ujemny to zjazd
	// turn: całkowita zmiana kierunku (heading) na długości segmentu (radiany)
	{ length: 200, angle: 0, turn: 0 }, // Stacja początkowa "Krynica Zdrój" - płaski odcinek startowy
	{ length: 400, angle: 0.02, turn: 0.2 }, // Łagodne wzniesienie z lekkim łukiem w prawo
	{ length: 600, angle: 0.05, turn: -0.4 }, // Bardziej stromy podjazd z wyraźnym skrętem w lewo
	{ length: 400, angle: 0, turn: 0.3 }, // Płaskowyż z łukiem w prawo (stabilizacja wysokości)
	{ length: 600, angle: -0.03, turn: -0.25 }, // Zjazd do doliny z łukiem w lewo (koniec odcinka ~2200m)
	{ length: 400, angle: 0, turn: 0 }, // MOST - 400m prostej i płaskiej trasy (2200-2600m), środek ~2400m
	{ length: 200, angle: 0, turn: 0 }, // Odcinek buforowy za mostem (2600-2800m)
	{ length: 300, angle: 0, turn: 0 }, // Stacja "Piwniczna Zdrój" (2800-3100m) - potencjalny przystanek
	// Cel: całkowita długość ~4800m. Obecnie: 3100m.
	{ length: 600, angle: 0.02, turn: 0.15 }, // Kolejny etap wznoszenia (koniec 3700m)
	{ length: 500, angle: 0.01, turn: -0.1 }, // Łagodny łuk korekcyjny (koniec 4200m)
	{ length: 600, angle: -0.01, turn: 0.2 }, // Delikatny zjazd z łukiem (koniec 4800m)
	{ length: 200, angle: 0, turn: 0 }, // Prosta dojazdowa przed stacją końcową
	{ length: 300, angle: 0, turn: 0 }, // Stacja końcowa "Nowy Sącz" (koniec trasy)
]

export const getTrackInfo = (distance: number) => {
	let currentDist = 0
	let currentHeight = 0
	let currentHeading = 0 // kierunek w radianach, 0 == +Z
	let currentX = 0
	let currentZ = 0

	// Obsługa prostej ekstrapolacji liniowej dla wartości poza zakresem (przed startem lub za końcem).
	// Zapobiega to gwałtownym ucięciom terenu/torów i dziwnemu zachowaniu kamery.
	if (distance < 0) {
		// Ekstrapolacja wsteczna od punktu startowego
		const firstSeg = TRACK_SEGMENTS[0]
		// Dla uproszczenia zakładamy stały heading (0) i płaski teren.
		// W punkcie dist=0 mamy: x=0, z=0, heading=0, height=0.
		// Rozszerzamy po prostu wzdłuż osi Z na minusie.
		return {
			angle: firstSeg.angle,
			height: distance * Math.sin(firstSeg.angle), // zwykle 0, jeśli płasko
			finished: false,
			heading: 0,
			x: 0 + distance * Math.sin(0), // 0
			z: 0 + distance * Math.cos(0), // dystans (ujemny)
			curvature: 0,
		}
	}

	for (const seg of TRACK_SEGMENTS) {
		const segLength = seg.length
		const segSlope = seg.angle
		const segTurn = seg.turn || 0

		if (distance >= currentDist && distance < currentDist + segLength) {
			const local = distance - currentDist
			// Krzywizna (radiany na metr)
			const curvature = segTurn / segLength

			// Przybliżona projekcja pozioma lokalnego dystansu
			const localHorizontal = local * Math.cos(segSlope)
			// przybliżony kierunek pośrodku segmentu dla lepszego wyliczenia współrzędnych
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

		// Przesunięcie o pełny segment (aktualizacja stanu globalnego pętli)
		const horiz = segLength * Math.cos(segSlope)
		const midH = currentHeading + segTurn * 0.5
		currentX += horiz * Math.sin(midH)
		currentZ += horiz * Math.cos(midH)
		currentHeading += segTurn
		currentHeight += segLength * Math.sin(segSlope)
		currentDist += segLength
	}

	// Jeśli dotarliśmy tutaj, distance >= totalLength. Ekstrapolujemy w przód.
	// Używamy ostatniego znanego stanu (currentX, currentZ, currentHeading, currentHeight)
	// i zakładamy prostą linię (krzywizna 0) oraz płaski teren dla bezpieczeństwa.
	const delta = distance - currentDist
	const lx = Math.sin(currentHeading) * delta
	const lz = Math.cos(currentHeading) * delta

	return {
		angle: 0,
		height: currentHeight, // płaskie przedłużenie
		finished: true,
		heading: currentHeading,
		x: currentX + lx,
		z: currentZ + lz,
		curvature: 0,
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
