import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { GROUP_SHORT, fmtDate, groupOf } from '../labels'
import { filtersActive, house119Info, house120Info, govInfo, matches, senInfo, type SeatInfo } from '../model'
import type { DatasetInfo, Filters, GovernorRow, Group, HouseRow119, HouseRow120, Meta, Mode, SenateRow } from '../types'

const COLORS: Record<Group, string> = { D: '#1f5fbf', R: '#c8202f', I: '#6b7280', O: '#8b93a1', U: '#b6bcc6' }

interface Rec extends SeatInfo {
  candidates: Group[]
}

function senSeatInfo(r: SenateRow): SeatInfo {
  const e = r.election
  return {
    party: groupOf(r.holder.party),
    up: r.seat_status === 'up',
    open: !!e?.is_open,
    competitive: !!e && e.competitive_by.length > 0,
    undetermined: !!e?.candidates_undetermined,
    vacant: r.seat_status === 'vacant',
    year: r.next_election_year,
  }
}

const candGroups = (e: { candidates: { party: any }[] } | null | undefined): Group[] => (e ? e.candidates.map((c) => groupOf(c.party)) : [])

function count(list: Group[]) {
  const c: Record<Group, number> = { D: 0, R: 0, I: 0, O: 0, U: 0 }
  for (const g of list) c[g]++
  return (['D', 'R', 'I', 'O', 'U'] as Group[]).filter((g) => c[g] > 0 || g === 'D' || g === 'R').map((g) => ({ group: g, name: GROUP_SHORT[g], value: c[g] }))
}

function Freshness({ ds }: { ds: DatasetInfo | undefined }) {
  if (!ds) return null
  return (
    <p className={`small ${ds.status === 'failed' || ds.stale ? 'warn' : 'muted'}`}>
      بيانات «{ds.label}» · سريان: {fmtDate(ds.updated_at)} · آخر تحقق ناجح: {fmtDate(ds.verified_at)}
      {ds.status === 'failed' && ' · ⚠ فشل آخر تحديث، تُعرض آخر بيانات ناجحة'}
      {ds.stale && ds.status !== 'failed' && ' · ⚠ لم تُحدَّث منذ مدة'}
    </p>
  )
}

function Dist({ title, data, ds, unit = 'مقعد' }: { title: string; data: { group: Group; name: string; value: number }[]; ds?: DatasetInfo; unit?: string }) {
  const total = data.reduce((a, b) => a + b.value, 0)
  return (
    <section className="card">
      <h3>{title} <span className="muted small">({total})</span></h3>
      <div role="img" aria-label={`${title}: ${data.map((d) => `${d.name} ${d.value}`).join('، ')}`} style={{ height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} reversed />
            <YAxis allowDecimals={false} hide />
            <Tooltip formatter={(v: number) => [`${v} ${unit}`, '']} separator="" />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.group} fill={COLORS[d.group]} />
              ))}
              <LabelList dataKey="value" position="top" fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="tbl tbl-mini">
        <tbody>
          <tr>{data.map((d) => <th key={d.group}>{d.name}</th>)}</tr>
          <tr>{data.map((d) => <td key={d.group}>{d.value}</td>)}</tr>
        </tbody>
      </table>
      <Freshness ds={ds} />
    </section>
  )
}

function Tiles({ items }: { items: { label: string; value: number | string; hint?: string }[] }) {
  return (
    <div className="tiles">
      {items.map((t) => (
        <div className="tile" key={t.label} title={t.hint}>
          <strong>{t.value}</strong>
          <span>{t.label}</span>
        </div>
      ))}
    </div>
  )
}

function summarize(recs: Rec[]) {
  return {
    total: recs.length,
    up: recs.filter((r) => r.up).length,
    open: recs.filter((r) => r.open).length,
    undetermined: recs.filter((r) => r.undetermined).length,
    competitive: recs.filter((r) => r.competitive).length,
    vacant: recs.filter((r) => r.vacant).length,
  }
}

