import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { ridged, valueNoise } from './noise.js'
import { classifyCortex, ss, sylvianAt } from './zones.js'

// Everything is modelled in a right-hemisphere frame:
//   +x lateral, +y superior, +z anterior.
// The left hemisphere is the same triangles mirrored through x = 0.

const RX = 0.47
const RY = 0.6
const RZ = 0.86
const GAP = 0.2 // half the distance between hemisphere centres
const MEDIAL = -0.4 // the flat medial wall, in the local frame
const MEDIAL_K = 0.07 // how sharply the surface folds onto that wall
const MAX_SAMPLES = 160 // marker anchor points kept per zone

/** Cortical surface point for a unit direction on the base sphere. */
function cerebrumPoint(d, out) {
  const bx = d.x
  const by = d.y
  const bz = d.z

  const frontal = ss(0.3, 1.0, bz)
  const occipital = ss(0.35, 1.0, -bz)

  // How strongly this point belongs to the temporal lobe, used to shape the
  // wedge that hangs below the lateral fissure.
  const syl = sylvianAt(bz)
  const temporal =
    ss(syl + 0.12, syl - 0.3, by) * ss(-0.62, -0.3, bz) * (1 - ss(0.28, 0.52, bz))

  // A soft clamp folds the whole medial half onto one flat wall, so the
  // hemispheres meet across a narrow longitudinal fissure rather than bulging
  // into a deep V you can see straight through from above.
  let x = MEDIAL + MEDIAL_K * Math.log1p(Math.exp((bx - MEDIAL) / MEDIAL_K))
  let y = by * (1 - 0.08 * frontal - 0.16 * occipital)
  const z = bz

  // The brain narrows toward both poles — but only laterally. Tapering the
  // medial wall too would splay the poles apart and open up the fissure.
  x = MEDIAL + (x - MEDIAL) * (1 - 0.12 * frontal - 0.2 * occipital)

  // The skull base is flat, so the underside is lifted...
  y += 0.3 * ss(0.05, 0.95, -by) * (1 - temporal)
  // ...except under the temporal lobe, which hangs below it.
  y -= 0.13 * temporal
  x += 0.05 * temporal

  out.set(x * RX, y * RY, z * RZ)
}

/** Gyri and sulci: ridged noise displaced along the surface normal. */
function gyri(x, y, z) {
  // A warp of the sampling domain stops the folds looking like a regular lattice.
  const w = 0.05
  const wx = x + w * valueNoise(x * 4 + 5.2, y * 4, z * 4)
  const wy = y + w * valueNoise(x * 4, y * 4 + 7.9, z * 4)
  const wz = z + w * valueNoise(x * 4, y * 4, z * 4 + 2.4)

  const f1 = 12.0
  const f2 = 24.0
  const a = ridged(wx * f1 + 11.3, wy * f1 + 3.7, wz * f1 + 7.1)
  const b = ridged(wx * f2 + 2.1, wy * f2 + 9.4, wz * f2 + 5.5)
  // Sulci are narrow clefts between broad gyral crowns, so bias toward the peak.
  const crown = Math.pow(a, 2.2)
  return 0.052 * (crown - 0.42) + 0.012 * (b - 0.5)
}

/** Cerebellar folia are far finer and run in near-horizontal bands. */
function folia(x, y, z) {
  const a = ridged(x * 6 + 3.1, y * 20 + 1.7, z * 16 + 8.2)
  const groove = 1 - ss(0.04, 0.15, Math.abs(x))
  return 0.015 * (a - 0.5) - 0.02 * groove
}

class Builder {
  constructor() {
    this.pos = {} // zoneId -> number[]
    this.nor = {}
    this.samples = {} // zoneId -> {p:[x,y,z], n:[x,y,z]}[]
  }

  bucket(zone) {
    if (!this.pos[zone]) {
      this.pos[zone] = []
      this.nor[zone] = []
      this.samples[zone] = []
    }
    return zone
  }

