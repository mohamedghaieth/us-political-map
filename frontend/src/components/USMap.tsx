import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { select } from 'd3-selection'
import 'd3-transition'
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom'
import { VIEW_H, VIEW_W, type Shape } from '../geo'

export interface MapItem {
  fill: string
  /** pattern overlay id, e.g. 'hatch-open' */
  overlay?: string | null
  stroke?: string
  strokeWidth?: number
  dash?: string
  dim?: boolean
  aria: string
  focusable?: boolean
}

interface Props {
  shapes: Shape[]
  items: Map<string, MapItem>
  /** state outlines drawn above district shapes (House mode) */
  outlines?: Shape[]
  selectedId?: string | null
  onSelect: (id: string) => void
  tooltip: (id: string) => ReactNode
  /** state abbreviation to zoom to; null resets */
  focus?: string | null
  focusShapes?: Shape[]
  overlay?: (k: number) => ReactNode
  hint?: string
}

const SPLIT_GROUPS = ['D', 'R', 'I', 'U'] as const
const C = { D: '#1f5fbf', R: '#c8202f', I: '#6b7280', U: '#cfd4dc' }

export function MapDefs() {
  const pairs: [string, string][] = []
  for (let i = 0; i < SPLIT_GROUPS.length; i++) for (let j = i + 1; j < SPLIT_GROUPS.length; j++) pairs.push([SPLIT_GROUPS[i], SPLIT_GROUPS[j]])
  return (
    <defs>
      <pattern id="p-I" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="#6b7280" />
        <rect width="3" height="8" fill="#9aa1ad" />
      </pattern>
      <pattern id="p-O" width="7" height="7" patternUnits="userSpaceOnUse">
        <rect width="7" height="7" fill="#6b7280" />
        <circle cx="3.5" cy="3.5" r="1.6" fill="#c7ccd5" />
      </pattern>
      <pattern id="hatch-open" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="7" height="7" fill="transparent" />
        <rect width="2.2" height="7" fill="rgba(255,255,255,.85)" />
      </pattern>
      <pattern id="dots-vacant" width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill="#e5e7eb" />
        <circle cx="3" cy="3" r="1.2" fill="#6b7280" />
      </pattern>
      {pairs.map(([a, b]) => (
        <pattern key={a + b} id={`split-${a}${b}`} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="14" fill={C[a as keyof typeof C]} />
          <rect x="7" width="7" height="14" fill={C[b as keyof typeof C]} />
        </pattern>
      ))}
    </defs>
  )
}

const Shapes = memo(function Shapes({
  shapes,
  items,
  selectedId,
  onSelect,
  onHover,
}: {
  shapes: Shape[]
  items: Map<string, MapItem>
  selectedId?: string | null
  onSelect: (id: string) => void
  onHover: (id: string | null, e?: { x: number; y: number }) => void
}) {
  return (
    <>
      {shapes.map((s) => {
        const it = items.get(s.id)
        if (!it) return null
        const sel = selectedId === s.id
        return (
          <g key={s.id} opacity={it.dim ? 0.22 : 1}>
            <path
              d={s.d}
              fill={it.fill}
              stroke={sel ? '#111827' : it.stroke ?? '#ffffff'}
              strokeWidth={sel ? 2.4 : it.strokeWidth ?? 0.6}
              strokeDasharray={sel ? undefined : it.dash}
              vectorEffect="non-scaling-stroke"
              className="shape"
              role="button"
              tabIndex={it.focusable === false ? -1 : 0}
              aria-label={it.aria}
              aria-pressed={sel}
              onClick={() => onSelect(s.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(s.id)
                }
              }}
              onMouseMove={(e) => onHover(s.id, { x: e.clientX, y: e.clientY })}
              onMouseLeave={() => onHover(null)}
              onFocus={(e) => {
                const r = (e.target as SVGPathElement).getBoundingClientRect()
                onHover(s.id, { x: r.left + r.width / 2, y: r.top + r.height / 2 })
              }}
              onBlur={() => onHover(null)}
            />
            {it.overlay && <path d={s.d} fill={`url(#${it.overlay})`} pointerEvents="none" stroke="none" />}
          </g>
        )
      })}
    </>
  )
})

