// The anatomical zones notes can be filed under.
// Cortical lobes are rendered on both hemispheres but treated as one category.
//
// Colours are OKLCH-stepped for the dark surface (#161b27): every one sits in
// the L 0.48–0.67 band, clears the 0.10 chroma floor and 3:1 contrast, and the
// set passes the adjacent-pair CVD and normal-vision gates. Eight categorical
// hues cannot clear those gates on *all* 28 pairs — nothing can — so identity is
// never carried by colour alone: zones are named on hover in 3D and every row in
// the stats panel and note list is directly labelled.

export const ZONES = [
  {
    id: 'frontal',
    name: 'Frontal Lobe',
    color: '#6b8ae4',
    blurb: 'Planning, decisions, working memory, movement, speech production.',
    detail:
      'Everything in front of the central sulcus: prefrontal cortex, premotor and primary motor cortex, and Broca’s area. Judgement, goal-setting, impulse control and voluntary movement.',
  },
  {
    id: 'parietal',
    name: 'Parietal Lobe',
    color: '#0aa796',
    blurb: 'Touch, spatial sense, where things are relative to you.',
    detail:
      'Behind the central sulcus. Somatosensory cortex plus association areas that build a map of the body and of space, integrate the senses, and handle attention and numbers.',
  },
  {
    id: 'temporal',
    name: 'Temporal Lobe',
    color: '#c0830a',
    blurb: 'Hearing, language comprehension, faces, long-term memory.',
    detail:
      'Below the lateral (Sylvian) fissure. Auditory cortex, Wernicke’s area, and the ventral stream for recognising objects and faces. Wraps the hippocampus.',
  },
  {
    id: 'occipital',
    name: 'Occipital Lobe',
    color: '#b556aa',
    blurb: 'Vision — edges, motion, colour, shape.',
    detail:
      'The posterior pole, behind the parieto-occipital sulcus. Primary visual cortex (V1) and the surrounding visual areas that assemble what you see.',
  },
  {
    id: 'insula',
    name: 'Insular Cortex',
    color: '#e2665e',
    blurb: 'Interoception, taste, disgust, the felt sense of emotion.',
    detail:
      'Folded deep inside the lateral fissure, hidden under the frontal, parietal and temporal opercula. Body-state awareness, risk, craving, empathy.',
    deep: true,
  },
  {
    id: 'limbic',
    name: 'Limbic System',
    color: '#9d79e1',
    blurb: 'Memory formation and emotional salience.',
    detail:
      'Hippocampus and amygdala, curled inside the medial temporal lobe. Encodes episodic memory and tags experience with emotional weight.',
    deep: true,
  },
  {
    id: 'cerebellum',
    name: 'Cerebellum',
    color: '#56a54e',
    blurb: 'Coordination, timing, balance, learned motor skill.',
    detail:
      'The tightly folded "little brain" tucked under the occipital lobes. Smooths and times movement, and contributes to language and attention.',
  },
  {
    id: 'brainstem',
    name: 'Brainstem',
    color: '#0585a9',
    blurb: 'Breathing, heart rate, arousal, sleep–wake.',
    detail:
      'Midbrain, pons and medulla. Carries every signal between brain and body and runs the systems you never think about.',
  },
]

export const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z]))
export const zoneName = (id) => ZONE_BY_ID[id]?.name ?? 'Unfiled'
export const zoneColor = (id) => ZONE_BY_ID[id]?.color ?? '#8b94a6'

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t)
export const ss = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

// Height of the lateral (Sylvian) fissure at a given anterior-posterior position.
// It runs upward as it travels back, which is why the temporal lobe is a wedge.
export const sylvianAt = (z) => -0.34 - 0.3 * z

/**
 * Which lobe a point on the cortical surface belongs to.
 * Takes a unit direction in the right-hemisphere frame: +x lateral, +y superior,
 * +z anterior. Boundaries approximate the central sulcus, the lateral fissure
 * and the parieto-occipital sulcus.
 */
export function classifyCortex(x, y, z) {
  const ax = Math.abs(x)

  // Parieto-occipital sulcus: highest and most anterior at the midline.
  if (z < -0.62 + 0.12 * y - 0.18 * ax) return 'occipital'

  // Below the lateral fissure everything is temporal, except the orbital
  // surface of the frontal lobe in front of the temporal pole.
  if (y < sylvianAt(z)) return z > 0.46 ? 'frontal' : 'temporal'

  // Central sulcus: starts just behind the vertex and runs obliquely forward
  // and down toward the lateral fissure.
  const centralSulcus = 0.1 - 0.18 * y + 0.26 * ax
  return z > centralSulcus ? 'frontal' : 'parietal'
}