  /** Append one triangle. `mirror` flips it into the left hemisphere. */
  tri(zone, p, n, mirror) {
    this.bucket(zone)
    const P = this.pos[zone]
    const N = this.nor[zone]
    const order = mirror ? [0, 2, 1] : [0, 1, 2]
    const s = mirror ? -1 : 1
    for (const i of order) {
      P.push(s * p[i * 3], p[i * 3 + 1], p[i * 3 + 2])
      N.push(s * n[i * 3], n[i * 3 + 1], n[i * 3 + 2])
    }
  }

  sample(zone, p, n, mirror) {
    const s = mirror ? -1 : 1
    this.samples[zone].push({ p: [s * p[0], p[1], p[2]], n: [s * n[0], n[1], n[2]] })
  }

  /** Append a standard THREE geometry (sphere, tube, ...) into a zone. */
  addGeometry(zone, geo, matrix, { mirror = false, sampleable = true } = {}) {
    this.bucket(zone)
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    if (matrix) g.applyMatrix4(matrix)
    if (!g.attributes.normal) g.computeVertexNormals()
    const p = g.attributes.position.array
    const n = g.attributes.normal.array
    const face = new Array(9)
    const fnor = new Array(9)
    for (let i = 0; i < p.length; i += 9) {
      for (let k = 0; k < 9; k++) {
        face[k] = p[i + k]
        fnor[k] = n[i + k]
      }
      this.tri(zone, face, fnor, mirror)
      if (sampleable) {
        this.sample(
          zone,
          [(face[0] + face[3] + face[6]) / 3, (face[1] + face[4] + face[7]) / 3, (face[2] + face[5] + face[8]) / 3],
          [(fnor[0] + fnor[3] + fnor[6]) / 3, (fnor[1] + fnor[4] + fnor[7]) / 3, (fnor[2] + fnor[5] + fnor[8]) / 3],
          mirror,
        )
      }
    }
    g.dispose()
  }

  finish() {
    const geometries = {}
    const box = new THREE.Box3()
    for (const zone of Object.keys(this.pos)) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos[zone], 3))
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor[zone], 3))
      g.computeBoundingBox()
      box.union(g.boundingBox)
      geometries[zone] = g
    }

    // Centre the whole brain on the origin and normalise its size.
    const centre = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const scale = 2.6 / Math.max(size.x, size.y, size.z)
    const m = new THREE.Matrix4()
      .makeScale(scale, scale, scale)
      .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z))

    const samples = {}
    const centroids = {}
    for (const zone of Object.keys(geometries)) {
      const g = geometries[zone]
      g.applyMatrix4(m)
      g.computeBoundingSphere()
      g.computeBoundingBox()
      centroids[zone] = g.boundingBox.getCenter(new THREE.Vector3()).toArray()

      const all = this.samples[zone]
      const stride = Math.max(1, Math.floor(all.length / MAX_SAMPLES))
      const kept = []
      const v = new THREE.Vector3()
      for (let i = 0; i < all.length && kept.length < MAX_SAMPLES; i += stride) {
        const s = all[i]
        v.fromArray(s.p).applyMatrix4(m)
        kept.push({ p: v.toArray(), n: s.n })
      }
      samples[zone] = kept
    }
    return { geometries, samples, centroids }
  }
}

