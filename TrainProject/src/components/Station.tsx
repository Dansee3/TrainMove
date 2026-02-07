import { useMemo } from 'react'

import { Text } from '@react-three/drei'
import { getTrackInfo } from './trackUtils'

interface StationProps {
	name: string
	distance: number
	color?: string
	side?: number // 1 = prawa strona, -1 = lewa strona
}

export const Station = ({ name, distance, color = '#8B4513', side = 1 }: StationProps) => {
	const { pos, rot } = useMemo(() => {
		const info = getTrackInfo(distance)
		// Obliczanie pozycji peronu względem toru.
		// Tor ma szerokość ~2-3m. Krawędź peronu powinna być blisko.
		// Przesunięcie 12 * strona (zmienna `side`) oznacza środek peronu (szer=12) na 12m, czyli krawędź na 6m.
		// To daje bezpieczny odstęp od osi toru.
		const offset = 12 * side
		const h = info.heading || 0
		const dx = Math.cos(h) * offset
		const dz = -Math.sin(h) * offset

		const x = info.x + dx
		const z = info.z + dz

		return {
			pos: [x, info.height, z] as [number, number, number],
			// Obrót stacji:
			// Jeśli stacja jest po lewej (-1), obracamy o 180 stopni, aby budynek stał tyłem do "nieużytków".
			rot: [0, h + (side === -1 ? Math.PI : 0), 0] as [number, number, number],
		}
	}, [distance, side])

	const platformWidth = 12
	const platformLength = 40
	const platformHeight = 1.0

	return (
		<group position={pos} rotation={rot}>
			{/* --- BAZA PERONU (Platform) --- */}
			<mesh position={[0, platformHeight / 2 - 0.2, 0]} receiveShadow>
				<boxGeometry args={[platformWidth, platformHeight, platformLength]} />
				<meshStandardMaterial color='#444444' roughness={0.9} />
			</mesh>
			{/* Nawierzchnia / Krawężnik */}
			<mesh position={[0, platformHeight, 0]} receiveShadow>
				<boxGeometry args={[platformWidth, 0.1, platformLength]} />
				<meshStandardMaterial color='#555555' roughness={0.6} />
			</mesh>
			{/* Pasek bezpieczeństwa (Żółta linia) */}
			<mesh position={[-platformWidth / 2 + 0.3, platformHeight + 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
				<planeGeometry args={[0.3, platformLength]} />
				<meshStandardMaterial color='#F0E68C' />
			</mesh>

			{/* --- BUDYNEK STACJI (Wiata) --- */}
			<group position={[3, platformHeight, 0]}>
				{/* Tylna ściana */}
				<mesh position={[4, 2, 0]} castShadow receiveShadow>
					<boxGeometry args={[1, 4, 20]} />
					<meshStandardMaterial color={color} roughness={0.7} />
				</mesh>
				{/* Filary */}
				<mesh position={[-3, 2, 8]} castShadow>
					<cylinderGeometry args={[0.2, 0.2, 4]} />
					<meshStandardMaterial color='#333' />
				</mesh>
				<mesh position={[-3, 2, -8]} castShadow>
					<cylinderGeometry args={[0.2, 0.2, 4]} />
					<meshStandardMaterial color='#333' />
				</mesh>
				<mesh position={[-3, 2, 0]} castShadow>
					<cylinderGeometry args={[0.2, 0.2, 4]} />
					<meshStandardMaterial color='#333' />
				</mesh>

				{/* Dach */}
				<mesh position={[0.5, 4.2, 0]} rotation={[0, 0, Math.PI / 12]} castShadow>
					<boxGeometry args={[10, 0.4, 24]} />
					<meshStandardMaterial color='#222' roughness={0.9} />
				</mesh>

				{/* Wisząca tablica z nazwą stacji */}
				<group position={[-3, 4.5, 0]}>
					<mesh position={[0, 0, 0]}>
						<boxGeometry args={[0.2, 2.6, 12]} />
						<meshStandardMaterial color='#fff' />
					</mesh>
					<Text
						position={[-0.11, 0, 0]}
						rotation={[0, -Math.PI / 2, 0]}
						fontSize={1.2}
						color='#000'
						anchorX='center'
						anchorY='middle'
						font='https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf'>
						{name}
					</Text>
				</group>

				{/* Duży szyld na dachu? Nie, user chciał ładniejsze stacje. Wiszący szyld wystarczy. */}
			</group>

			{/* --- DETALE (Ławki, Kosze) --- */}
			{/* Ławka 1 */}
			<group position={[-1, platformHeight, 5]} rotation={[0, -Math.PI / 2, 0]}>
				<mesh position={[0, 0.4, 0]} castShadow>
					<boxGeometry args={[2, 0.1, 0.6]} />
					<meshStandardMaterial color='#8B4513' />
				</mesh>
				<mesh position={[-0.8, 0.2, 0]}>
					<boxGeometry args={[0.1, 0.4, 0.5]} />
					<meshStandardMaterial color='#222' />
				</mesh>
				<mesh position={[0.8, 0.2, 0]}>
					<boxGeometry args={[0.1, 0.4, 0.5]} />
					<meshStandardMaterial color='#222' />
				</mesh>
			</group>

			{/* Ławka 2 */}
			<group position={[-1, platformHeight, -5]} rotation={[0, -Math.PI / 2, 0]}>
				<mesh position={[0, 0.4, 0]} castShadow>
					<boxGeometry args={[2, 0.1, 0.6]} />
					<meshStandardMaterial color='#8B4513' />
				</mesh>
				<mesh position={[-0.8, 0.2, 0]}>
					<boxGeometry args={[0.1, 0.4, 0.5]} />
					<meshStandardMaterial color='#222' />
				</mesh>
				<mesh position={[0.8, 0.2, 0]}>
					<boxGeometry args={[0.1, 0.4, 0.5]} />
					<meshStandardMaterial color='#222' />
				</mesh>
			</group>

			{/* Kosz na śmieci */}
			<mesh position={[2, platformHeight + 0.4, -12]} castShadow>
				<cylinderGeometry args={[0.3, 0.25, 0.8]} />
				<meshStandardMaterial color='#555' metalness={0.6} />
			</mesh>
		</group>
	)
}
