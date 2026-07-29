import { useMemo } from 'react'
import { ZONES } from '../brain/zones.js'
import { useStore } from '../store.js'

/**
 * How the notes are distributed across the brain. Ranked horizontal bars —
 * the form for "compare magnitudes across categories". Every row is directly
 * labelled with its zone, count and share, so colour only reinforces identity
 * rather than carrying it.
 */
export default function ZoneStats({ open = true, onToggle }) {
  const notes = useStore((s) => s.notes)
  const selectedZoneIds = useStore((s) => s.selectedZoneIds)
  const toggleZone = useStore((s) => s.toggleZone)
  const hoverZone = useStore((s) => s.hoverZone)

  const { rows, total, used } = useMemo(() => {
    const counts = {}
    for (const n of notes) counts[n.zoneId] = (counts[n.zoneId] ?? 0) + 1
    const total = notes.length
    const order = Object.fromEntries(ZONES.map((z, i) => [z.id, i]))
    const rows = ZONES.map((z) => ({
      zone: z,
      count: counts[z.id] ?? 0,
      pct: total ? (counts[z.id] ?? 0) / total : 0,
    })).sort((a, b) => b.count - a.count || order[a.zone.id] - order[b.zone.id])
    return { rows, total, used: rows.filter((r) => r.count > 0).length }
  }, [notes])

  // Bars are scaled against the busiest zone so small differences stay readable.
  const peak = rows[0]?.count || 1

  return (
    <section className={`stats${open ? '' : ' is-closed'}`} aria-label="Notes by brain zone">
      <button
        type="button"
        className="stats-head"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>
          <h2>Zone usage</h2>
          <em>
            {total} note{total === 1 ? '' : 's'} · {used}/{ZONES.length} zones
          </em>
        </span>
        <span className="stats-caret" aria-hidden>
          ▾
        </span>
      </button>

      {!open ? null : total === 0 ? (
        <p className="stats-empty">No notes yet — write one and it lands here.</p>
      ) : (
        <ol className="stats-rows">
          {rows.map(({ zone, count, pct }) => (
            <li key={zone.id}>
              <button
                className={`stats-row${selectedZoneIds.includes(zone.id) ? ' is-on' : ''}${count ? '' : ' is-zero'}`}
                style={{ '--zone': zone.color }}
                title={zone.blurb}
                onClick={() => toggleZone(zone.id)}
                onMouseEnter={() => hoverZone(zone.id)}
                onMouseLeave={() => hoverZone(null)}
              >
                <span className="stats-label">
                  <i />
                  {zone.name}
                </span>
                <span className="stats-value">
                  {count} <em>{Math.round(pct * 100)}%</em>
                </span>
                <span className="stats-track">
                  <span className="stats-fill" style={{ width: `${(count / peak) * 100}%` }} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
