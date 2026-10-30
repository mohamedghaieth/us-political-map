import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { loadGeo, type MapGeo } from './geo'
import { fmtDate, fmtDateTime } from './labels'
import {
  governorsModel, house119Model, house120Model, scenarioStateModel, senateModel, type MapModel,
} from './model'
import { governorSeats, houseSeats, senateSeats, type Level, type Overrides } from './scenario'
import type {
  Chamber, Filters, GovernorRow, HouseRow119, HouseRow120, Meta, Mode, SearchHit, SenateRow, Selection,
} from './types'
import { GovernorDetails, House119Details, House120Details, SenateDetails } from './components/Details'
import Elections, { buildContests, type Contest } from './components/Elections'
import Scenario from './components/Scenario'
import Stats from './components/Stats'
import USMap from './components/USMap'
import { Empty } from './components/ui'
import Legend from './components/Legend'
import SourcesDialog from './components/SourcesDialog'

interface Res<T> {
  data: T | null
  error: string | null
  loading: boolean
}

function useResource<T>(fn: () => Promise<T>): Res<T> & { reload: () => void } {
  const [s, setS] = useState<Res<T>>({ data: null, error: null, loading: true })
  const [n, setN] = useState(0)
  useEffect(() => {
    let live = true
    setS((p) => ({ ...p, loading: true, error: null }))
    fn().then(
      (data) => live && setS({ data, error: null, loading: false }),
      (e) => live && setS({ data: null, error: String(e.message ?? e), loading: false }),
    )
    return () => {
      live = false
    }
  }, [n]) // eslint-disable-line react-hooks/exhaustive-deps
  return { ...s, reload: () => setN((x) => x + 1) }
}

const DEFAULT_FILTERS: Filters = { party: 'all', seat: 'all', cycle: 'all' }
const MODES: { id: Mode; label: string; icon: string }[] = [
  { id: 'gov', label: 'حكام الولايات', icon: '🏛' },
  { id: 'sen', label: 'مجلس الشيوخ', icon: '⚖' },
  { id: 'house', label: 'مجلس النواب', icon: '🗳' },
  { id: 'scen', label: 'السيناريوهات الانتخابية', icon: '📊' },
]
const CYCLES: Record<Mode, number[]> = { gov: [2026, 2027, 2028, 2029], sen: [2026, 2028, 2030], house: [2026], scen: [2026] }

