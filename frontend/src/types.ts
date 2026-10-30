export type PartyCode = 'D' | 'R' | 'I' | 'L' | 'G' | 'O' | 'U'
/** Coloring groups: D blue, R red, everything else gray (told apart by symbol + label). */
export type Group = 'D' | 'R' | 'I' | 'O' | 'U'

export interface StateInfo {
  abbr: string
  fips: string
  name_ar: string
  name_en: string
  capital_ar: string
  capital_en: string
  kind: string
}

export interface SourceInfo {
  id: string
  name_ar: string
  name_en: string
  url: string
  kind: 'official' | 'announced' | 'estimate' | 'hypothetical'
  verified_at: string | null
  valid_as_of: string | null
  note: string
}

export interface PersonInfo {
  id: string
  name_en: string
  name_ar: string | null
  photo_url: string | null
  website: string | null
  wikipedia: string | null
  bioguide: string | null
  profile_url: string | null
}

export interface Holder {
  vacant: boolean
  party: PartyCode | null
  person: PersonInfo | null
  term_start: string | null
  term_end: string | null
  meta: { caucus?: PartyCode | null; term_end_year?: number; term_end_text?: string; start_note?: string; note?: string }
  source: SourceInfo | null
  data_type: string
  completeness?: string
}

export interface Candidate {
  name_en: string
  name_ar: string | null
  party: PartyCode
  party_label: string | null
  is_incumbent: boolean
  status: string
  stage: string
  data_type: string
  fec_id: string | null
  source_id: string
  fec_url: string | null
  first_seen: string
  last_changed: string
  history: { status: string; party: string; recorded_at: string }[]
}

export interface Forecast {
  forecaster: string
  name: string
  url: string | null
  label: string
  party: PartyCode | null
  level: number
  level_ar: string
  flip: boolean
  published_on: string
  data_type: 'estimate'
}

export interface ElectionView {
  id: string
  kind: 'general' | 'special'
  cycle: number
  date: string
  primary_date: string | null
  runoff_date: string | null
  filing_deadline: string | null
  days_until: number
  phase: 'upcoming' | 'election_day' | 'ended'
  incumbent_status: string
  status_text: string | null
  incumbents: { name: string; party: PartyCode; person_id: string | null; note?: string | null }[]
  defending_party: PartyCode | null
  pvi: string | null
  is_open: boolean
  uncontested: boolean
  candidates_undetermined: boolean
  candidates: Candidate[]
  candidate_sources: SourceInfo[]
  potential_candidates: Candidate[]
  dropped_candidates: Candidate[]
  forecasts: Forecast[]
  competitive_by: string[]
  tossup_by: string[]
  forecast_note: string
  source: SourceInfo
  results_note: string | null
}

export interface GovernorRow {
  office_id: string
  state: StateInfo
  holder: Holder
  next_election_year: number | null
  election: ElectionView | null
}

export interface SenateRow {
  office_id: string
  state: StateInfo
  senate_class: number
  holder: Holder
  next_election_year: number | null
  seat_status: 'up' | 'not_up' | 'vacant'
  election: ElectionView | null
}

export interface HouseRow119 {
  office_id: string
  geoid: string
  state: StateInfo
  district: number
  at_large: boolean
  delegate: boolean
  map_version: 119
  holder: Holder
  running_2026: { election_id: string; geoid: string; status_text: string | null; incumbent_status: string } | null
}

export interface HouseRow120 {
  office_id: string
  geoid: string
  state: StateInfo
  district: number
  at_large: boolean
  delegate: boolean
  map_version: 120
  election: ElectionView | null
}

export type HouseRow = HouseRow119 | HouseRow120

export interface DatasetInfo {
  name: string
  label: string
  updated_at: string | null
  verified_at: string | null
  last_attempt_at: string | null
  status: 'ok' | 'failed'
  message: string
  row_count: number
  sources: string[]
  age_days: number | null
  stale: boolean
}

export interface PartyInfo {
  code: PartyCode
  name_en: string
  name_ar: string
  group: Group
  color: string
}

export interface Meta {
  reference_date: string
  constants: { vice_president_party: PartyCode; senate_majority: number; house_majority: number; general_election_date: string }
  update_mode: string
  build: { generated_at?: string; fetched_at?: string; loaded_at?: string }
  datasets: DatasetInfo[]
  sources: SourceInfo[]
  parties: PartyInfo[]
  states: StateInfo[]
  quality: {
    warnings?: string[]
    conflicts?: { office_id: string; official: string; other: string; note: string }[]
    state_sources?: { source_id: string; state: string; document_date: string; offices: string[]; official_candidates: number; matched: number; only_official: number; only_secondary: number; party_conflicts: number; elections_covered: number }[]
    candidate_discrepancies?: { election_id: string; kind: string; source_id: string; name: string | null; official?: string; secondary?: string; note: string }[]
  }
  forecast_note: string
}

export interface SearchHit {
  type: 'state' | 'governor' | 'senate' | 'house' | 'candidate'
  label: string
  sub: string
  state: string
  office_id?: string
  geoid?: string | null
  election_id?: string
  kind?: 'governor' | 'senate' | 'house'
}

export type Mode = 'gov' | 'sen' | 'house' | 'scen'
export type Chamber = 'sen' | 'house' | 'gov'

export interface Selection {
  /** state abbreviation (gov/sen/scen-sen/scen-gov) or district geoid (house) */
  id: string
  /** house map version when id is a geoid */
  map?: 119 | 120
}

export interface Filters {
  party: 'all' | 'D' | 'R' | 'O'
  seat: 'all' | 'up' | 'not_up' | 'open' | 'competitive' | 'undetermined' | 'vacant'
  cycle: 'all' | number
}
