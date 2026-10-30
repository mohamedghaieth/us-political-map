import { describe, expect, it } from 'vitest'
import { applyPreset, baseOutcome, baseRange, blocOf, houseControl, outcome, senateControl, seatsAtRisk, tally, type Seat } from './scenario'

const rate = (party: 'D' | 'R' | null, level: number) => ({ Cook: { party, level, label: 'x', flip: false } })
const seat = (id: string, current: 'D' | 'R' | null, up: boolean, ratings = {}): Seat => ({ id, label: id, state: 'XX', up, current, ratings })

describe('blocOf', () => {
  it('maps independents that caucus with a party to that party', () => {
    expect(blocOf('I', 'D')).toBe('D')
    expect(blocOf('I', null)).toBe('I')
    expect(blocOf('R')).toBe('R')
    expect(blocOf(null)).toBeNull()
  })
})

describe('base case', () => {
  const seats = [
    seat('a', 'R', true, rate('D', 2)),
    seat('b', 'R', true, rate(null, 0)),
    seat('c', 'D', false),
    seat('d', 'D', true, rate('D', 4)),
    seat('e', 'R', true), // unrated by this forecaster -> holds
  ]
  it('follows ratings, leaves toss-ups undecided, holds unrated/not-up seats', () => {
    expect(baseOutcome(seats[0], 'Cook')).toEqual({ bloc: 'D', kind: 'rating' })
    expect(baseOutcome(seats[1], 'Cook').kind).toBe('tossup')
    expect(baseOutcome(seats[2], 'Cook').kind).toBe('holds')
    expect(baseOutcome(seats[4], 'Cook').kind).toBe('unrated')
    const t = tally(seats, 'base', 'Cook', {})
    expect(t).toMatchObject({ D: 3, R: 1, undecided: 1, total: 5 })
  })
  it('range gives the swing from toss-ups', () => {
    expect(baseRange(seats, 'Cook')).toEqual({ Dmin: 3, Dmax: 4, Rmin: 1, Rmax: 2, tossups: 1 })
  })
  it('at-risk = toss-ups and ratings favouring the other bloc', () => {
    expect(seatsAtRisk(seats, 'Cook').map((s) => s.id)).toEqual(['a', 'b'])
  })
})

describe('simulation', () => {
  const seats = [seat('a', 'R', true, rate('R', 3)), seat('b', 'R', true, rate(null, 0))]
  it('overrides change only the chosen seats and reset restores base', () => {
    expect(outcome(seats[0], 'sim', 'Cook', { a: 'D' })).toBe('D')
    expect(outcome(seats[0], 'sim', 'Cook', {})).toBe('R')
    expect(outcome(seats[1], 'sim', 'Cook', { b: 'U' })).toBeNull()
  })
  it('presets only touch up seats within the rating level', () => {
    expect(applyPreset('tossup_D', seats, 'Cook')).toEqual({ b: 'D' })
    expect(applyPreset('wave_R', seats, 'Cook')).toEqual({ b: 'R' })
  })
})

describe('control', () => {
  it('senate: 51 wins; 50-50 goes to VP; unresolved otherwise', () => {
    const t = (D: number, R: number, undecided = 0) => ({ D, R, I: 0, undecided, total: D + R + undecided })
    expect(senateControl(t(51, 49), 'R')).toMatchObject({ winner: 'D', how: 'majority' })
    expect(senateControl(t(50, 50), 'R')).toMatchObject({ winner: 'R', how: 'vice_president' })
    expect(senateControl(t(49, 47, 4), 'R').winner).toBeNull()
    expect(senateControl(t(50, 50), 'D').winner).toBe('D')
  })
  it('house: 218 of 435', () => {
    expect(houseControl({ D: 218, R: 217, I: 0, undecided: 0, total: 435 }).winner).toBe('D')
    expect(houseControl({ D: 217, R: 217, I: 0, undecided: 1, total: 435 }).winner).toBeNull()
  })
})
