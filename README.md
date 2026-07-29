# Yllen's Brain

A 3D brain you can file notes into. Write a note, tag it with a brain region, and
it appears as a pin on that region. Click the pin to read it — or click any row in
the note list and the camera flies to that spot on the brain.

```bash
npm install
npm run dev
```

## What it does

- **Orbit the brain.** Drag to rotate, scroll to zoom, right-drag to pan.
- **Eight anatomical zones**, each with a short description of what it actually
  does. Multi-zone filters are built in the panels — tick zones in the sidebar
  dropdown or click rows in the stats panel. Clicking a region on the brain
  always selects that one zone alone. No zones selected means all of them.
- **One pin at a time.** Each note has a fixed anchor point on its zone's surface,
  derived from the note's id, so it never drifts between sessions — but the pin
  and its label only appear while that note is selected. The cortex stays
  readable instead of disappearing under a field of markers.
- **Locate works both ways.** Click a note in the list and the camera flies to its
  pin and highlights the region; the pin itself is clickable to re-centre on it.
- **X-ray** fades the cortex so the insula, hippocampus and amygdala underneath
  become visible and clickable. Locating a note in a deep zone turns it on
  automatically.
- **Explode** slider pulls the zones apart to see how they fit together.
- **Zone usage stats**, on the right below the toolbar: notes per zone as a count
  and a share of the total, ranked, with unused zones dimmed. Hovering a row
  highlights that region on the brain; clicking it filters the note list.
- Starts empty — the brain fills in as you write. Notes are stored in
  `localStorage` under `yllens-brain.notes.v1`.

## Layout at other sizes

Wide screens get the sidebar beside the brain. Below 1180px the sidebar narrows;
below 900px the two stack, brain on top, each half scrolling on its own so the
canvas always has a fixed box to size against. In that stacked layout both the
notes panel and the stats panel start collapsed — each folds down to a single
header bar you tap to open — so the brain gets the whole screen first, and the
toolbar centres itself. On phones the gutters tighten and the stats bars go back
to one column. Landscape phones are the exception — there
is no vertical room to stack, so the side-by-side layout returns with a narrow
sidebar. Tap targets grow on coarse pointers, and pinch-zoom is left enabled for
the interface (the canvas opts out via `touch-action`, so orbiting still works).

## Colour

The eight zone colours are OKLCH-stepped for the dark surface: each sits inside
the L 0.48–0.67 band, clears the 0.10 chroma floor and 3:1 contrast, and the set
passes the adjacent-pair CVD and normal-vision separation gates (worst adjacent
ΔE 13.3 under deuteranopia, 15.6 under normal vision).

Eight categorical hues cannot clear those gates across all 28 pairs — no set of
eight can — so colour is never the only thing carrying identity. Zones are named
on hover in 3D, and every row in both the stats panel and the note list is
directly labelled. The weakest remaining pair (frontal blue vs limbic violet)
belongs to two regions that never touch on the brain.

## The zones

| Zone | Boundary used |
| --- | --- |
| Frontal lobe | Anterior to the central sulcus, plus the orbital surface |
| Parietal lobe | Between the central sulcus and the parieto-occipital sulcus |
| Temporal lobe | Below the lateral (Sylvian) fissure |
| Occipital lobe | Posterior to the parieto-occipital sulcus |
| Insular cortex | Deep to the lateral fissure |
| Limbic system | Hippocampus and amygdala, in the medial temporal lobe |
| Cerebellum | Below the occipital lobes |
| Brainstem | Midbrain, pons, medulla |

## How the brain is built

There is no downloaded model — the mesh is generated at runtime in
`src/brain/geometry.js`, which keeps the app fully self-contained and lets every
zone be a separate, individually clickable piece of one continuous surface.

Each hemisphere starts as a subdivided icosphere. Every vertex direction is run
through a shaping function that gives it the proportions of a cerebrum: narrowing
toward both poles, a flat medial wall (a soft clamp, so the two hemispheres meet
across a narrow longitudinal fissure rather than a wide V you can see through), a
lifted underside where the skull base is flat, and a temporal lobe hanging below
the lateral fissure. Gyri come from domain-warped ridged noise displaced along the
surface normal, biased so sulci are narrow clefts between broad crowns.

Zones are assigned **per triangle**, by testing the face's original direction on
the base sphere against planes standing in for the real sulcal landmarks — see
`classifyCortex` in `src/brain/zones.js`. The triangles are then split into one
geometry per zone, so the lobes share a seam but are separate meshes.

The cerebellum is built the same way with much finer, near-horizontal folia and a
midline vermis groove. The brainstem and hippocampus are swept tubes of varying
radius; the insula and amygdala are scaled spheres.

Note anchor points are sampled from the finished per-zone triangles, skipping any
face pointing into the longitudinal fissure so a pin never lands somewhere you
cannot see it.

## Layout

```
src/
  brain/
    geometry.js   builds every zone mesh + the anchor points notes pin to
    zones.js      zone definitions, colours, and the sulcal boundary tests
    noise.js      deterministic value noise (gyri and folia)
  components/
    BrainScene.jsx  canvas, lighting, zone meshes, pins, camera rig
    Panel.jsx       search, zone filter, note list, detail, editor
  anchors.js      maps note ids to stable points on the surface
  store.js        zustand store, persisted to localStorage
```
