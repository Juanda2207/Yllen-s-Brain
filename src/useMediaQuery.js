import { useEffect, useState } from 'react'

/** The breakpoint where the layout stacks and the overlays start to crowd. */
export const NARROW = '(max-width: 900px)'

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange() // the query may already have flipped before this ran
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return matches
}
