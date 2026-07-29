// Every note gets a fixed spot on its zone's surface, derived from its id so it
// never moves between sessions, with probing so two notes don't stack up.

import { buildBrain } from './brain/geometry.js'

function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

let cache = { notes: null, anchors: {} }

/**
 * Anchors for the current note list, memoised on the array identity. Callers
 * outside the 3D scene use this so they never trigger the brain build during a
 * render — by the time anyone clicks "locate", the geometry is already cached.
 */
export function anchorsFor(notes) {
  if (cache.notes !== notes) cache = { notes, anchors: computeAnchors(notes, buildBrain().samples) }
  return cache.anchors
}

export function computeAnchors(notes, samples) {
  const anchors = {}
  const usedByZone = {}

  const ordered = [...notes].sort((a, b) => (a.id < b.id ? -1 : 1))
  for (const note of ordered) {
    const pool = samples[note.zoneId]
    if (!pool || pool.length === 0) continue
    const used = (usedByZone[note.zoneId] ||= new Set())

    let i = hashString(note.id) % pool.length
    // Probe by a large stride so a collision lands somewhere visibly different.
    const stride = 1 + Math.floor(pool.length / 7)
    for (let k = 0; k < pool.length && used.has(i); k++) i = (i + stride) % pool.length
    used.add(i)
    anchors[note.id] = pool[i]
  }
  return anchors
}