function buildCerebrum(b) {
  // Icosahedron detail subdivides edges linearly, so faces = 20*(detail+1)^2.
  // 44 gives ~40k faces per hemisphere — enough to resolve individual gyri.
  const base = mergeVertices(new THREE.IcosahedronGeometry(1, 44))
  const bp = base.attributes.position
  const count = bp.count

  const dirs = new Array(count)
  const shaped = new Float32Array(count * 3)
  const d = new THREE.Vector3()
  const out = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    d.fromBufferAttribute(bp, i).normalize()
    dirs[i] = d.clone()
    cerebrumPoint(d, out)
    shaped[i * 3] = out.x
    shaped[i * 3 + 1] = out.y
    shaped[i * 3 + 2] = out.z
  }

  // Smooth normals first, then fold the surface along them, then re-normal.
  const g = new THREE.BufferGeometry()
  g.setIndex(base.index)
  g.setAttribute('position', new THREE.BufferAttribute(shaped, 3))
  g.computeVertexNormals()

  const pos = g.attributes.position
  const nor = g.attributes.normal
  for (let i = 0; i < count; i++) {
    const px = pos.getX(i)
    const py = pos.getY(i)
    const pz = pos.getZ(i)
    // Fold the medial wall less, so gyri don't close the fissure up.
    const amt = gyri(px, py, pz) * (0.3 + 0.7 * ss(-0.42, -0.2, dirs[i].x))
    pos.setXYZ(i, px + nor.getX(i) * amt, py + nor.getY(i) * amt, pz + nor.getZ(i) * amt)
  }
  g.computeVertexNormals()

  const idx = base.index.array
  const P = g.attributes.position.array
  const N = g.attributes.normal.array
  const face = new Array(9)
  const fnor = new Array(9)
  const c = new THREE.Vector3()

  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f]
    const b2 = idx[f + 1]
    const c2 = idx[f + 2]

    c.copy(dirs[a]).add(dirs[b2]).add(dirs[c2]).normalize()
    const zone = classifyCortex(c.x, c.y, c.z)

    const ids = [a, b2, c2]
    for (let k = 0; k < 3; k++) {
      const i = ids[k]
      face[k * 3] = P[i * 3] + GAP
      face[k * 3 + 1] = P[i * 3 + 1]
      face[k * 3 + 2] = P[i * 3 + 2]
      fnor[k * 3] = N[i * 3]
      fnor[k * 3 + 1] = N[i * 3 + 1]
      fnor[k * 3 + 2] = N[i * 3 + 2]
    }

    b.tri(zone, face, fnor, false)
    b.tri(zone, face, fnor, true)

    // Only anchor notes on faces that can actually be seen from outside —
    // never on the medial wall buried in the longitudinal fissure.
    const nx = (fnor[0] + fnor[3] + fnor[6]) / 3
    if (nx > -0.2) {
      const cp = [
        (face[0] + face[3] + face[6]) / 3,
        (face[1] + face[4] + face[7]) / 3,
        (face[2] + face[5] + face[8]) / 3,
      ]
      const cn = [nx, (fnor[1] + fnor[4] + fnor[7]) / 3, (fnor[2] + fnor[5] + fnor[8]) / 3]
      b.sample(zone, cp, cn, false)
      b.sample(zone, cp, cn, true)
    }
  }

  base.dispose()
  g.dispose()
}

function buildCerebellum(b) {
  const base = mergeVertices(new THREE.IcosahedronGeometry(1, 34))
  const bp = base.attributes.position
  const count = bp.count
  const R = [0.46, 0.22, 0.28]
  const C = [0, -0.44, -0.54]

  const shaped = new Float32Array(count * 3)
  const d = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    d.fromBufferAttribute(bp, i).normalize()
    // Flatten the top where the tentorium and occipital lobes press down.
    const flat = 1 - 0.3 * ss(0.2, 1.0, d.y)
    shaped[i * 3] = d.x * R[0] + C[0]
    shaped[i * 3 + 1] = d.y * R[1] * flat + C[1]
    shaped[i * 3 + 2] = d.z * R[2] + C[2]
  }

  const g = new THREE.BufferGeometry()
  g.setIndex(base.index)
  g.setAttribute('position', new THREE.BufferAttribute(shaped, 3))
  g.computeVertexNormals()

  const pos = g.attributes.position
  const nor = g.attributes.normal
  for (let i = 0; i < count; i++) {
    const px = pos.getX(i)
    const py = pos.getY(i)
    const pz = pos.getZ(i)
    const amt = folia(px, py - C[1], pz - C[2])
    pos.setXYZ(i, px + nor.getX(i) * amt, py + nor.getY(i) * amt, pz + nor.getZ(i) * amt)
  }
  g.computeVertexNormals()

  b.addGeometry('cerebellum', g, null)
  base.dispose()
  g.dispose()
}

