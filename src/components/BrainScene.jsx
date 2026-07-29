import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { buildBrain } from '../brain/geometry.js'
import { ZONES, ZONE_BY_ID } from '../brain/zones.js'
import { anchorsFor } from '../anchors.js'
import { wasDrag } from '../pointer.js'
import { useStore } from '../store.js'

const EXPLODE_SCALE = 0.55

/** Makes a mesh invisible to the raycaster without hiding it. */
const noRaycast = () => null

export function useBrain() {
  return useMemo(() => buildBrain(), [])
}

export function useAnchors() {
  const notes = useStore((s) => s.notes)
  return useMemo(() => anchorsFor(notes), [notes])
}

/** Where a zone sits once the exploded view is dialled up. */
export function explodeOffset(centroid, explode) {
  if (!explode) return [0, 0, 0]
  const v = new THREE.Vector3(...centroid)
  if (v.lengthSq() < 1e-6) return [0, 0, 0]
  v.normalize().multiplyScalar(explode * EXPLODE_SCALE)
  return [v.x, v.y, v.z]
}

/* ------------------------------------------------------------------ zones */

function ZoneMesh({ zone, geometry, centroid }) {
  const selectedZoneIds = useStore((s) => s.selectedZoneIds)
  const hoveredZoneId = useStore((s) => s.hoveredZoneId)
  const xray = useStore((s) => s.xray)
  const explode = useStore((s) => s.explode)
  const selectZone = useStore((s) => s.selectZone)
  const hoverZone = useStore((s) => s.hoverZone)
  const focusPoint = useStore((s) => s.focusPoint)

  const selected = selectedZoneIds.includes(zone.id)
  const hovered = hoveredZoneId === zone.id
  const dimmed = selectedZoneIds.length > 0 && !selected

  let opacity = 1
  if (xray && !zone.deep) opacity = 0.12
  else if (dimmed) opacity = 0.45

  const emissive = selected ? 0.45 : hovered ? 0.3 : 0.04
  const offset = explodeOffset(centroid, explode)

  return (
    <mesh
      geometry={geometry}
      position={offset}
      castShadow
      receiveShadow
      // In x-ray view the see-through cortex must not swallow clicks meant for
      // the structures underneath it.
      raycast={xray && !zone.deep ? noRaycast : THREE.Mesh.prototype.raycast}
      onPointerOver={(e) => {
        e.stopPropagation()
        hoverZone(zone.id)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={(e) => {
        e.stopPropagation()
        hoverZone(null)
        document.body.style.cursor = 'auto'
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (wasDrag(e)) return // they were orbiting, not picking a zone
        // The brain only ever picks one zone at a time — multi-zone filters are
        // built in the panel, not here. Clicking replaces whatever was selected.
        selectZone(selected ? null : zone.id)
        if (!selected) {
          const n = e.face ? e.face.normal.clone().normalize() : new THREE.Vector3(0, 0, 1)
          focusPoint(e.point.toArray(), n.toArray(), 3.4)
        }
      }}
    >
      <meshStandardMaterial
        color={zone.color}
        emissive={zone.color}
        emissiveIntensity={emissive}
        roughness={0.62}
        metalness={0.06}
        transparent
        opacity={opacity}
        depthWrite={opacity > 0.9}
        side={THREE.FrontSide}
      />
    </mesh>
  )
}

function ZoneLabel({ zone, centroid }) {
  const hoveredZoneId = useStore((s) => s.hoveredZoneId)
  const selectedZoneIds = useStore((s) => s.selectedZoneIds)
  const explode = useStore((s) => s.explode)
  const notes = useStore((s) => s.notes)
  if (hoveredZoneId !== zone.id && !selectedZoneIds.includes(zone.id)) return null

  const off = explodeOffset(centroid, explode)
  const p = new THREE.Vector3(...centroid).multiplyScalar(1.22).add(new THREE.Vector3(...off))
  const count = notes.filter((n) => n.zoneId === zone.id).length

  return (
    <Html position={p.toArray()} center zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
      <div className="zone-label" style={{ '--zone': zone.color }}>
        <span>{zone.name}</span>
        <em>{count} note{count === 1 ? '' : 's'}</em>
      </div>
    </Html>
  )
}

function Brain() {
  const { geometries, centroids } = useBrain()
  return (
    <group>
      {ZONES.map((zone) =>
        geometries[zone.id] ? (
          <ZoneMesh key={zone.id} zone={zone} geometry={geometries[zone.id]} centroid={centroids[zone.id]} />
        ) : null,
      )}
      {ZONES.map((zone) =>
        centroids[zone.id] ? <ZoneLabel key={`l-${zone.id}`} zone={zone} centroid={centroids[zone.id]} /> : null,
      )}
    </group>
  )
}

/* ---------------------------------------------------------------- markers */

function Marker({ note, anchor }) {
  const explode = useStore((s) => s.explode)
  const locateNote = useStore((s) => s.locateNote)
  const { centroids } = useBrain()
  const [hovered, setHovered] = useState(false)
  const ring = useRef()

  const zone = ZONE_BY_ID[note.zoneId]

  const { position, quaternion } = useMemo(() => {
    const n = new THREE.Vector3(...anchor.n).normalize()
    const off = explodeOffset(centroids[note.zoneId] ?? [0, 0, 0], explode)
    const p = new THREE.Vector3(...anchor.p).addScaledVector(n, 0.02).add(new THREE.Vector3(...off))
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n)
    return { position: p, quaternion: q }
  }, [anchor, explode, centroids, note.zoneId])

  useFrame((state) => {
    if (!ring.current) return
    const t = state.clock.elapsedTime
    ring.current.scale.setScalar(1 + Math.sin(t * 3) * 0.18)
    ring.current.material.opacity = 0.55 - Math.sin(t * 3) * 0.25
  })

  const scale = hovered ? 1.6 : 1.45

  return (
    <group position={position} quaternion={quaternion} renderOrder={10}>
      <group
        scale={scale}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={(e) => {
          e.stopPropagation()
          setHovered(false)
          document.body.style.cursor = 'auto'
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (wasDrag(e)) return
          locateNote(note.id)
        }}
      >
        {/* pin stem */}
        <mesh position={[0, 0.035, 0]}>
          <cylinderGeometry args={[0.006, 0.006, 0.07, 8]} />
          <meshStandardMaterial color={zone.color} emissive={zone.color} emissiveIntensity={0.5} roughness={0.4} />
        </mesh>
        {/* pin head */}
        <mesh position={[0, 0.08, 0]}>
          <sphereGeometry args={[0.032, 20, 16]} />
          <meshStandardMaterial
            color={zone.color}
            emissive={zone.color}
            emissiveIntensity={hovered ? 1.5 : 1.2}
            roughness={0.25}
            metalness={0.1}
          />
        </mesh>
        {/* base disc against the cortex */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.026, 20]} />
          <meshBasicMaterial color={zone.color} transparent opacity={0.85} />
        </mesh>
      </group>

      <mesh ref={ring} position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.05, 0.075, 32]} />
        <meshBasicMaterial color={zone.color} transparent opacity={0.5} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      <Html position={[0, 0.14, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
        <div className="pin-label is-selected" style={{ '--zone': zone.color }}>
          {note.title}
        </div>
      </Html>
    </group>
  )
}

