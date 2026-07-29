import { useEffect, useState } from 'react'
import BrainScene from './components/BrainScene.jsx'
import Panel from './components/Panel.jsx'
import ZoneStats from './components/ZoneStats.jsx'
import { useStore } from './store.js'
import { NARROW, useMediaQuery } from './useMediaQuery.js'

function Toolbar() {
  const xray = useStore((s) => s.xray)
  const autoRotate = useStore((s) => s.autoRotate)
  const explode = useStore((s) => s.explode)
  const toggleXray = useStore((s) => s.toggleXray)
  const toggleAutoRotate = useStore((s) => s.toggleAutoRotate)
  const setExplode = useStore((s) => s.setExplode)
  const resetView = useStore((s) => s.resetView)

  return (
    <div className="toolbar">
      <button className="tool" onClick={resetView} title="Recentre the camera">
        ⟲ Reset
      </button>
      <button className={`tool${xray ? ' is-on' : ''}`} onClick={toggleXray} title="See the deep structures">
        ◍ X-ray
      </button>
      <button className={`tool${autoRotate ? ' is-on' : ''}`} onClick={toggleAutoRotate} title="Spin the brain">
        ↻ Spin
      </button>
      <label className="tool tool-slider" title="Pull the zones apart">
        ⊞
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={explode}
          onChange={(e) => setExplode(Number(e.target.value))}
        />
      </label>
    </div>
  )
}

export default function App() {
  const clearSelection = useStore((s) => s.clearSelection)
  const cancelDraft = useStore((s) => s.cancelDraft)

  // Stacked layouts give the brain the whole screen to start with. There is only
  // room for one sheet over it, so the notes panel and the stats take turns —
  // opening either closes the other, and both start closed.
  const narrow = useMediaQuery(NARROW)
  const [sheet, setSheet] = useState(null) // 'notes' | 'stats' | null
  useEffect(() => setSheet(null), [narrow])
  const open = (which) => setSheet((s) => (s === which ? null : which))

  // Wide screens fit both at once, so there the stats header is just its own
  // collapse — nothing to take turns with.
  const [wideStatsOpen, setWideStatsOpen] = useState(true)

  const panelCollapsed = narrow && sheet !== 'notes'
  const statsOpen = narrow ? sheet === 'stats' : wideStatsOpen
  const toggleStats = () => (narrow ? open('stats') : setWideStatsOpen((v) => !v))

  // Sculpting the cortex takes ~half a second and blocks the main thread, so
  // let the panel paint first and show what's happening.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setTimeout(() => setReady(true), 0))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (useStore.getState().draft) cancelDraft()
      else clearSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearSelection, cancelDraft])

  return (
    <div className={`app${panelCollapsed ? ' panel-collapsed' : ''}`}>
      <Panel
        collapsible={narrow}
        collapsed={panelCollapsed}
        onToggle={() => open('notes')}
        // Writing a note has to show the form, whatever was folded away.
        onNewNote={() => setSheet('notes')}
      />
      <main className="stage">
        {ready ? (
          <>
            <BrainScene />
            <Toolbar />
            <ZoneStats open={statsOpen} onToggle={toggleStats} />
            <p className="hint">Drag to rotate · scroll to zoom · right-drag to pan · click a region or a pin</p>
          </>
        ) : (
          <div className="booting">
            <span className="pulse" />
            <p>Sculpting cortex…</p>
          </div>
        )}
      </main>
    </div>
  )
}
