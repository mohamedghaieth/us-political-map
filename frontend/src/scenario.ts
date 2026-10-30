/**
 * Scenario arithmetic. Everything here is plain counting:
 *   - 'current'  : who holds each seat today (official data)
 *   - 'base'     : up seats follow ONE forecaster's qualitative rating; Toss-ups stay undecided;
 *                  seats not up (or unrated by that forecaster) stay with their current bloc
 *   - 'sim'      : the base case plus the user's hypothetical overrides
 * No probabilities are produced or invented.
 */
import type { GovernorRow, HouseRow120, HouseRow119, PartyCode, SenateRow } from './types'

export type Bloc = 'D' | 'R' | 'I'
export type Level = 'current' | 'base' | 'sim'
export type Overrides = Record<string, Bloc | 'U'> // 'U' = explicitly left undecided

export interface SeatRating {
  party: Bloc | null // null = Toss-up
  level: number // 4 safe/solid .. 0 toss-up
  label: string
  flip: boolean
}

export interface Seat {
  id: string
  label: string
  state: string
  up: boolean
  /** bloc holding (Senate/Governor) or defending (House 2026 map) the seat; null = vacant/unknown */
  current: Bloc | null
  ratings: Record<string, SeatRating>
}

export interface Tally {
  D: number
  R: number
  I: number
  undecided: number
  total: number
}

export function blocOf(party: PartyCode | null | undefined, caucus?: PartyCode | null): Bloc | null {
  if (!party || party === 'U') return null
  if (party === 'D' || party === 'R') return party
  if (party === 'I' && (caucus === 'D' || caucus === 'R')) return caucus // independents who caucus with a party
  return 'I'
}

function ratingBloc(p: PartyCode | null): Bloc | null {
  return p === 'D' || p === 'R' ? p : p ? 'I' : null
}

function forecastsToRatings(fs: { forecaster: string; party: PartyCode | null; level: number; label: string; flip: boolean }[]) {
  const out: Record<string, SeatRating> = {}
  for (const f of fs) out[f.forecaster] = { party: f.level === 0 ? null : ratingBloc(f.party), level: f.level, label: f.label, flip: f.flip }
  return out
}

export function senateSeats(rows: SenateRow[]): Seat[] {
  return rows.map((r) => ({
    id: r.office_id,
    label: `${r.state.name_ar} — فئة ${r.senate_class}${r.election?.kind === 'special' ? ' (انتخاب خاص)' : ''}`,
    state: r.state.abbr,
    up: r.seat_status === 'up',
    current: r.holder.vacant ? null : blocOf(r.holder.party, r.holder.meta?.caucus),
    ratings: r.election ? forecastsToRatings(r.election.forecasts) : {},
  }))
}

export function governorSeats(rows: GovernorRow[]): Seat[] {
  return rows.map((r) => ({
    id: r.state.abbr,
    label: r.state.name_ar,
    state: r.state.abbr,
    up: !!r.election,
    current: blocOf(r.holder.party),
    ratings: r.election ? forecastsToRatings(r.election.forecasts) : {},
  }))
}

/** 2026-map seats. `current` is the party defending the seat according to the source (null if new/merged). */
export function houseSeats(rows: HouseRow120[]): Seat[] {
  return rows
    .filter((r) => !r.delegate)
    .map((r) => ({
      id: r.geoid,
      label: r.at_large ? `${r.state.name_ar} — دائرة واحدة` : `${r.state.name_ar} — الدائرة ${r.district}`,
      state: r.state.abbr,
      up: true,
      current: blocOf(r.election?.defending_party ?? null),
      ratings: r.election ? forecastsToRatings(r.election.forecasts) : {},
    }))
}

/** Current (119th Congress) House composition, voting members only. */
export function houseCurrentTally(rows: HouseRow119[]): Tally {
  const t: Tally = { D: 0, R: 0, I: 0, undecided: 0, total: 0 }
  for (const r of rows) {
    if (r.delegate) continue
    t.total++
    const b = r.holder.vacant ? null : blocOf(r.holder.party, r.holder.meta?.caucus)
    if (b) t[b]++
    else t.undecided++
  }
  return t
}

export type BaseKind = 'holds' | 'rating' | 'tossup' | 'unrated'

export function baseOutcome(seat: Seat, forecaster: string): { bloc: Bloc | null; kind: BaseKind } {
  if (!seat.up) return { bloc: seat.current, kind: 'holds' }
  const r = seat.ratings[forecaster]
  if (!r) return { bloc: seat.current, kind: 'unrated' }
  if (r.party === null) return { bloc: null, kind: 'tossup' }
  return { bloc: r.party, kind: 'rating' }
}