/** A tube of varying radius along a smooth curve. Used for stem and hippocampus. */
function tubeAlong(points, radii, tubular = 60, radial = 16, capEnds = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)))
  const frames = curve.computeFrenetFrames(tubular, false)
  const positions = []
  const indices = []
  const p = new THREE.Vector3()

  const radiusAt = (t) => {
    const x = t * (radii.length - 1)
    const i = Math.min(radii.length - 2, Math.floor(x))
    const f = x - i
    return radii[i] * (1 - f) + radii[i + 1] * f
  }

  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular
    curve.getPointAt(t, p)
    const r = radiusAt(t)
    const N = frames.normals[i]
    const B = frames.binormals[i]
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2
      const sin = Math.sin(a)
      const cos = -Math.cos(a)
      positions.push(p.x + r * (cos * N.x + sin * B.x), p.y + r * (cos * N.y + sin * B.y), p.z + r * (cos * N.z + sin * B.z))
    }
  }
  for (let i = 1; i <= tubular; i++) {
    for (let j = 1; j <= radial; j++) {
      const a = (radial + 1) * (i - 1) + (j - 1)
      const b = (radial + 1) * i + (j - 1)
      const c = (radial + 1) * i + j
      const d = (radial + 1) * (i - 1) + j
      indices.push(a, b, d, b, c, d)
    }
  }
  if (capEnds) {
    // Fan each open end shut so the tube doesn't read as hollow pipe.
    for (const end of [0, tubular]) {
      const centre = curve.getPointAt(end === 0 ? 0 : 1, new THREE.Vector3())
      const ci = positions.length / 3
      positions.push(centre.x, centre.y, centre.z)
      for (let j = 1; j <= radial; j++) {
        const a = (radial + 1) * end + (j - 1)
        const b = (radial + 1) * end + j
        if (end === 0) indices.push(ci, a, b)
        else indices.push(ci, b, a)
      }
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

function buildBrainstem(b) {
  const g = tubeAlong(
    [
      [0, -0.14, 0.0],
      [0, -0.32, -0.12],
      [0, -0.5, -0.22],
      [0, -0.74, -0.28],
      [0, -1.0, -0.3],
    ],
    [0.115, 0.16, 0.135, 0.1, 0.07],
    70,
    20,
    true,
  )
  b.addGeometry('brainstem', g, null)
  g.dispose()
}

function buildInsula(b) {
  const g = new THREE.SphereGeometry(1, 26, 20)
  // A flat lens plastered against the depth of the lateral fissure.
  const m = new THREE.Matrix4()
    .makeTranslation(GAP + 0.19, -0.12, 0.02)
    .multiply(new THREE.Matrix4().makeRotationX(-0.3))
    .multiply(new THREE.Matrix4().makeScale(0.04, 0.1, 0.15))
  b.addGeometry('insula', g, m, { mirror: false })
  b.addGeometry('insula', g, m, { mirror: true })
  g.dispose()
}

function buildLimbic(b) {
  // Hippocampus: a seahorse curl inside the medial temporal lobe.
  const hippo = tubeAlong(
    [
      [GAP + 0.15, -0.36, 0.18],
      [GAP + 0.17, -0.34, 0.04],
      [GAP + 0.15, -0.29, -0.1],
      [GAP + 0.1, -0.2, -0.2],
      [GAP + 0.04, -0.13, -0.26],
    ],
    [0.055, 0.05, 0.045, 0.035, 0.024],
    60,
    16,
    true,
  )
  // Amygdala: sits at the hippocampal head.
  const amyg = new THREE.SphereGeometry(1, 22, 16)
  const am = new THREE.Matrix4()
    .makeTranslation(GAP + 0.14, -0.37, 0.26)
    .multiply(new THREE.Matrix4().makeScale(0.065, 0.06, 0.065))

  for (const mirror of [false, true]) {
    b.addGeometry('limbic', hippo, null, { mirror })
    b.addGeometry('limbic', amyg, am, { mirror })
  }
  hippo.dispose()
  amyg.dispose()
}

let cached = null

/** Builds (once) every zone geometry plus the anchor points notes can pin to. */
export function buildBrain() {
  if (cached) return cached
  const b = new Builder()
  buildCerebrum(b)
  buildCerebellum(b)
  buildBrainstem(b)
  buildInsula(b)
  buildLimbic(b)
  cached = b.finish()
  return cached
}