export default function Stats({
  mode, meta, gov, sen, h119, h120, filters, houseMap,
}: {
  mode: Mode
  meta: Meta | null
  gov: GovernorRow[] | null
  sen: SenateRow[] | null
  h119: HouseRow119[] | null
  h120: HouseRow120[] | null
  filters: Filters
  houseMap: 119 | 120
}) {
  const ds = (n: string) => meta?.datasets.find((d) => d.name === n)
  const active = filtersActive(filters)
  const note = active ? <p className="notice small">الأرقام تعكس الفلاتر الحالية. اضغط «إعادة الضبط» لعرض الكل.</p> : null

  const govRecs: Rec[] = (gov ?? []).map((r) => ({ ...govInfo(r), candidates: candGroups(r.election) })).filter((r) => matches(r, filters))
  const senRecs: Rec[] = (sen ?? []).map((r) => ({ ...senSeatInfo(r), candidates: candGroups(r.election) })).filter((r) => matches(r, filters))
  const h119Recs: Rec[] = (h119 ?? []).filter((r) => !r.delegate).map((r) => ({ ...house119Info(r), candidates: [] as Group[] })).filter((r) => matches(r, filters))
  const h120Recs: Rec[] = (h120 ?? []).filter((r) => !r.delegate).map((r) => ({ ...house120Info(r), candidates: candGroups(r.election) })).filter((r) => matches(r, filters))

  const section = (title: string, recs: Rec[], opts: { current?: boolean; elected?: boolean; currentTitle: string }) => {
    const s = summarize(recs)
    return (
      <>
        <h2 className="panel-h">{title}</h2>
        {note}
        <Tiles
          items={[
            { label: 'إجمالي المقاعد (حسب الفلاتر)', value: s.total },
            { label: 'مطروحة للانتخاب', value: s.up },
            { label: 'مفتوحة (الشاغل لن يترشح)', value: s.open },
            { label: 'تنافسية وفق جهة واحدة على الأقل', value: s.competitive, hint: 'وفق تصنيفات الجهات الخارجية، وليست نتيجة مؤكدة' },
            { label: 'مرشحون غير محسومين', value: s.undetermined },
            { label: 'شاغرة', value: s.vacant },
          ]}
        />
        <Dist title={opts.currentTitle} data={count(recs.map((r) => r.party))} ds={ds('officeholders')} />
        {opts.elected && <Dist title="المقاعد المطروحة للانتخاب حسب الحزب الحالي" data={count(recs.filter((r) => r.up).map((r) => r.party))} ds={ds('officeholders')} />}
        {opts.elected && <Dist title="المقاعد المفتوحة حسب الحزب الحالي" data={count(recs.filter((r) => r.open).map((r) => r.party))} ds={ds('candidates')} />}
        {opts.elected && <Dist title="المرشحون الرسميون المعلنون حسب الحزب" data={count(recs.flatMap((r) => r.candidates))} ds={ds('candidates')} unit="مرشح" />}
        {opts.elected && <Dist title="المقاعد التنافسية حسب الحزب الحالي (وفق التصنيفات)" data={count(recs.filter((r) => r.competitive).map((r) => r.party))} ds={ds('forecasts')} />}
      </>
    )
  }

  return (
    <div className="stats">
      {!meta && <p className="muted">جارٍ تحميل الإحصائيات…</p>}
      {mode === 'gov' && gov && section('إحصاءات حكام الولايات', govRecs, { elected: true, currentTitle: 'حكام الولايات حسب الحزب' })}
      {mode === 'sen' && sen && section('إحصاءات مجلس الشيوخ', senRecs, { elected: true, currentTitle: 'مقاعد مجلس الشيوخ حسب الحزب (100 مقعد)' })}
      {mode === 'house' && (
        <>
          {h119 && section('مجلس النواب: التوزيع الحالي (الكونغرس 119)', h119Recs, { currentTitle: 'التمثيل الحالي حسب الحزب (المقاعد الشاغرة غير محتسبة)' })}
          {h120 && houseMap === 120 && section('مجلس النواب: انتخابات 2026', h120Recs, { elected: true, currentTitle: 'الحزب المدافع عن كل دائرة (خريطة 2026)' })}
          {houseMap === 119 && <p className="notice small">للاطلاع على إحصاءات سباقات 2026 (مفتوحة/تنافسية/مرشحون) بدّل خريطة مجلس النواب إلى «انتخابات 2026».</p>}
        </>
      )}
      {mode === 'scen' && (
        <>
          {gov && section('الحكام: الوضع الحالي ومطروح 2026', govRecs, { elected: true, currentTitle: 'حكام الولايات حسب الحزب' })}
          {sen && section('الشيوخ: الوضع الحالي ومطروح 2026', senRecs, { elected: true, currentTitle: 'مقاعد مجلس الشيوخ حسب الحزب' })}
          <p className="notice small">نتائج السيناريوهات نفسها معروضة في تبويب «السيناريو».</p>
        </>
      )}
    </div>
  )
}