/**
 * Only the selected note is pinned. A brain covered in pins hides the anatomy,
 * so the surface stays clean until you pick a note — from the list, the stats,
 * or a search result — and then exactly one pin appears where it lives.
 */
function Markers() {
  const notes = useStore((s) => s.notes)
  const selectedNoteId = useStore((s) => s.selectedNoteId)
  const anchors = useAnchors()

  const note = selectedNoteId ? notes.find((n) => n.id === selectedNoteId) : null
  const anchor = note ? anchors[note.id] : null
  if (!anchor) return null

  return <Marker key={note.id} note={note} anchor={anchor} />
}

/* ------------------------------------------------------------- camera rig */

function CameraRig() {
  const focus = useStore((s) => s.focus)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)
  const anim = useRef(null)

  useEffect(() => {
    if (!focus) return
    const target = new THREE.Vector3(...focus.p)
    const dir = new THREE.Vector3(...focus.n)
    if (dir.lengthSq() < 1e-6) dir.set(0.35, 0.25, 1)
    dir.normalize()
    dir.y += 0.2
    dir.normalize()
    anim.current = { target, pos: target.clone().addScaledVector(dir, focus.distance), t: 0 }
  }, [focus?.stamp]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    const a = anim.current
    if (!a) return
    a.t += dt
    const k = 1 - Math.exp(-dt * 4.5)
    camera.position.lerp(a.pos, k)
    if (controls) {
      controls.target.lerp(a.target, k)
      controls.update()
    }
    if (camera.position.distanceTo(a.pos) < 0.01 || a.t > 3) anim.current = null
  })

  return null
}

/* --------------------------------------------------------------- the scene */

export default function BrainScene() {
  const clearSelection = useStore((s) => s.clearSelection)
  const autoRotate = useStore((s) => s.autoRotate)

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [3.9, 1.3, 2.3], fov: 38, near: 0.1, far: 100 }}
      onPointerMissed={(e) => {
        if (!wasDrag(e)) clearSelection()
      }}
    >
      <color attach="background" args={['#0a0d14']} />
      <fog attach="fog" args={['#0a0d14', 7, 16]} />

      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#a9c8ff', '#2a2118', 0.55]} />
      <directionalLight position={[4, 6, 5]} intensity={1.7} castShadow shadow-mapSize={[1024, 1024]}>
        <orthographicCamera attach="shadow-camera" args={[-3, 3, 3, -3, 0.1, 20]} />
      </directionalLight>
      <directionalLight position={[-5, 2, -3]} intensity={0.55} color="#8fb7ff" />
      <directionalLight position={[0, 2, -6]} intensity={0.7} color="#ff9ec4" />

      <group position={[0, 0.1, 0]}>
        <Brain />
        <Markers />
      </group>

      {/* The brain never moves, so bake the shadow once instead of re-rendering
          115k triangles into it every frame. */}
      <ContactShadows
        position={[0, -1.35, 0]}
        opacity={0.45}
        scale={7}
        blur={2.6}
        far={3.5}
        resolution={512}
        frames={1}
        color="#000814"
      />

      <OrbitControls
        makeDefault
        enablePan
        enableDamping
        dampingFactor={0.08}
        minDistance={1.4}
        maxDistance={9}
        autoRotate={autoRotate}
        autoRotateSpeed={0.6}
      />
      <CameraRig />
    </Canvas>
  )
}