export default function App() {
  const meta = useResource<Meta>(api.meta)
  const gov = useResource<GovernorRow[]>(api.governors)
  const sen = useResource<SenateRow[]>(api.senate)
  const h119 = useResource<HouseRow119[]>(api.house119)
  const h120 = useResource<HouseRow120[]>(api.house120)
  const geo119 = useResource<MapGeo>(() => loadGeo('/data/districts119.topo.json'))
  const geo120 = useResource<MapGeo>(() => loadGeo('/data/districts120.topo.json'))

  const [mode, setMode] = useState<Mode>('gov')
  const [houseMap, setHouseMap] = useState<119 | 120>(119)
  const [sel, setSel] = useState<Selection | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [tab, setTab] = useState<'details' | 'stats' | 'elections'>('details')
  const [panelOpen, setPanelOpen] = useState(true)
  const [sourcesOpen, setSourcesOpen] = useState(false)

  // scenario state
  const [chamber, setChamber] = useState<Chamber>('sen')
  const [level, setLevel] = useState<Level>('base')
  const [forecaster, setForecaster] = useState('Cook')
  const [overrides, setOverrides] = useState<Record<Chamber, Overrides>>({ sen: {}, house: {}, gov: {} })

  const seatsByChamber = useMemo(
    () => ({
      sen: sen.data ? senateSeats(sen.data) : [],
      gov: gov.data ? governorSeats(gov.data) : [],
      house: h120.data ? houseSeats(h120.data) : [],
    }),
    [sen.data, gov.data, h120.data],
  )
  const forecasters = useMemo(() => {
    const m = new Map<string, string>()
    const add = (fs?: { forecaster: string; name: string }[]) => fs?.forEach((f) => m.set(f.forecaster, f.name))
    if (chamber === 'sen') sen.data?.forEach((r) => add(r.election?.forecasts))
    if (chamber === 'gov') gov.data?.forEach((r) => add(r.election?.forecasts))
    if (chamber === 'house') h120.data?.forEach((r) => add(r.election?.forecasts))
    return [...m].map(([code, name]) => ({ code, name })).sort((a, b) => (a.code === 'Cook' ? -1 : b.code === 'Cook' ? 1 : a.name.localeCompare(b.name)))
  }, [chamber, sen.data, gov.data, h120.data])
  useEffect(() => {
    if (forecasters.length && !forecasters.some((f) => f.code === forecaster)) setForecaster(forecasters[0].code)
  }, [forecasters, forecaster])

  // ---- map model per mode
  const model: MapModel | null = useMemo(() => {
    const g119 = geo119.data
    const g120 = geo120.data
    if (mode === 'gov') return gov.data && g119 ? governorsModel(gov.data, g119, filters) : null
    if (mode === 'sen') return sen.data && g119 ? senateModel(sen.data, g119, filters) : null
    if (mode === 'house') {
      if (houseMap === 119) return h119.data && g119 ? house119Model(h119.data, g119, filters) : null
      return h120.data && g120 ? house120Model(h120.data, g120, filters) : null
    }
    // scenarios
    const ov = overrides[chamber]
    if (chamber === 'house') {
      if (level === 'current') return h119.data && g119 ? house119Model(h119.data, g119, filters) : null
      if (!h120.data || !g120) return null
      const map = new Map(seatsByChamber.house.map((s) => [s.id, s]))
      return house120Model(h120.data, g120, filters, { map, level, forecaster, overrides: ov })
    }
    if (chamber === 'sen') return sen.data && g119 ? scenarioStateModel('sen', sen.data, g119, seatsByChamber.sen, level, forecaster, ov, filters) : null
    return gov.data && g119 ? scenarioStateModel('gov', gov.data, g119, seatsByChamber.gov, level, forecaster, ov, filters) : null
  }, [mode, houseMap, chamber, level, forecaster, overrides, filters, gov.data, sen.data, h119.data, h120.data, geo119.data, geo120.data, seatsByChamber])

  const mapKind = mode === 'house' || (mode === 'scen' && chamber === 'house') ? 'house' : 'state'
  const selectedMap: 119 | 120 = mode === 'house' ? houseMap : level === 'current' ? 119 : 120

  const resetSel = () => {
    setSel(null)
    setFocus(null)
  }
  const changeMode = (m: Mode) => {
    setMode(m)
    resetSel()
    setFilters(DEFAULT_FILTERS)
    setTab('details')
  }

  const onSelect = useCallback(
    (id: string) => {
      setSel({ id, map: mapKind === 'house' ? selectedMap : undefined })
      setPanelOpen(true)
      setTab('details')
    },
    [mapKind, selectedMap],
  )

  // switching the House boundary set invalidates a district selection
  useEffect(() => {
    setSel((s) => (s && mapKind === 'house' && s.map !== selectedMap ? null : s))
  }, [selectedMap, mapKind])

  const pickContest = (c: Contest) => {
    setMode(c.target.mode)
    if (c.target.mode === 'house') setHouseMap(120)
    setSel({ id: c.target.id, map: c.target.map })
    setFocus(c.target.mode === 'house' ? (h120.data?.find((r) => r.geoid === c.target.id)?.state.abbr ?? null) : c.target.id)
    setTab('details')
    setPanelOpen(true)
  }

  const pickHit = (h: SearchHit) => {
    setTab('details')
    setPanelOpen(true)
    if (h.type === 'state') {
      setFocus(h.state)
      if (mode !== 'house') setSel({ id: h.state })
      return
    }
    const kind = h.type === 'candidate' ? h.kind : h.type
    if (kind === 'governor') {
      setMode('gov')
      setSel({ id: h.state })
      setFocus(h.state)
    } else if (kind === 'senate') {
      setMode('sen')
      setSel({ id: h.state })
      setFocus(h.state)
    } else if (kind === 'house' && h.geoid) {
      setMode('house')
      const is119 = h.type === 'house'
      setHouseMap(is119 ? 119 : 120)
      // candidate hits carry the 2026-map geoid; incumbent hits carry the current-map geoid
      setSel({ id: h.geoid.replace('H119-', ''), map: is119 ? 119 : 120 })
      setFocus(h.state)
    }
  }

  // ---- details content
  const details = (() => {
    if (mode === 'scen') return null
    if (!sel) return <Empty>اختر {mode === 'house' ? 'دائرة' : 'ولاية'} من الخريطة أو ابحث عنها لعرض التفاصيل.</Empty>
    if (mode === 'gov') {
      const r = gov.data?.find((x) => x.state.abbr === sel.id)
      return r ? <GovernorDetails row={r} /> : <Empty>لا بيانات.</Empty>
    }
    if (mode === 'sen') {
      const rs = sen.data?.filter((x) => x.state.abbr === sel.id)
      return rs?.length ? <SenateDetails rows={rs} /> : <Empty>لا بيانات.</Empty>
    }
    if (houseMap === 119) {
      const r = h119.data?.find((x) => x.geoid === sel.id)
      return r ? (
        <House119Details row={r} onGoto2026={(geoid) => { setHouseMap(120); setSel({ id: geoid, map: 120 }); setFocus(r.state.abbr) }} />
      ) : <Empty>لا بيانات.</Empty>
    }
    const r = h120.data?.find((x) => x.geoid === sel.id)
    return r ? <House120Details row={r} /> : <Empty>لا بيانات.</Empty>
  })()

  const contests = useMemo(() => buildContests(gov.data, sen.data, h120.data), [gov.data, sen.data, h120.data])

  // ---- filters
  const seatOptions: [Filters['seat'], string][] =
    mode === 'house' && houseMap === 119
      ? [['all', 'كل المقاعد'], ['vacant', 'المقاعد الشاغرة'], ['open', 'ممثل لن يترشح']]
      : [['all', 'كل المقاعد'], ['up', 'مطروحة للانتخاب'], ['not_up', 'غير مطروحة'], ['open', 'مفتوحة'], ['competitive', 'تنافسية (وفق جهات)'], ['undetermined', 'مرشحون غير محسومين'], ['vacant', 'شاغرة']]
  const anyFilter = filters.party !== 'all' || filters.seat !== 'all' || filters.cycle !== 'all'

  const reference = meta.data?.reference_date
  const failed = [meta, gov, sen, h119, h120, geo119, geo120].filter((r) => r.error)
  const staleDs = meta.data?.datasets.filter((d) => d.status === 'failed' || d.stale) ?? []
  const lastUpdate = meta.data ? meta.data.datasets.map((d) => d.verified_at).filter(Boolean).sort().pop() ?? null : null

  const mapLoading = !model && !failed.length

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="12" fill="#14213d" /><path d="M10 26h22v-10l10 2 12 10v12H34l-6 10-10-6-8-4z" fill="#1f5fbf" /><path d="M32 26h22v12H34l-6 10z" fill="#c8202f" /></svg>
          <div>
            <h1>الخريطة السياسية للولايات المتحدة الأمريكية</h1>
            <p className="muted small">الحكام · مجلس الشيوخ · مجلس النواب · انتخابات 2026 والسيناريوهات</p>
          </div>
        </div>
        <SearchBox onPick={pickHit} />
        <div className="top-meta small">
          {reference && <span>التاريخ المرجعي: <b>{fmtDate(reference)}</b></span>}
          {lastUpdate && <span>آخر تحقق ناجح من البيانات: <b>{fmtDateTime(lastUpdate)}</b></span>}
          <button type="button" className="btn" onClick={() => setSourcesOpen(true)}>المصادر وجودة البيانات</button>
        </div>
      </header>

      {(failed.length > 0 || staleDs.length > 0) && (
        <div className="banner" role="alert">
          {failed.length > 0 && (
            <>
              ⚠ تعذّر تحميل بعض البيانات: {failed.map((f) => f.error).filter((e, i, a) => a.indexOf(e) === i).join(' · ')}{' '}
              <button type="button" className="link-btn" onClick={() => failed.forEach((f) => f.reload())}>إعادة المحاولة</button>
            </>
          )}
          {staleDs.length > 0 && (
            <div>⚠ تحديث البيانات متأخر أو فاشل ({staleDs.map((d) => d.label).join('، ')}). تُعرض آخر بيانات ناجحة بتاريخ {fmtDate(lastUpdate)}.</div>
          )}
        </div>
      )}

      <nav className="modes" aria-label="أوضاع العرض">
        {MODES.map((m) => (
          <button key={m.id} type="button" className={mode === m.id ? 'on' : ''} aria-current={mode === m.id} onClick={() => changeMode(m.id)}>
            <span aria-hidden="true">{m.icon}</span> {m.label}
          </button>
        ))}
        {mode === 'house' && (
          <span className="seg inline" role="group" aria-label="حدود الدوائر">
            <button type="button" className={houseMap === 119 ? 'on' : ''} onClick={() => setHouseMap(119)}>الدوائر الحالية (الكونغرس 119)</button>
            <button type="button" className={houseMap === 120 ? 'on' : ''} onClick={() => setHouseMap(120)}>خريطة انتخابات 2026 (الكونغرس 120)</button>
          </span>
        )}
      </nav>

      <div className="filters" role="group" aria-label="الفلاتر">
        <label>الحزب
          <select value={filters.party} onChange={(e) => setFilters({ ...filters, party: e.target.value as Filters['party'] })}>
            <option value="all">الكل</option><option value="D">الديمقراطي</option><option value="R">الجمهوري</option><option value="O">مستقل / آخر</option>
          </select>
        </label>
        <label>حالة المقعد
          <select value={filters.seat} onChange={(e) => setFilters({ ...filters, seat: e.target.value as Filters['seat'] })}>
            {seatOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>الدورة الانتخابية
          <select value={String(filters.cycle)} onChange={(e) => setFilters({ ...filters, cycle: e.target.value === 'all' ? 'all' : Number(e.target.value) })}>
            <option value="all">الكل</option>
            {CYCLES[mode].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <button type="button" className="btn" onClick={() => setFilters(DEFAULT_FILTERS)} disabled={!anyFilter}>إعادة الضبط</button>
        {model && anyFilter && <span className="small">المطابق: <b>{model.visibleCount}</b> من {model.totalCount}</span>}
        <button type="button" className="btn panel-toggle" onClick={() => setPanelOpen((v) => !v)} aria-expanded={panelOpen}>{panelOpen ? 'إخفاء اللوحة' : 'إظهار اللوحة'}</button>
      </div>

      <main className={`main ${panelOpen ? '' : 'no-panel'}`}>
        <section className="map-col" aria-label="الخريطة">
          {mapLoading && <div className="loading" role="status">جارٍ تحميل الخريطة والبيانات…</div>}
          {model && (
            <USMap
              shapes={model.shapes}
              items={model.items}
              outlines={model.outlines}
              selectedId={sel?.id ?? null}
              onSelect={onSelect}
              tooltip={model.tooltip}
              overlay={model.overlay ? (k) => model.overlay!(k, sel?.id ?? null) : undefined}
              focus={focus}
              focusShapes={model.focusShapes}
              hint={model.hint}
            />
          )}
          <p className="caption small muted">
            {mode === 'house'
              ? houseMap === 119 ? 'ألوان الدوائر = حزب الممثل الحالي (حدود الكونغرس 119). الدوائر الجديدة لا تظهر هنا.' : 'ألوان الدوائر = الحزب المدافع عن المقعد وفق المصدر (حدود 2026). المقعد المفتوح مُهشَّر.'
              : mode === 'scen'
                ? level === 'sim' ? 'محاكاة افتراضية — ليست توقعًا انتخابيًا.' : level === 'base' ? 'تقدير جهة خارجية — وليس نتيجة رسمية.' : 'بيانات رسمية للوضع الحالي.'
                : mode === 'gov' ? 'لون الولاية = حزب الحاكم الحالي. الإطار الأسود = حاكم يُنتخب في 2026.' : 'كل ولاية لها مقعدان (دائرتان صغيرتان): الإطار الأسود = المقعد مطروح في 2026. الولاية المخططة = حزبان مختلفان.'}
          </p>
          <Legend mode={mode} houseMap={houseMap} level={level} />
        </section>

        {panelOpen && (
          <aside className="side" aria-label="لوحة المعلومات">
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}>{mode === 'scen' ? 'السيناريو والمحاكي' : 'التفاصيل'}</button>
              <button role="tab" aria-selected={tab === 'stats'} className={tab === 'stats' ? 'on' : ''} onClick={() => setTab('stats')}>الإحصائيات</button>
              <button role="tab" aria-selected={tab === 'elections'} className={tab === 'elections' ? 'on' : ''} onClick={() => setTab('elections')}>الانتخابات القادمة</button>
            </div>
            <div className="side-body" role="tabpanel">
              {tab === 'details' && mode !== 'scen' && details}
              {tab === 'details' && mode === 'scen' && meta.data && (
                <Scenario
                  meta={meta.data}
                  chamber={chamber}
                  onChamber={(c) => { setChamber(c); resetSel() }}
                  level={level}
                  onLevel={setLevel}
                  forecaster={forecaster}
                  onForecaster={setForecaster}
                  forecasters={forecasters}
                  seats={seatsByChamber[chamber]}
                  overrides={overrides[chamber]}
                  onOverrides={(o) => setOverrides({ ...overrides, [chamber]: o })}
                  selectedId={sel?.id ?? null}
                  onSelectSeat={(id) => setSel({ id, map: chamber === 'house' ? selectedMap : undefined })}
                  h119={h119.data}
                />
              )}
              {tab === 'details' && mode === 'scen' && !meta.data && <Empty>جارٍ التحميل…</Empty>}
              {tab === 'stats' && <Stats mode={mode} meta={meta.data} gov={gov.data} sen={sen.data} h119={h119.data} h120={h120.data} filters={filters} houseMap={houseMap} />}
              {tab === 'elections' && <Elections contests={contests} onPick={pickContest} refDate={reference ?? ''} />}
            </div>
          </aside>
        )}
      </main>

      {sourcesOpen && meta.data && <SourcesDialog meta={meta.data} onClose={() => setSourcesOpen(false)} />}
      <footer className="foot small muted">
        التحديث دوري/يدوي عبر سكربت الاستيراد وليس لحظيًا. التصنيفات تقديرات جهات خارجية. المحاكاة افتراضية. المصدر الرسمي مقدَّم على المصادر الثانوية عند الاختلاف.
      </footer>
    </div>
  )
}