export default function USMap({ shapes, items, outlines, selectedId, onSelect, tooltip, focus, focusShapes, overlay, hint }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<SVGGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const [k, setK] = useState(1)
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null)
  const raf = useRef(0)

  useLayoutEffect(() => {
    const svg = select(svgRef.current!)
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 14])
      .translateExtent([[-40, -20], [VIEW_W + 40, VIEW_H + 20]])
      .extent([[0, 0], [VIEW_W, VIEW_H]])
      .on('zoom', (ev) => {
        gRef.current?.setAttribute('transform', ev.transform.toString())
        cancelAnimationFrame(raf.current)
        raf.current = requestAnimationFrame(() => setK(ev.transform.k))
      })
    svg.call(z).on('dblclick.zoom', null)
    zoomRef.current = z
    return () => {
      svg.on('.zoom', null)
    }
  }, [])

  const zoomBy = useCallback((f: number) => {
    if (svgRef.current && zoomRef.current) select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy, f)
  }, [])
  const reset = useCallback(() => {
    if (svgRef.current && zoomRef.current) select(svgRef.current).transition().duration(350).call(zoomRef.current.transform, zoomIdentity)
  }, [])

  const focusShape = useMemo(() => (focus ? (focusShapes ?? []).find((s) => s.id === focus) : undefined), [focus, focusShapes])
  useEffect(() => {
    if (!svgRef.current || !zoomRef.current) return
    if (!focusShape) {
      reset()
      return
    }
    const [[x0, y0], [x1, y1]] = focusShape.bounds
    const scale = Math.min(8, 0.82 / Math.max((x1 - x0) / VIEW_W, (y1 - y0) / VIEW_H))
    const t = zoomIdentity.translate(VIEW_W / 2 - (scale * (x0 + x1)) / 2, VIEW_H / 2 - (scale * (y0 + y1)) / 2).scale(scale)
    select(svgRef.current).transition().duration(500).call(zoomRef.current.transform, t)
  }, [focusShape, reset])

  const onHover = useCallback((id: string | null, pos?: { x: number; y: number }) => {
    if (!id || !pos) return setTip(null)
    setTip({ id, x: pos.x, y: pos.y })
  }, [])

  const wrapRect = wrapRef.current?.getBoundingClientRect()
  let tipStyle: React.CSSProperties | undefined
  if (tip && wrapRect) {
    const left = Math.min(Math.max(tip.x - wrapRect.left + 14, 8), Math.max(wrapRect.width - 250, 8))
    const top = Math.min(Math.max(tip.y - wrapRect.top + 14, 8), Math.max(wrapRect.height - 110, 8))
    tipStyle = { left, top }
  }

  return (
    <div className="map-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="map-svg"
        role="group"
        aria-label={hint ?? 'الخريطة السياسية التفاعلية'}
        preserveAspectRatio="xMidYMid meet"
      >
        <MapDefs />
        <g ref={gRef}>
          <Shapes shapes={shapes} items={items} selectedId={selectedId} onSelect={onSelect} onHover={onHover} />
          {outlines?.map((s) => (
            <path key={'o' + s.id} d={s.d} fill="none" stroke="#1f2937" strokeWidth={1.1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          ))}
          {overlay?.(k)}
        </g>
      </svg>
      <div className="map-controls" role="group" aria-label="التحكم في التكبير">
        <button type="button" onClick={() => zoomBy(1.6)} aria-label="تكبير">+</button>
        <button type="button" onClick={() => zoomBy(1 / 1.6)} aria-label="تصغير">−</button>
        <button type="button" onClick={reset} aria-label="إعادة ضبط العرض">⟲</button>
      </div>
      {tip && tipStyle && (
        <div className="map-tip" style={tipStyle} role="tooltip">
          {tooltip(tip.id)}
        </div>
      )}
    </div>
  )
}
