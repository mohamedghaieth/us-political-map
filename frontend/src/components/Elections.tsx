import { useMemo, useState } from 'react'
import { GROUP_SHORT, districtLabel, fmtDate, groupOf, personName } from '../labels'
import type { Group, GovernorRow, HouseRow120, Mode, SenateRow } from '../types'
import { PartyBadge } from './ui'

export interface Contest {
  key: string
  office: 'gov' | 'sen' | 'house'
  label: string
  sub: string
  date: string
  daysLeft: number
  party: Group
  open: boolean
  competitive: boolean
  undetermined: boolean
  candidates: number
  special: boolean
  primary: string | null
  target: { mode: Mode; id: string; map?: 119 | 120 }
  incumbent: string
  incumbentStatus: string
}

const OFFICE_AR = { gov: 'حاكم', sen: 'شيوخ', house: 'نواب' } as const

export function buildContests(gov: GovernorRow[] | null, sen: SenateRow[] | null, h120: HouseRow120[] | null): Contest[] {
  const out: Contest[] = []
  for (const r of gov ?? []) {
    const e = r.election
    if (!e) continue
    out.push({ key: e.id, office: 'gov', label: `حاكم ${r.state.name_ar}`, sub: r.holder.person ? personName(r.holder.person) : '—', date: e.date, daysLeft: e.days_until, party: groupOf(r.holder.party), open: e.is_open, competitive: e.competitive_by.length > 0, undetermined: e.candidates_undetermined, candidates: e.candidates.length, special: false, primary: e.primary_date, target: { mode: 'gov', id: r.state.abbr }, incumbent: personName(r.holder.person), incumbentStatus: e.incumbent_status })
  }
  for (const r of sen ?? []) {
    const e = r.election
    if (!e) continue
    out.push({ key: e.id, office: 'sen', label: `شيوخ ${r.state.name_ar} (فئة ${r.senate_class})`, sub: personName(r.holder.person), date: e.date, daysLeft: e.days_until, party: groupOf(r.holder.party), open: e.is_open, competitive: e.competitive_by.length > 0, undetermined: e.candidates_undetermined, candidates: e.candidates.length, special: e.kind === 'special', primary: e.primary_date, target: { mode: 'sen', id: r.state.abbr }, incumbent: personName(r.holder.person), incumbentStatus: e.incumbent_status })
  }
  for (const r of h120 ?? []) {
    const e = r.election
    if (!e) continue
    out.push({ key: e.id, office: 'house', label: districtLabel(r.state.name_ar, r.district, r.at_large, r.delegate), sub: e.incumbents.map((i) => i.name).join('، ') || 'لا شاغل مرتبط', date: e.date, daysLeft: e.days_until, party: groupOf(e.defending_party), open: e.is_open, competitive: e.competitive_by.length > 0, undetermined: e.candidates_undetermined, candidates: e.candidates.length, special: false, primary: e.primary_date, target: { mode: 'house', id: r.geoid, map: 120 }, incumbent: e.incumbents.map((i) => i.name).join('، '), incumbentStatus: e.incumbent_status })
  }
  return out
}

type SeatF = 'all' | 'R' | 'D' | 'open' | 'undetermined' | 'competitive'
const PAGE = 40

