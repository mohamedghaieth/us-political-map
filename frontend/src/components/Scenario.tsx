import { useMemo } from 'react'
import { GROUP_SHORT, GROUP_SYMBOL } from '../labels'
import {
  PRESETS, applyPreset, baseOutcome, baseRange, defended, houseControl, houseCurrentTally, outcome, senateControl, seatsAtRisk, tally,
  type Bloc, type Control, type Level, type Overrides, type Seat, type Tally,
} from '../scenario'
import type { Chamber, HouseRow119, Meta } from '../types'
import { DataType } from './ui'

const BLOC_COLOR: Record<string, string> = { D: '#1f5fbf', R: '#c8202f', I: '#6b7280', U: '#cfd4dc' }
const blocName = (b: Bloc | null) => (b ? GROUP_SHORT[b] : 'غير محسوم')

function MajorityBar({ t, need, total }: { t: Tally; need: number; total: number }) {
  const seg = [
    { k: 'D', v: t.D },
    { k: 'I', v: t.I },
    { k: 'U', v: t.undecided },
    { k: 'R', v: t.R },
  ]
  return (
    <div className="mbar" role="img" aria-label={`ديمقراطي ${t.D}، جمهوري ${t.R}، مستقل ${t.I}، غير محسوم ${t.undecided}. الأغلبية ${need}`}>
      <div className="mbar-track">
        {seg.map((s) => (
          <span key={s.k} style={{ width: `${(s.v / total) * 100}%`, background: BLOC_COLOR[s.k] }} className={s.k === 'U' ? 'mbar-u' : ''} />
        ))}
        <i className="mbar-mark" style={{ insetInlineStart: `${(need / total) * 100}%` }} title={`الأغلبية: ${need}`} />
      </div>
      <div className="mbar-legend small">
        <span>◀ D {t.D}</span>
        {t.I > 0 && <span>◇ {t.I}</span>}
        {t.undecided > 0 && <span>؟ غير محسوم {t.undecided}</span>}
        <span>R {t.R} ▶</span>
      </div>
    </div>
  )
}

function controlText(c: Control, vp: Bloc): string {
  if (c.how === 'unresolved') return 'السيطرة غير محسومة في هذا الوضع'
  if (c.how === 'vice_president') return `تعادل 50-50: تذهب السيطرة إلى حزب نائب الرئيس (${GROUP_SHORT[vp]})`
  return `${GROUP_SHORT[c.winner!]}: أغلبية (${c.needed}+)`
}