export function outcome(seat: Seat, level: Level, forecaster: string, overrides: Overrides): Bloc | null {
  if (level === 'current') return seat.current
  const base = baseOutcome(seat, forecaster).bloc
  if (level === 'base') return base
  const o = overrides[seat.id]
  if (o === undefined) return base
  return o === 'U' ? null : o
}

export function tally(seats: Seat[], level: Level, forecaster: string, overrides: Overrides): Tally {
  const t: Tally = { D: 0, R: 0, I: 0, undecided: 0, total: seats.length }
  for (const s of seats) {
    const b = outcome(s, level, forecaster, overrides)
    if (b) t[b]++
    else t.undecided++
  }
  return t
}

export interface Control {
  winner: Bloc | null
  /** how the winner was determined */
  how: 'majority' | 'vice_president' | 'unresolved'
  needed: number
}

/** Senate: 51 seats win outright; a 50-50 split goes to the Vice President's party. Independents who caucus with a party are already counted in that party's bloc. */
export function senateControl(t: Tally, vp: Bloc, majority = 51): Control {
  if (t.D >= majority) return { winner: 'D', how: 'majority', needed: majority }
  if (t.R >= majority) return { winner: 'R', how: 'majority', needed: majority }
  const open = t.undecided + t.I
  if (open === 0 && t.D === 50 && t.R === 50) return { winner: vp, how: 'vice_president', needed: majority }
  return { winner: null, how: 'unresolved', needed: majority }
}

/** House: 218 of 435 voting seats. */
export function houseControl(t: Tally, majority = 218): Control {
  if (t.D >= majority) return { winner: 'D', how: 'majority', needed: majority }
  if (t.R >= majority) return { winner: 'R', how: 'majority', needed: majority }
  return { winner: null, how: 'unresolved', needed: majority }
}

export interface Range {
  Dmin: number
  Dmax: number
  Rmin: number
  Rmax: number
  tossups: number
}

/** Minimum / maximum seats per party in the base case if every Toss-up went to one side. */
export function baseRange(seats: Seat[], forecaster: string): Range {
  const t = tally(seats, 'base', forecaster, {})
  return { Dmin: t.D, Dmax: t.D + t.undecided, Rmin: t.R, Rmax: t.R + t.undecided, tossups: t.undecided }
}

/** Up seats defended by each bloc. */
export function defended(seats: Seat[]): Tally {
  const t: Tally = { D: 0, R: 0, I: 0, undecided: 0, total: 0 }
  for (const s of seats) {
    if (!s.up) continue
    t.total++
    if (s.current) t[s.current]++
    else t.undecided++
  }
  return t
}

/** Seats whose party could change according to this forecaster: Toss-ups and ratings favouring the other bloc. */
export function seatsAtRisk(seats: Seat[], forecaster: string): Seat[] {
  return seats.filter((s) => {
    if (!s.up) return false
    const r = s.ratings[forecaster]
    if (!r) return false
    return r.party === null || (s.current !== null && r.party !== s.current)
  })
}

export type PresetId = 'tossup_D' | 'tossup_R' | 'wave_D' | 'wave_R'

export const PRESETS: { id: PresetId; label: string; hint: string }[] = [
  { id: 'tossup_D', label: 'كل المتقاربة للديمقراطيين', hint: 'المقاعد المصنّفة Toss-up لدى الجهة المختارة تذهب للحزب الديمقراطي' },
  { id: 'tossup_R', label: 'كل المتقاربة للجمهوريين', hint: 'المقاعد المصنّفة Toss-up لدى الجهة المختارة تذهب للحزب الجمهوري' },
  { id: 'wave_D', label: 'موجة ديمقراطية افتراضية', hint: 'كل المقاعد المطروحة المصنّفة «متقارب/يميل قليلًا/يميل» تذهب للديمقراطيين' },
  { id: 'wave_R', label: 'موجة جمهورية افتراضية', hint: 'كل المقاعد المطروحة المصنّفة «متقارب/يميل قليلًا/يميل» تذهب للجمهوريين' },
]

export function applyPreset(id: PresetId, seats: Seat[], forecaster: string): Overrides {
  const winner: Bloc = id.endsWith('_D') ? 'D' : 'R'
  const maxLevel = id.startsWith('tossup') ? 0 : 2
  const out: Overrides = {}
  for (const s of seats) {
    if (!s.up) continue
    const r = s.ratings[forecaster]
    if (r && r.level <= maxLevel) out[s.id] = winner
  }
  return out
}