export default function Elections({ contests, onPick, refDate }: { contests: Contest[]; onPick: (c: Contest) => void; refDate: string }) {
  const [office, setOffice] = useState<'all' | 'gov' | 'sen' | 'house'>('all')
  const [seat, setSeat] = useState<SeatF>('all')
  const [limit, setLimit] = useState(PAGE)

  const counts = useMemo(() => {
    const voting = contests.filter((c) => !c.label.includes('مندوب'))
    return {
      gov: contests.filter((c) => c.office === 'gov').length,
      sen: contests.filter((c) => c.office === 'sen').length,
      house: voting.filter((c) => c.office === 'house').length,
      delegates: contests.filter((c) => c.office === 'house').length - voting.filter((c) => c.office === 'house').length,
    }
  }, [contests])

  const list = useMemo(
    () =>
      contests
        .filter((c) => (office === 'all' ? true : c.office === office))
        .filter((c) => {
          switch (seat) {
            case 'R': return c.party === 'R'
            case 'D': return c.party === 'D'
            case 'open': return c.open
            case 'undetermined': return c.undetermined
            case 'competitive': return c.competitive
            default: return true
          }
        }),
    [contests, office, seat],
  )

  const chip = <T extends string>(cur: T, set: (v: T) => void, v: T, label: string) => (
    <button type="button" className={cur === v ? 'on' : ''} aria-pressed={cur === v} onClick={() => { set(v); setLimit(PAGE) }}>{label}</button>
  )

  return (
    <div className="elections">
      <h2 className="panel-h">الانتخابات الأمريكية القادمة</h2>
      <p className="muted small">التاريخ المرجعي للنظام: {fmtDate(refDate)}. تتغير المواعيد والمراحل (قادم/انتهى) تلقائيًا بتغيّر هذا التاريخ.</p>
      <div className="tiles">
        <div className="tile"><strong>{counts.gov}</strong><span>حكام ولايات</span></div>
        <div className="tile"><strong>{counts.sen}</strong><span>مقاعد شيوخ</span></div>
        <div className="tile"><strong>{counts.house}</strong><span>مقاعد نواب</span></div>
        <div className="tile"><strong>{counts.delegates}</strong><span>مندوبون بلا تصويت</span></div>
      </div>
      <p className="small muted">المقاعد المحسومة في هذه الدورة: {counts.gov + counts.sen + counts.house} منصبًا تصويتيًا. الانتخابات التمهيدية: تواريخها متاحة في هذه النسخة لمقاعد مجلس الشيوخ فقط وهي منتهية.</p>

      <div className="chips" role="group" aria-label="نوع المنصب">
        {chip(office, setOffice, 'all', 'كل المقاعد المطروحة')}
        {chip(office, setOffice, 'gov', 'الحكام')}
        {chip(office, setOffice, 'sen', 'الشيوخ')}
        {chip(office, setOffice, 'house', 'النواب')}
      </div>
      <div className="chips" role="group" aria-label="حالة المقعد">
        {chip(seat, setSeat, 'all', 'الكل')}
        {chip(seat, setSeat, 'R', 'يسيطر عليها الجمهوريون حاليًا')}
        {chip(seat, setSeat, 'D', 'يسيطر عليها الديمقراطيون حاليًا')}
        {chip(seat, setSeat, 'open', 'مقاعد مفتوحة')}
        {chip(seat, setSeat, 'undetermined', 'مرشحون لم يُحسموا')}
        {chip(seat, setSeat, 'competitive', 'منافسة متقاربة (وفق جهات محددة)')}
      </div>
      <p className="small">النتائج: <b>{list.length}</b> مقعد. <span className="muted">«مفتوح» = الشاغل لن يترشح؛ «مرشحون لم يُحسموا» = لا مرشحين مدرجين أو جولة إعادة؛ «المنافسة» = تصنيف جهة خارجية وليس نتيجة.</span></p>

      <div className="table-scroll">
        <table className="tbl">
          <caption className="sr-only">قائمة المقاعد المطروحة</caption>
          <thead>
            <tr><th>المقعد</th><th>الشاغل</th><th>الحزب</th><th>الموعد</th><th>علامات</th></tr>
          </thead>
          <tbody>
            {list.slice(0, limit).map((c) => (
              <tr key={c.key}>
                <td><button type="button" className="link-btn" onClick={() => onPick(c)}>{c.label}</button>{c.special && <span className="chip chip-open">خاص</span>}</td>
                <td className="small">{c.sub}</td>
                <td><PartyBadge party={c.party === 'D' ? 'D' : c.party === 'R' ? 'R' : c.party === 'I' ? 'I' : 'U'} /></td>
                <td className="small">{fmtDate(c.date)}{c.primary && <><br /><span className="muted">تمهيدية: {fmtDate(c.primary)}</span></>}</td>
                <td className="small">
                  {c.open && <span className="chip chip-open" title="مقعد مفتوح">◩ مفتوح</span>}
                  {c.competitive && <span className="chip chip-comp" title="تنافسي وفق جهة خارجية">◈ تنافسي</span>}
                  {c.undetermined && <span className="chip">؟ غير محسوم</span>}
                  <span className="muted"> {c.candidates} مرشح</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {limit < list.length && <button type="button" className="more" onClick={() => setLimit(limit + PAGE * 3)}>عرض المزيد ({list.length - limit})</button>}
      {list.length === 0 && <p className="empty">لا توجد مقاعد تطابق هذه الفلاتر.</p>}
    </div>
  )
}

export { GROUP_SHORT }