export default function Scenario({
  meta, chamber, onChamber, level, onLevel, forecaster, onForecaster, forecasters, seats, overrides, onOverrides, selectedId, onSelectSeat, h119, upTotals,
}: {
  meta: Meta
  chamber: Chamber
  onChamber: (c: Chamber) => void
  level: Level
  onLevel: (l: Level) => void
  forecaster: string
  onForecaster: (f: string) => void
  forecasters: { code: string; name: string }[]
  seats: Seat[]
  overrides: Overrides
  onOverrides: (o: Overrides) => void
  selectedId: string | null
  onSelectSeat: (id: string) => void
  h119: HouseRow119[] | null
  upTotals?: undefined
}) {
  const vp = meta.constants.vice_president_party as Bloc
  const need = chamber === 'sen' ? meta.constants.senate_majority : meta.constants.house_majority
  const total = chamber === 'house' ? 435 : seats.length

  const cur: Tally = useMemo(() => (chamber === 'house' && h119 ? houseCurrentTally(h119) : tally(seats, 'current', forecaster, {})), [chamber, h119, seats, forecaster])
  const base = useMemo(() => tally(seats, 'base', forecaster, {}), [seats, forecaster])
  const sim = useMemo(() => tally(seats, 'sim', forecaster, overrides), [seats, forecaster, overrides])
  const range = useMemo(() => baseRange(seats, forecaster), [seats, forecaster])
  const defd = useMemo(() => defended(seats), [seats])
  const risk = useMemo(() => seatsAtRisk(seats, forecaster), [seats, forecaster])
  const ctrl = (t: Tally) => (chamber === 'sen' ? senateControl(t, vp, need) : chamber === 'house' ? houseControl(t, need) : null)

  const selSeats = seats.filter((s) => (chamber === 'house' || chamber === 'gov' ? s.id === selectedId : s.state === selectedId))
  const nOver = Object.keys(overrides).length
  const diff = (a: number, b: number) => (a - b === 0 ? '0' : a - b > 0 ? `+${a - b}` : `${a - b}`)
  const seatBy = useMemo(() => new Map(seats.map((s) => [s.id, s])), [seats])

  const setSeat = (id: string, v: Bloc | 'U' | null) => {
    const next = { ...overrides }
    if (v === null) delete next[id]
    else next[id] = v
    onOverrides(next)
    onLevel('sim')
  }

  const chamberName = chamber === 'sen' ? 'مجلس الشيوخ' : chamber === 'house' ? 'مجلس النواب' : 'حكام الولايات'
  const cols: { key: Level; title: string; type: string; t: Tally; note: string }[] = [
    { key: 'current', title: 'الوضع الحالي', type: 'official', t: cur, note: chamber === 'house' ? 'الكونغرس 119 (بيانات رسمية)' : 'بيانات رسمية' },
    { key: 'base', title: 'السيناريو الأساسي', type: 'estimate', t: base, note: `تصنيفات ${forecasters.find((f) => f.code === forecaster)?.name ?? forecaster}` },
    { key: 'sim', title: 'محاكاة افتراضية', type: 'hypothetical', t: sim, note: nOver ? `${nOver} تعديل يدوي` : 'لا تعديلات' },
  ]

  return (
    <div className="scen">
      <div className="seg" role="tablist" aria-label="اختيار المجلس">
        {(['sen', 'house', 'gov'] as Chamber[]).map((c) => (
          <button key={c} role="tab" aria-selected={chamber === c} className={chamber === c ? 'on' : ''} onClick={() => onChamber(c)}>
            {c === 'sen' ? 'مجلس الشيوخ' : c === 'house' ? 'مجلس النواب' : 'حكام الولايات'}
          </button>
        ))}
      </div>

      <p className="notice">
        <strong>لا خلط بين المستويات:</strong> «الوضع الحالي» رسمي، و«الأساسي» تصنيفات نوعية صادرة عن جهة خارجية (وليست نتائج رسمية ولا نسب فوز)، و«المحاكاة» حساب افتراضي من اختيارك وليست توقعًا انتخابيًا.
      </p>

      <label className="field">
        <span>الجهة المرجعية للسيناريو الأساسي</span>
        <select value={forecaster} onChange={(e) => onForecaster(e.target.value)}>
          {forecasters.map((f) => (
            <option key={f.code} value={f.code}>{f.name}</option>
          ))}
        </select>
      </label>

      <div className="cmp" role="tablist" aria-label="مستوى العرض على الخريطة">
        {cols.map((c) => {
          const k = ctrl(c.t)
          return (
            <button key={c.key} role="tab" aria-selected={level === c.key} className={`cmp-col ${level === c.key ? 'on' : ''}`} onClick={() => onLevel(c.key)}>
              <span className="cmp-title">{c.title}</span>
              <DataType type={c.type} />
              <span className="small muted">{c.note}</span>
              <span className="cmp-nums">
                <b className="d">{c.t.D}</b> <small>D</small>
                <b className="r">{c.t.R}</b> <small>R</small>
                {c.t.I > 0 && <><b>{c.t.I}</b> <small>◇</small></>}
              </span>
              {c.t.undecided > 0 && <span className="small">؟ غير محسوم: {c.t.undecided}</span>}
              {k && <span className="small ctrl">{controlText(k, vp)}</span>}
            </button>
          )
        })}
      </div>
      <p className="small muted">اضغط على عمود لعرضه على الخريطة. {chamber === 'house' && 'الوضع الحالي يُرسم على حدود الكونغرس 119، والأساسي والمحاكاة على حدود 2026.'}</p>

      {chamber !== 'gov' && <MajorityBar t={level === 'current' ? cur : level === 'base' ? base : sim} need={need} total={total} />}

      <section className="card">
        <h3>السيناريو الأساسي: المدى حسب التصنيف <DataType type="estimate" /></h3>
        <ul className="plain">
          <li>الديمقراطيون: من <b>{range.Dmin}</b> إلى <b>{range.Dmax}</b> ({chamberName}) — الجمهوريون: من <b>{range.Rmin}</b> إلى <b>{range.Rmax}</b></li>
          <li>مقاعد مصنّفة «متقارب» (Toss-up) وتُترك غير محسومة: <b>{range.tossups}</b></li>
          {chamber !== 'gov' && <li>العدد اللازم للأغلبية: <b>{need}</b>{chamber === 'sen' && ' (أو 50 مع صوت نائب الرئيس عند التعادل: يعود حاليًا للحزب الجمهوري بحكم منصبه)'}</li>}
          <li>مقاعد مطروحة يدافع عنها الديمقراطيون: <b>{defd.D}</b> · الجمهوريون: <b>{defd.R}</b>{defd.I + defd.undecided > 0 && <> · أخرى/غير محددة: <b>{defd.I + defd.undecided}</b></>} (من {defd.total})</li>
          <li>مقاعد قد يتغير انتماؤها وفق هذه الجهة (متقارب أو مصنّف لصالح الحزب الآخر): <b>{risk.length}</b></li>
        </ul>
        <p className="small muted">
          احتمالات السيطرة الرقمية: <b>غير متوفرة</b> — لم تُستورد احتمالات كمية موثوقة، ولا نحوّل وصفًا مثل «سباق متقارب» إلى نسبة مئوية. حدود الدقة: التصنيف نوعي ويحمل عدم يقين لا تعبّر عنه الأعداد.
          {chamber === 'house' && ' مقاعد لا تصنّفها الجهة (غير تنافسية لديها) تُحتسب للحزب المدافع في هذا الحساب فقط، وهو افتراض حسابي لا توقع.'}
        </p>
        {risk.length > 0 && (
          <details>
            <summary>قائمة المقاعد التي قد تتغير ({risk.length})</summary>
            <ul className="seat-list">
              {risk.map((s) => {
                const r = s.ratings[forecaster]
                return (
                  <li key={s.id}>
                    <button type="button" className="link-btn" onClick={() => onSelectSeat(chamber === 'sen' ? s.state : s.id)}>{s.label}</button>
                    <span className="muted small ltr"> {r.label}</span>
                  </li>
                )
              })}
            </ul>
          </details>
        )}
      </section>

      <section className="card">
        <h3>محاكي النتائج <DataType type="hypothetical" /></h3>
        <p className="small muted">اختر مقعدًا على الخريطة (أو من القائمة أعلاه) ثم حدّد الحزب الفائز افتراضيًا. تُحسب الأغلبية فورًا. هذه «محاكاة افتراضية» وليست توقعًا انتخابيًا.</p>
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" title={p.hint} onClick={() => { onOverrides(applyPreset(p.id, seats, forecaster)); onLevel('sim') }}>
              {p.label}
            </button>
          ))}
          <button type="button" className="danger" onClick={() => { onOverrides({}); }}>إعادة المحاكاة إلى السيناريو الأساسي</button>
          <button type="button" className="danger" onClick={() => { onOverrides({}); onLevel('current') }}>العودة إلى الوضع الحالي</button>
        </div>

        {selSeats.length === 0 ? (
          <p className="empty">لم تحدّد مقعدًا بعد. انقر ولاية/دائرة على الخريطة.</p>
        ) : (
          selSeats.map((s) => {
            const b = baseOutcome(s, forecaster)
            const r = s.ratings[forecaster]
            const cur = outcome(s, 'sim', forecaster, overrides)
            return (
              <div className="sim-seat" key={s.id}>
                <h4>{s.label}</h4>
                <p className="small">
                  {s.up ? '▣ مطروح للانتخاب' : 'غير مطروح في هذه الدورة (لا يمكن تغييره)'} · الحزب الحالي/المدافع: {blocName(s.current)}
                  {r && <> · تصنيف الجهة: <span className="ltr">{r.label}</span></>}
                  {!r && s.up && <> · غير مصنّف لدى هذه الجهة (يبقى للحزب الحالي)</>}
                </p>
                <p className="small">الأساسي: <b>{blocName(b.bloc)}</b> · الحالي في المحاكاة: <b>{blocName(cur)}</b>{overrides[s.id] !== undefined && ' (معدَّل يدويًا)'}</p>
                <div className="seg">
                  {(['D', 'R', 'I', 'U'] as const).map((v) => (
                    <button key={v} type="button" disabled={!s.up} className={overrides[s.id] === v ? 'on' : ''} onClick={() => setSeat(s.id, v)}>
                      <span aria-hidden="true">{v === 'U' ? '؟' : GROUP_SYMBOL[v]}</span> {v === 'U' ? 'غير محسوم' : GROUP_SHORT[v]}
                    </button>
                  ))}
                  <button type="button" disabled={overrides[s.id] === undefined} onClick={() => setSeat(s.id, null)}>إلغاء التعديل</button>
                </div>
              </div>
            )
          })
        )}

        {nOver > 0 && (
          <>
            <h4>المقاعد المعدَّلة ({nOver})</h4>
            <ul className="seat-list">
              {Object.entries(overrides).map(([id, v]) => (
                <li key={id}>
                  <button type="button" className="link-btn" onClick={() => onSelectSeat(chamber === 'sen' ? seatBy.get(id)?.state ?? id : id)}>{seatBy.get(id)?.label ?? id}</button> → {blocName(v === 'U' ? null : v)}
                  <button type="button" className="x" aria-label="إزالة التعديل" onClick={() => setSeat(id, null)}>×</button>
                </li>
              ))}
            </ul>
            <p className="small">
              مقارنة بالسيناريو الأساسي: الديمقراطيون <b>{diff(sim.D, base.D)}</b> · الجمهوريون <b>{diff(sim.R, base.R)}</b> · غير محسوم <b>{diff(sim.undecided, base.undecided)}</b>
            </p>
          </>
        )}
        {(() => {
          const k = ctrl(sim)
          return k && <p className="result">نتيجة المحاكاة: {controlText(k, vp)} · مطلوب {need}.</p>
        })()}
      </section>
    </div>
  )
}
