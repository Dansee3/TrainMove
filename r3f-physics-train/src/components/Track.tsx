import { useMemo } from 'react'
import * as THREE from 'three'
import { TRACK_SEGMENTS, getTrackInfo } from './trackUtils'

export const Track = () => {
	// render track by sampling small segments along the centerline so curves are visible
	const trackMeshes = useMemo(() => {
		const meshes = []
		const totalLength = TRACK_SEGMENTS.reduce((s, seg) => s + seg.length, 0)
		const step = 5 // meters between samples
		let prevPoint = getTrackInfo(0)
		for (let d = step; d <= totalLength + step; d += step) {
			const dd = Math.min(d, totalLength)
			const p = getTrackInfo(dd)
			const v = new THREE.Vector3(p.x - prevPoint.x, p.height - prevPoint.height, p.z - prevPoint.z)
			const len = v.length()
			if (len > 0.01) {
				const midX = (p.x + prevPoint.x) / 2
				const midY = (p.height + prevPoint.height) / 2
				const midZ = (p.z + prevPoint.z) / 2

				// compute rotation to align box with vector
				const dir = v.clone().normalize()
				const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)

				meshes.push(
					<mesh key={`seg-${d}`} position={[midX, midY - 0.1, midZ]} quaternion={quaternion} receiveShadow>
						<boxGeometry args={[2, 0.2, len]} />
						<meshStandardMaterial color={Math.floor(dd / 20) % 2 === 0 ? '#444' : '#555'} roughness={0.3} />
					</mesh>,
				)
			}
			prevPoint = p
		}
		return meshes
	}, [])

	return <group>{trackMeshes}</group>
}
