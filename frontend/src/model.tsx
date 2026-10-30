import type { ReactNode } from 'react'
import type { MapItem } from './components/USMap'
import type { MapGeo, Shape } from './geo'
import { GROUP_SHORT, GROUP_SYMBOL, INCUMBENT_STATUS_AR, districtLabel, groupOf, personName } from './labels'
import { outcome, type Bloc, type Level, type Overrides, type Seat } from './scenario'
import type { Filters, GovernorRow, Group, HouseRow119, HouseRow120, Meta, SenateRow } from './types'

export const C = { D: '#1f5fbf', R: '#c8202f', I: 'url(#p-I)', O: 'url(#p-O)', U: '#cfd4dc' } as const
export const fillOf = (g: Group) => C[g]
const SPLIT_ORDER: Group[] = ['D', 'R', 'I', 'U']

/** Fill for a state holding two seats (Senate): solid when equal, striped when split. */
export function pairFill(a: Group, b: Group): string {
  const na = a === 'O' ? 'I' : a
  const nb = b === 'O' ? 'I' : b
  if (na === nb) return fillOf(na)
  const [x, y] = [na, nb].sort((p, q) => SPLIT_ORDER.indexOf(p) - SPLIT_ORDER.indexOf(q))
  return `url(#split-${x}${y})`
}

export interface SeatInfo {
  party: Group
  parties?: Group[]
  up: boolean
  open: boolean
  competitive: boolean
  undetermined: boolean
  vacant: boolean
  year: number | null
}

export function matches(info: SeatInfo, f: Filters): boolean {
  if (f.party !== 'all') {
    const gs = info.parties ?? [info.party]
    const ok = gs.some((g) => (f.party === 'O' ? g === 'I' || g === 'O' || g === 'U' : g === f.party))
    if (!ok) return false
  }
  if (f.cycle !== 'all' && info.year !== f.cycle) return false
  switch (f.seat) {
    case 'up': return info.up
    case 'not_up': return !info.up
    case 'open': return info.open
    case 'competitive': return info.competitive
    case 'undetermined': return info.undetermined
    case 'vacant': return info.vacant
    default: return true
  }
}

export const filtersActive = (f: Filters) => f.party !== 'all' || f.seat !== 'all' || f.cycle !== 'all'

const OPEN_STATUSES = ['retiring', 'term_limited', 'lost_primary', 'withdrawn', 'ineligible', 'none']

export function govInfo(r: GovernorRow): SeatInfo {
  const e = r.election
  return { party: groupOf(r.holder.party), up: !!e, open: !!e?.is_open, competitive: !!e && e.competitive_by.length > 0, undetermined: !!e?.candidates_undetermined, vacant: r.holder.vacant, year: r.next_election_year }
}

export function senInfo(rows: SenateRow[]): SeatInfo {
  const es = rows.map((r) => r.election).filter(Boolean)
  return {
    party: groupOf(rows[0].holder.party),
    parties: rows.map((r) => groupOf(r.holder.party)),
    up: rows.some((r) => r.seat_status === 'up'),
    open: es.some((e) => e!.is_open),
    competitive: es.some((e) => e!.competitive_by.length > 0),
    undetermined: es.some((e) => e!.candidates_undetermined),
    vacant: rows.some((r) => r.seat_status === 'vacant'),
    year: rows.some((r) => r.next_election_year === 2026) ? 2026 : Math.min(...rows.map((r) => r.next_election_year ?? 9999)),
  }
}

export function house119Info(r: HouseRow119): SeatInfo {
  return {
    party: groupOf(r.holder.party),
    up: true,
    open: !!r.running_2026 && OPEN_STATUSES.includes(r.running_2026.incumbent_status),
    competitive: false,
    undetermined: false,
    vacant: r.holder.vacant,
    year: 2026,
  }
}

export function house120Info(r: HouseRow120): SeatInfo {
  const e = r.election
  return { party: groupOf(e?.defending_party), up: true, open: !!e?.is_open, competitive: !!e && e.competitive_by.length > 0, undetermined: !!e?.candidates_undetermined, vacant: false, year: 2026 }
}

export interface MapModel {
  shapes: Shape[]
  outlines?: Shape[]
  items: Map<string, MapItem>
  tooltip: (id: string) => ReactNode
  hint: string
  overlay?: (k: number, selectedId: string | null) => ReactNode
  focusShapes: Shape[]
  /** ids that pass the active filters */
  visibleCount: number
  totalCount: number
}

const AMBER = '#d97706'

