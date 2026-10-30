import { useEffect, useState, type ReactNode } from 'react'
import { DATA_TYPE_AR, DATA_TYPE_CLASS, GROUP_LABEL, GROUP_SHORT, GROUP_SYMBOL, PARTY_NAME_AR, daysText, fmtDate, groupOf, personName } from '../labels'
import type { Candidate, ElectionView, Forecast, PartyCode, SourceInfo } from '../types'

export function PartyBadge({ party, full }: { party: PartyCode | null | undefined; full?: boolean }) {
  const g = groupOf(party)
  return (
    <span className={`badge badge-${g}`} title={party ? PARTY_NAME_AR[party] ?? GROUP_LABEL[g] : GROUP_LABEL[g]}>
      <span aria-hidden="true" className="sym">{GROUP_SYMBOL[g]}</span>
      {full ? (party ? PARTY_NAME_AR[party] ?? GROUP_LABEL[g] : GROUP_LABEL[g]) : GROUP_SHORT[g]}
    </span>
  )
}

export function DataType({ type }: { type: string }) {
  return <span className={`chip ${DATA_TYPE_CLASS[type] ?? ''}`}>{DATA_TYPE_AR[type] ?? type}</span>
}

export function SourceLine({ source, label }: { source: SourceInfo | null | undefined; label?: string }) {
  if (!source) return null
  return (
    <p className="source-line">
      <span className="muted">{label ?? 'المصدر'}:</span>{' '}
      <a href={source.url} target="_blank" rel="noopener noreferrer">{source.name_ar}</a> <DataType type={source.kind} />
      <span className="muted"> · تاريخ سريان المعلومة: {fmtDate(source.valid_as_of)} · آخر تحقق: {fmtDate(source.verified_at)}</span>
    </p>
  )
}

export function Section({ title, children, note }: { title: ReactNode; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      {note && <p className="muted small">{note}</p>}
      {children}
    </section>
  )
}

export function Photo({ url, alt }: { url: string | null | undefined; alt: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])
  if (!url || failed) return <div className="photo photo-empty" role="img" aria-label="لا تتوفر صورة موثوقة">لا صورة</div>
  return <img className="photo" src={url} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
}

export function CandidateList({ list, empty }: { list: Candidate[]; empty: string }) {
  if (!list.length) return <p className="muted">{empty}</p>
  return (
    <ul className="cand-list">
      {list.map((c) => (
        <li key={c.name_en + c.party}>
          <PartyBadge party={c.party} />
          <span className="cand-name">
            {personName(c)}
            {c.is_incumbent && <span className="chip chip-inc" title="شاغل المنصب حاليًا">شاغل المنصب</span>}
            {c.data_type === 'official' && <span className="chip dt-official" title="مدرج في القائمة الرسمية المعتمدة لهيئة الانتخابات في الولاية">✓ قائمة رسمية</span>}
          </span>
          {c.party_label && !['Democratic', 'Republican'].includes(c.party_label) && <span className="muted small">({c.party_label})</span>}
          {c.fec_url && (
            <a className="small" href={c.fec_url} target="_blank" rel="noopener noreferrer" title="سجل المرشح لدى لجنة الانتخابات الفيدرالية">FEC</a>
          )}
        </li>
      ))}
    </ul>
  )
}

export function ForecastTable({ forecasts, note }: { forecasts: Forecast[]; note: string }) {
  if (!forecasts.length) return <p className="muted">لا توجد تصنيفات منشورة لهذا السباق في المصادر المعتمدة. لا نعرض توقعًا دون مصدر.</p>
  return (
    <>
      <div className="table-scroll">
        <table className="tbl">
          <caption className="sr-only">تصنيفات الجهات الخارجية</caption>
          <thead>
            <tr>
              <th>الجهة</th>
              <th>التصنيف</th>
              <th>تاريخ النشر</th>
            </tr>
          </thead>
          <tbody>
            {forecasts.map((f) => (
              <tr key={f.forecaster}>
                <td>{f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.name}</a> : f.name}</td>
                <td>
                  <span className={`rate rate-${f.party ?? 'T'}`}>
                    {f.party ? <PartyBadge party={f.party} /> : <span className="badge badge-U"><span className="sym">≈</span>متقارب</span>}
                    <span className="small">{f.level_ar}{f.flip ? ' · احتمال تغيّر الحزب' : ''}</span>
                  </span>
                  <span className="muted small ltr"> {f.label}</span>
                </td>
                <td>{fmtDate(f.published_on)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="notice small">⚠ {note}</p>
    </>
  )
}

export function ElectionSummary({ e }: { e: ElectionView }) {
  return (
    <dl className="kv">
      <dt>موعد الانتخابات العامة{e.kind === 'special' ? ' (انتخاب خاص)' : ''}</dt>
      <dd>
        {fmtDate(e.date)} <span className="chip">{e.phase === 'ended' ? 'انتهى الاقتراع' : daysText(e.days_until)}</span>
      </dd>
      {e.primary_date && (<><dt>الانتخابات التمهيدية</dt><dd>{fmtDate(e.primary_date)}</dd></>)}
      {e.runoff_date && (<><dt>جولة الإعادة التمهيدية</dt><dd>{fmtDate(e.runoff_date)}</dd></>)}
      {e.filing_deadline && (<><dt>آخر موعد لتقديم الترشيحات</dt><dd>{fmtDate(e.filing_deadline)}</dd></>)}
    </dl>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}
