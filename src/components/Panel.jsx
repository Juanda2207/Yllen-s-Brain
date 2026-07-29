import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { ZONES, ZONE_BY_ID } from '../brain/zones.js'
import { selectVisibleNotes, useStore } from '../store.js'

const fmt = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** "Frontal Lobe", "Frontal Lobe and Insular Cortex", "3 zones", or "" for none. */
const zoneNames = (ids) => {
  const names = ids.map((id) => ZONE_BY_ID[id]?.name).filter(Boolean)
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.length} zones`
}

const snippet = (text, n = 110) => {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

/* -------------------------------------------------------------- zone filter */

/**
 * A native <select multiple> needs ctrl-click and can't show a colour swatch,
 * so this is a dropdown of checkboxes wearing the select's shape.
 */
function ZoneFilter() {
  const notes = useStore((s) => s.notes)
  const selectedZoneIds = useStore((s) => s.selectedZoneIds)
  const toggleZone = useStore((s) => s.toggleZone)
  const selectZone = useStore((s) => s.selectZone)
  const [open, setOpen] = useState(false)
  const box = useRef(null)

  const counts = useMemo(() => {
    const c = {}
    for (const n of notes) c[n.zoneId] = (c[n.zoneId] ?? 0) + 1
    return c
  }, [notes])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (!box.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      // Escape closes the menu and stops there — it must not also fall through
      // to the app-level handler that clears the whole selection.
      e.stopPropagation()
      setOpen(false)
    }
    // Capture, so a click that lands on the 3D canvas closes this first.
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const picked = selectedZoneIds.map((id) => ZONE_BY_ID[id]).filter(Boolean)
  const shown = notes.filter((n) => (selectedZoneIds.length ? selectedZoneIds.includes(n.zoneId) : true)).length
  const summary =
    picked.length === 0 ? 'All zones' : picked.length === 1 ? picked[0].name : `${picked.length} zones`

  return (
    <div className="zone-filter" ref={box} style={{ '--zone': picked[0]?.color ?? 'var(--accent)' }}>
      <div className="zone-filter-control">
        <button
          type="button"
          className={`zone-filter-btn${open ? ' is-open' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="zone-dots">
            {picked.length ? (
              picked.slice(0, 4).map((z) => <i key={z.id} style={{ background: z.color }} />)
            ) : (
              <i />
            )}
          </span>
          <span className="zone-filter-text">{summary}</span>
          <span className="zone-filter-count">{shown}</span>
        </button>

        {open && (
          <ul className="zone-menu" role="listbox" aria-multiselectable="true" aria-label="Filter notes by brain zone">
            <li>
              <button
                type="button"
                role="option"
                aria-selected={picked.length === 0}
                className={`zone-opt zone-opt-all${picked.length ? '' : ' is-on'}`}
                onClick={() => selectZone(null)}
              >
                <span className="zone-check" aria-hidden />
                All zones
                <span className="zone-opt-count">{notes.length}</span>
              </button>
            </li>
            {ZONES.map((z) => {
              const on = selectedZoneIds.includes(z.id)
              return (
                <li key={z.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={`zone-opt${on ? ' is-on' : ''}`}
                    style={{ '--zone': z.color }}
                    title={z.blurb}
                    onClick={() => toggleZone(z.id)}
                  >
                    <span className="zone-check" aria-hidden />
                    <i />
                    {z.name}
                    <span className="zone-opt-count">{counts[z.id] ?? 0}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- note list */

function NoteRow({ note }) {
  const selectedNoteId = useStore((s) => s.selectedNoteId)
  const locateNote = useStore((s) => s.locateNote)
  const zone = ZONE_BY_ID[note.zoneId]

  return (
    <button
      className={`row${selectedNoteId === note.id ? ' is-on' : ''}`}
      style={{ '--zone': zone?.color }}
      onClick={() => locateNote(note.id)}
    >
      <span className="row-bar" />
      <span className="row-body">
        <span className="row-title">{note.title}</span>
        <span className="row-snip">{snippet(note.body)}</span>
        <span className="row-meta">
          <i />
          {zone?.name ?? 'Unfiled'} · {fmt(note.updatedAt)}
        </span>
      </span>
      <span className="row-go" aria-hidden>
        ◎
      </span>
    </button>
  )
}

function NoteList() {
  // The selector builds a fresh array, so it needs shallow comparison or
  // useSyncExternalStore sees a new snapshot on every render.
  const notes = useStore(useShallow(selectVisibleNotes))
  const selectedZoneIds = useStore((s) => s.selectedZoneIds)
  const search = useStore((s) => s.search)
  const newDraft = useStore((s) => s.newDraft)

  if (notes.length === 0) {
    const where = zoneNames(selectedZoneIds)
    return (
      <div className="empty">
        <p>
          {search
            ? `Nothing matches “${search}”.`
            : where
              ? `No notes filed under ${where} yet.`
              : 'No notes yet.'}
        </p>
        <button className="btn btn-primary" onClick={() => newDraft(selectedZoneIds[0])}>
          Write one
        </button>
      </div>
    )
  }

  return (
    <div className="list">
      {notes.map((n) => (
        <NoteRow key={n.id} note={n} />
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- zone card */

/** Only meaningful for one zone — with several filtered, there is no single card to show. */
function ZoneCard() {
  const selectedZoneIds = useStore((s) => s.selectedZoneIds)
  const newDraft = useStore((s) => s.newDraft)
  const selectZone = useStore((s) => s.selectZone)
  const zone = selectedZoneIds.length === 1 ? ZONE_BY_ID[selectedZoneIds[0]] : null
  if (!zone) return null

  return (
    <section className="card zone-card" style={{ '--zone': zone.color }}>
      <header>
        <h2>{zone.name}</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => selectZone(null)}>
          Clear
        </button>
      </header>
      <p className="detail">{zone.detail}</p>
      <div className="card-actions">
        <button className="btn btn-primary btn-sm" onClick={() => newDraft(zone.id)}>
          + Note in this zone
        </button>
        {zone.deep && <span className="hint-inline">Deep structure — turn on X-ray to see it</span>}
      </div>
    </section>
  )
}

/* -------------------------------------------------------------- note detail */

function NoteDetail() {
  const id = useStore((s) => s.selectedNoteId)
  const note = useStore((s) => s.notes.find((n) => n.id === id))
  const locateNote = useStore((s) => s.locateNote)
  const editNote = useStore((s) => s.editNote)
  const deleteNote = useStore((s) => s.deleteNote)
  const clearSelection = useStore((s) => s.clearSelection)
  if (!note) return null
  const zone = ZONE_BY_ID[note.zoneId]

  return (
    <section className="card note-card" style={{ '--zone': zone?.color }}>
      <button className="back" onClick={clearSelection}>
        ← All notes
      </button>
      <span className="zone-tag">
        <i />
        {zone?.name}
      </span>
      <h2>{note.title}</h2>
      <p className="stamp">Updated {fmt(note.updatedAt)}</p>
      <div className="body">{note.body || <em className="muted">No text yet.</em>}</div>
      <div className="card-actions">
        <button className="btn btn-primary btn-sm" onClick={() => locateNote(note.id)}>
          ◎ Locate in brain
        </button>
        <button className="btn btn-sm" onClick={() => editNote(note.id)}>
          Edit
        </button>
        <button
          className="btn btn-danger btn-sm"
          onClick={() => {
            if (confirm(`Delete “${note.title}”?`)) deleteNote(note.id)
          }}
        >
          Delete
        </button>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------- note editor */

function NoteEditor() {
  const draft = useStore((s) => s.draft)
  const updateDraft = useStore((s) => s.updateDraft)
  const saveDraft = useStore((s) => s.saveDraft)
  const cancelDraft = useStore((s) => s.cancelDraft)
  const titleRef = useRef(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  if (!draft) return null
  const zone = ZONE_BY_ID[draft.zoneId]

  return (
    <section className="card editor" style={{ '--zone': zone?.color }}>
      <h2>{draft.id ? 'Edit note' : 'New note'}</h2>

      <label className="field">
        <span>Title</span>
        <input
          ref={titleRef}
          value={draft.title}
          placeholder="What do you want to remember?"
          onChange={(e) => updateDraft({ title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveDraft()
          }}
        />
      </label>

      <label className="field">
        <span>Brain zone</span>
        <select value={draft.zoneId} onChange={(e) => updateDraft({ zoneId: e.target.value })}>
          {ZONES.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
      </label>
      <p className="zone-blurb">
        <i style={{ background: zone?.color }} />
        {zone?.blurb}
      </p>

      <label className="field field-grow">
        <span>Note</span>
        <textarea
          value={draft.body}
          placeholder="Write it out…"
          onChange={(e) => updateDraft({ body: e.target.value })}
        />
      </label>

      <div className="card-actions">
        <button className="btn btn-primary btn-sm" onClick={saveDraft}>
          Save note
        </button>
        <button className="btn btn-ghost btn-sm" onClick={cancelDraft}>
          Cancel
        </button>
      </div>
    </section>
  )
}

/* --------------------------------------------------------------------- panel */

export default function Panel({ collapsible = false, collapsed = false, onToggle }) {
  const draft = useStore((s) => s.draft)
  const selectedNoteId = useStore((s) => s.selectedNoteId)
  const selectedZoneIds = useStore((s) => s.selectedZoneIds)
  const search = useStore((s) => s.search)
  const setSearch = useStore((s) => s.setSearch)
  const newDraft = useStore((s) => s.newDraft)
  const notes = useStore((s) => s.notes)

  return (
    <aside className={`panel${collapsed ? ' is-collapsed' : ''}`}>
      <header className="brand">
        <div>
          <h1>Yllen&rsquo;s Brain</h1>
          <p>
            {notes.length === 0
              ? 'Nothing filed yet — 8 regions waiting'
              : `${notes.length} note${notes.length === 1 ? '' : 's'} filed across 8 regions`}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => newDraft(selectedZoneIds[0])}>
          + New
        </button>
        {collapsible && (
          <button
            type="button"
            className="panel-toggle"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Show notes' : 'Hide notes'}
            onClick={onToggle}
          >
            ▾
          </button>
        )}
      </header>

      {/* `display: contents` normally, so collapsing is one `display: none`
          rather than three, and the panel's own layout is untouched. */}
      <div className="panel-body">
        <div className="search">
          <input value={search} placeholder="Search notes…" onChange={(e) => setSearch(e.target.value)} />
          {search && (
            <button className="clear" onClick={() => setSearch('')} aria-label="Clear search">
              ×
            </button>
          )}
        </div>

        <ZoneFilter />

        <div className="scroll">
          {draft ? (
            <NoteEditor />
          ) : selectedNoteId ? (
            <NoteDetail />
          ) : (
            <>
              <ZoneCard />
              <NoteList />
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