function SearchBox({ onPick }: { onPick: (h: SearchHit) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const t = useRef<number>()
  useEffect(() => {
    window.clearTimeout(t.current)
    if (q.trim().length < 2) {
      setHits([])
      return
    }
    t.current = window.setTimeout(() => {
      api.search(q.trim()).then(
        (h) => { setHits(h); setErr(null) },
        (e) => setErr(String(e.message)),
      )
    }, 250)
    return () => window.clearTimeout(t.current)
  }, [q])
  const choose = (h: SearchHit) => {
    onPick(h)
    setOpen(false)
    setQ('')
  }
  return (
    <div className="search" role="search">
      <input
        type="search"
        value={q}
        placeholder="ابحث عن ولاية أو مسؤول أو مرشح…"
        aria-label="بحث عن الولايات والمسؤولين والمرشحين"
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) choose(hits[0]); if (e.key === 'Escape') setOpen(false) }}
      />
      {open && q.trim().length >= 2 && (
        <ul className="search-res" role="listbox">
          {err && <li className="warn">{err}</li>}
          {!err && hits.length === 0 && <li className="muted">لا نتائج</li>}
          {hits.map((h, i) => (
            <li key={i} role="option" aria-selected={false}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(h)}>
                <b>{h.label}</b> <span className="muted small">{h.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
