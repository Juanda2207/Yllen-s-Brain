import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ZONE_BY_ID } from './brain/zones.js'
import { anchorsFor } from './anchors.js'

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`

/** The default three-quarter view the app opens on, and returns to. */
const HOME_VIEW = { p: [0, 0, 0], n: [0.86, 0.2, 0.5], distance: 4.7 }
const homeFocus = () => ({ ...HOME_VIEW, stamp: Date.now() })

export const useStore = create(
  persist(
    (set, get) => ({
      notes: [],

      selectedNoteId: null,
      selectedZoneIds: [], // empty means "all zones"
      hoveredZoneId: null,
      draft: null, // { id?, title, body, zoneId }

      search: '',

      xray: false,
      explode: 0,
      autoRotate: false,

      // Bumped whenever the camera should fly somewhere. The rig watches `stamp`.
      focus: null, // { p:[x,y,z], n:[x,y,z], stamp, distance }

      /* ---- selection ---------------------------------------------------- */

      /** Filter down to exactly this zone (or clear, with null). */
      selectZone: (zoneId) => set((s) => withZones(s, zoneId ? [zoneId] : [])),

      /** Add or remove one zone from the filter — the multi-select path. */
      toggleZone: (zoneId) =>
        set((s) =>
          withZones(
            s,
            s.selectedZoneIds.includes(zoneId)
              ? s.selectedZoneIds.filter((id) => id !== zoneId)
              : [...s.selectedZoneIds, zoneId],
          ),
        ),

      hoverZone: (zoneId) => set({ hoveredZoneId: zoneId }),

      selectNote: (id) => {
        const note = get().notes.find((n) => n.id === id)
        set((s) => ({ selectedNoteId: id, selectedZoneIds: keepOrFocus(s, note?.zoneId), draft: null }))
      },

      /** Select a note and fly the camera to its marker. */
      locateNote: (id) => {
        const note = get().notes.find((n) => n.id === id)
        if (!note) return
        const anchor = anchorsFor(get().notes)[id]
        set((s) => ({
          selectedNoteId: id,
          selectedZoneIds: keepOrFocus(s, note.zoneId),
          draft: null,
          xray: ZONE_BY_ID[note.zoneId]?.deep ? true : get().xray,
          autoRotate: false,
          focus: anchor ? { p: anchor.p, n: anchor.n, distance: 2.1, stamp: Date.now() } : null,
        }))
      },

      focusPoint: (p, n, distance = 2.6) => set({ focus: { p, n, distance, stamp: Date.now() }, autoRotate: false }),
      clearFocus: () => set({ focus: null }),

      clearSelection: () => set({ selectedNoteId: null, selectedZoneIds: [], draft: null }),

      /* ---- notes -------------------------------------------------------- */

      newDraft: (zoneId) => set({ draft: { title: '', body: '', zoneId: zoneId ?? 'frontal' }, selectedNoteId: null }),
      editNote: (id) => {
        const note = get().notes.find((n) => n.id === id)
        if (note) set({ draft: { id: note.id, title: note.title, body: note.body, zoneId: note.zoneId } })
      },
      updateDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
      cancelDraft: () => set({ draft: null }),

      saveDraft: () => {
        const draft = get().draft
        if (!draft) return
        const title = draft.title.trim() || 'Untitled note'
        const now = new Date().toISOString()
        if (draft.id) {
          set((s) => ({
            notes: s.notes.map((n) =>
              n.id === draft.id ? { ...n, title, body: draft.body, zoneId: draft.zoneId, updatedAt: now } : n,
            ),
            draft: null,
            selectedNoteId: draft.id,
            selectedZoneIds: keepOrFocus(s, draft.zoneId),
          }))
        } else {
          const id = uid()
          set((s) => ({
            notes: [...s.notes, { id, title, body: draft.body, zoneId: draft.zoneId, createdAt: now, updatedAt: now }],
            draft: null,
            selectedNoteId: id,
            selectedZoneIds: keepOrFocus(s, draft.zoneId),
          }))
        }
      },

      deleteNote: (id) =>
        set((s) => ({
          notes: s.notes.filter((n) => n.id !== id),
          selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId,
          draft: s.draft?.id === id ? null : s.draft,
        })),

      /* ---- view --------------------------------------------------------- */

      setSearch: (search) => set({ search }),
      toggleXray: () => set((s) => ({ xray: !s.xray })),
      toggleAutoRotate: () => set((s) => ({ autoRotate: !s.autoRotate })),
      setExplode: (explode) => set({ explode }),
      resetView: () => set({ focus: homeFocus(), explode: 0 }),
    }),
    {
      // Renamed with the app — also drops the old seeded notes, so the brain
      // opens empty rather than restoring the samples from a previous visit.
      name: 'yllens-brain.notes.v1',
      partialize: (s) => ({ notes: s.notes }),
    },
  ),
)

function noteZone(state, id) {
  return state.notes.find((n) => n.id === id)?.zoneId
}

/** Apply a new zone filter, dropping the open note if it falls outside it. */
function withZones(state, zoneIds) {
  const kept =
    state.selectedNoteId && (zoneIds.length === 0 || zoneIds.includes(noteZone(state, state.selectedNoteId)))
      ? state.selectedNoteId
      : null
  const next = { selectedZoneIds: zoneIds, selectedNoteId: kept, draft: null }
  // Widening back out to every zone means there is no longer anything in
  // particular to look at, so pull the camera back to the opening view.
  if (zoneIds.length === 0 && state.selectedZoneIds.length > 0) next.focus = homeFocus()
  return next
}

/**
 * Opening a note shouldn't tear down a multi-zone filter you built on purpose —
 * so keep the filter when the note already fits it, and narrow to its zone only
 * when it doesn't.
 */
function keepOrFocus(state, zoneId) {
  if (!zoneId) return state.selectedZoneIds
  return state.selectedZoneIds.includes(zoneId) ? state.selectedZoneIds : [zoneId]
}

/**
 * The note list follows the active zones: whatever is selected in the brain,
 * in the zone filter, or by opening a note. No zones selected means all of them.
 */
export const selectVisibleNotes = (s) => {
  const q = s.search.trim().toLowerCase()
  const zones = s.selectedZoneIds
  return s.notes
    .filter((n) => (zones.length ? zones.includes(n.zoneId) : true))
    .filter((n) => (q ? `${n.title} ${n.body}`.toLowerCase().includes(q) : true))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}
