// react-three-fiber fires onClick on pointer-up whether or not the pointer
// moved, so orbiting the camera from a mesh would register as a click on it.
// Track where each press started and let handlers ignore anything that was a drag.

let downX = 0
let downY = 0

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      downX = e.clientX
      downY = e.clientY
    },
    true, // capture, so this always runs before any handler that might act on it
  )
}

const DRAG_SLOP = 6 // px of travel still counted as a tap

export const wasDrag = (e) => Math.hypot(e.clientX - downX, e.clientY - downY) > DRAG_SLOP