function styleFor(info: SeatInfo, fill: string, aria: string, dim: boolean, extra: Partial<MapItem> = {}): MapItem {
  const it: MapItem = { fill, aria, dim, overlay: info.open ? 'hatch-open' : info.vacant ? 'dots-vacant' : null, ...extra }
  if (info.competitive) {
    it.stroke = AMBER
    it.strokeWidth = 1.8
    it.dash = '4 2'
  } else if (info.up && extra.strokeWidth === undefined) {
    it.stroke = '#ffffff'
  }
  return it
}

function Tip({ title, lines }: { title: string; lines: ReactNode[] }) {
  return (
    <>
      <strong>{title}</strong>
      {lines.filter(Boolean).map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </>
  )
}

const symbolOf = (g: Group) => `${GROUP_SYMBOL[g]} ${GROUP_SHORT[g]}`

/* ---------------- governors ---------------- */
export function governorsModel(rows: GovernorRow[], geo: MapGeo, f: Filters): MapModel {
  const by = new Map(rows.map((r) => [r.state.abbr, r]))
  const items = new Map<string, MapItem>()
  let vis = 0
  for (const s of geo.states) {
    const r = by.get(s.id)
    if (!r) continue
    const info = govInfo(r)
    const ok = matches(info, f)
    if (ok) vis++
    const g = info.party
    items.set(s.id, styleFor(info, fillOf(g), `${r.state.name_ar}: الحاكم ${personName(r.holder.person)}، ${GROUP_SHORT[g]}${info.up ? '، مطروح للانتخاب 2026' : ''}`, !ok && filtersActive(f), info.up ? { stroke: '#111827', strokeWidth: 1.6 } : {}))
    if (info.competitive) {
      const it = items.get(s.id)!
      it.stroke = AMBER
      it.strokeWidth = 2.2
      it.dash = '5 2'
    }
  }
  return {
    shapes: geo.states,
    items,
    hint: 'خريطة حكام الولايات الخمسين',
    focusShapes: geo.states,
    visibleCount: vis,
    totalCount: rows.length,
    tooltip: (id) => {
      const r = by.get(id)
      if (!r) return null
      const g = groupOf(r.holder.party)
      return <Tip title={`${r.state.name_ar} · ${r.state.abbr}`} lines={[`الحاكم: ${personName(r.holder.person)}`, symbolOf(g), r.election ? `انتخابات الحاكم: ${r.election.date}` : `الانتخابات القادمة: ${r.next_election_year}`]} />
    },
    overlay: (k) => (
      <g pointerEvents="none" className="labels">
        {geo.states.map((s) => {
          const r = by.get(s.id)
          if (!r) return null
          const g = groupOf(r.holder.party)
          return (
            <text key={s.id} x={s.cx} y={s.cy + 3} textAnchor="middle" fontSize={Math.max(5, 9 / Math.sqrt(k))} fill={g === 'U' ? '#111' : '#fff'} fontWeight={700}>
              {GROUP_SYMBOL[g]}
            </text>
          )
        })}
      </g>
    ),
  }
}

/* ---------------- senate ---------------- */
export function senateModel(rows: SenateRow[], geo: MapGeo, f: Filters, byStateOverride?: Map<string, { groups: Group[]; up: boolean[] }>): MapModel {
  const byState = new Map<string, SenateRow[]>()
  for (const r of rows) byState.set(r.state.abbr, [...(byState.get(r.state.abbr) ?? []), r])
  const items = new Map<string, MapItem>()
  let vis = 0
  for (const s of geo.states) {
    const rs = byState.get(s.id)
    if (!rs) continue
    const info = senInfo(rs)
    const ok = matches(info, f)
    if (ok) vis++
    const groups = byStateOverride?.get(s.id)?.groups ?? rs.map((r) => groupOf(r.holder.party))
    const fill = pairFill(groups[0], groups[1])
    items.set(s.id, styleFor(info, fill, `${rs[0].state.name_ar}: عضوا مجلس الشيوخ ${rs.map((r) => `${personName(r.holder.person)} (${GROUP_SHORT[groupOf(r.holder.party)]})`).join(' و ')}`, !ok && filtersActive(f), info.up ? { stroke: '#111827', strokeWidth: 1.6 } : {}))
    if (info.competitive) {
      const it = items.get(s.id)!
      it.stroke = AMBER
      it.strokeWidth = 2.2
      it.dash = '5 2'
    }
  }
  return {
    shapes: geo.states,
    items,
    hint: 'خريطة مجلس الشيوخ: مقعدان لكل ولاية',
    focusShapes: geo.states,
    visibleCount: vis,
    totalCount: byState.size,
    tooltip: (id) => {
      const rs = byState.get(id)
      if (!rs) return null
      return (
        <Tip
          title={`${rs[0].state.name_ar} · ${rs[0].state.abbr}`}
          lines={rs.map((r) => `${personName(r.holder.person)} — ${symbolOf(groupOf(r.holder.party))}${r.seat_status === 'up' ? ' — ▣ مطروح 2026' : ` — حتى ${r.holder.term_end?.slice(0, 4)}`}`)}
        />
      )
    },
    overlay: (k) => (
      <g pointerEvents="none">
        {geo.states.map((s) => {
          const rs = byState.get(s.id)
          if (!rs) return null
          const r = 6.5 / Math.sqrt(k)
          return rs.map((row, i) => {
            const g = byStateOverride?.get(s.id)?.groups[i] ?? groupOf(row.holder.party)
            const up = byStateOverride?.get(s.id)?.up[i] ?? row.seat_status === 'up'
            const cx = s.cx + (i === 0 ? -r * 1.15 : r * 1.15)
            return (
              <g key={s.id + i}>
                <circle cx={cx} cy={s.cy} r={r} fill={g === 'U' ? '#e5e7eb' : g === 'D' ? C.D : g === 'R' ? C.R : '#6b7280'} stroke={up ? '#111827' : '#ffffff'} strokeWidth={up ? 1.8 : 0.8} vectorEffect="non-scaling-stroke" />
                <text x={cx} y={s.cy + r * 0.38} textAnchor="middle" fontSize={r * 1.15} fill={g === 'U' ? '#111' : '#fff'} fontWeight={700}>
                  {GROUP_SYMBOL[g]}
                </text>
              </g>
            )
          })
        })}
      </g>
    ),
  }
}

/* ---------------- house ---------------- */
export function house119Model(rows: HouseRow119[], geo: MapGeo, f: Filters): MapModel {
  const by = new Map(rows.map((r) => [r.geoid, r]))
  const items = new Map<string, MapItem>()
  let vis = 0
  let total = 0
  const first = geo.districts[0]?.id
  for (const s of geo.districts) {
    const r = by.get(s.id)
    if (!r) continue
    const info = house119Info(r)
    const ok = matches(info, f)
    if (!r.delegate) {
      total++
      if (ok) vis++
    }
    items.set(s.id, styleFor(info, info.vacant ? '#e5e7eb' : fillOf(info.party), `${districtLabel(r.state.name_ar, r.district, r.at_large, r.delegate)}: ${r.holder.vacant ? 'شاغر' : `${personName(r.holder.person)}، ${GROUP_SHORT[info.party]}`}`, !ok && filtersActive(f), { focusable: s.id === first }))
  }
  return {
    shapes: geo.districts,
    outlines: geo.states,
    items,
    hint: 'خريطة دوائر مجلس النواب الحالية (الكونغرس 119)',
    focusShapes: geo.states,
    visibleCount: vis,
    totalCount: total,
    tooltip: (id) => {
      const r = by.get(id)
      if (!r) return null
      return <Tip title={districtLabel(r.state.name_ar, r.district, r.at_large, r.delegate)} lines={[r.holder.vacant ? '◌ مقعد شاغل' : `${personName(r.holder.person)}`, r.holder.vacant ? null : symbolOf(groupOf(r.holder.party))]} />
    },
  }
}

export function house120Model(rows: HouseRow120[], geo: MapGeo, f: Filters, seats?: { map: Map<string, Seat>; level: Level; forecaster: string; overrides: Overrides }): MapModel {
  const by = new Map(rows.map((r) => [r.geoid, r]))
  const items = new Map<string, MapItem>()
  let vis = 0
  let total = 0
  const first = geo.districts[0]?.id
  for (const s of geo.districts) {
    const r = by.get(s.id)
    if (!r) continue
    const info = house120Info(r)
    const ok = matches(info, f)
    if (!r.delegate) {
      total++
      if (ok) vis++
    }
    let g = info.party
    let aria = `${districtLabel(r.state.name_ar, r.district, r.at_large, r.delegate)}: الحزب المدافع ${GROUP_SHORT[g]}${info.open ? '، مقعد مفتوح' : ''}${info.competitive ? '، تنافسي' : ''}`
    let overlay: string | null | undefined
    if (seats) {
      const seat = seats.map.get(s.id)
      const b = seat ? outcome(seat, seats.level, seats.forecaster, seats.overrides) : null
      g = b ? (b as Group) : 'U'
      aria = `${districtLabel(r.state.name_ar, r.district, r.at_large, r.delegate)}: ${b ? GROUP_SHORT[g] : 'غير محسوم'} (${seats.level === 'sim' ? 'محاكاة افتراضية' : 'تقدير'})`
      overlay = b ? undefined : 'dots-vacant'
    }
    const it = styleFor(info, fillOf(g), aria, !ok && filtersActive(f), { focusable: s.id === first })
    if (seats) it.overlay = overlay ?? (info.open && seats.level !== 'sim' ? null : null)
    items.set(s.id, it)
  }
  return {
    shapes: geo.districts,
    outlines: geo.states,
    items,
    hint: 'خريطة دوائر مجلس النواب لانتخابات 2026',
    focusShapes: geo.states,
    visibleCount: vis,
    totalCount: total,
    tooltip: (id) => {
      const r = by.get(id)
      if (!r) return null
      const e = r.election
      const seat = seats?.map.get(id)
      const o = seats && seat ? outcome(seat, seats.level, seats.forecaster, seats.overrides) : null
      return (
        <Tip
          title={districtLabel(r.state.name_ar, r.district, r.at_large, r.delegate)}
          lines={[
            e?.incumbents.length ? `الشاغل: ${e.incumbents.map((i) => i.name).join('، ')}` : 'لا شاغل مرتبط (مقعد جديد/شاغر)',
            e ? `المدافع: ${symbolOf(groupOf(e.defending_party))}` : null,
            seats ? `النتيجة في هذا ${seats.level === 'sim' ? 'السيناريو الافتراضي' : 'التقدير'}: ${o ? symbolOf(o as Group) : 'غير محسوم'}` : null,
            e ? INCUMBENT_STATUS_AR[e.incumbent_status] : null,
            e?.is_open ? '◩ مقعد مفتوح' : null,
            e && e.competitive_by.length ? `◈ تنافسي وفق ${e.competitive_by.length} جهات` : null,
          ]}
        />
      )
    },
  }
}

/* ---------------- scenario maps for states (Senate / Governors) ---------------- */
export function scenarioStateModel(chamber: 'sen' | 'gov', rows: (SenateRow | GovernorRow)[], geo: MapGeo, seats: Seat[], level: Level, forecaster: string, overrides: Overrides, f: Filters): MapModel {
  const seatBy = new Map(seats.map((s) => [s.id, s]))
  const gOf = (id: string): Group => {
    const s = seatBy.get(id)
    const b = s ? outcome(s, level, forecaster, overrides) : null
    return b ? (b as Group) : 'U'
  }
  if (chamber === 'sen') {
    const sen = rows as SenateRow[]
    const override = new Map<string, { groups: Group[]; up: boolean[] }>()
    const by = new Map<string, SenateRow[]>()
    for (const r of sen) by.set(r.state.abbr, [...(by.get(r.state.abbr) ?? []), r])
    for (const [ab, rs] of by) override.set(ab, { groups: rs.map((r) => gOf(r.office_id)), up: rs.map((r) => r.seat_status === 'up') })
    const base = senateModel(sen, geo, f, override)
    return { ...base, hint: `سيناريو مجلس الشيوخ (${level === 'current' ? 'الوضع الحالي' : level === 'base' ? 'تقدير جهة خارجية' : 'محاكاة افتراضية'})` }
  }
  const gov = rows as GovernorRow[]
  const base = governorsModel(gov, geo, f)
  const items = new Map<string, MapItem>()
  for (const [id, it] of base.items) {
    const g = gOf(id)
    items.set(id, { ...it, fill: fillOf(g), overlay: g === 'U' ? 'dots-vacant' : null })
  }
  return {
    ...base,
    items,
    hint: `سيناريو حكام الولايات (${level === 'current' ? 'الوضع الحالي' : level === 'base' ? 'تقدير جهة خارجية' : 'محاكاة افتراضية'})`,
    overlay: (k) => (
      <g pointerEvents="none">
        {geo.states.map((s) => {
          const g = gOf(s.id)
          return (
            <text key={s.id} x={s.cx} y={s.cy + 3} textAnchor="middle" fontSize={Math.max(5, 9 / Math.sqrt(k))} fill={g === 'U' ? '#111' : '#fff'} fontWeight={700}>
              {GROUP_SYMBOL[g]}
            </text>
          )
        })}
      </g>
    ),
  }
}

export type { Bloc, Meta }
