import { useEffect, useRef } from 'react'
import { DATA_TYPE_AR, fmtDate, fmtDateTime } from '../labels'
import type { Meta } from '../types'
import { DataType } from './ui'

export default function SourcesDialog({ meta, onClose }: { meta: Meta; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const q = meta.quality
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="المصادر وجودة البيانات" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>المصادر وجودة البيانات</h2>
          <button type="button" className="btn" onClick={onClose}>إغلاق ✕</button>
        </div>
        <p className="notice">{meta.update_mode}. آخر بناء للبيانات: {fmtDateTime(meta.build.generated_at)} · آخر جلب: {fmtDateTime(meta.build.fetched_at)}.</p>

        <h3>مجموعات البيانات وتواريخ تحديثها</h3>
        <div className="table-scroll">
          <table className="tbl">
            <thead><tr><th>المجموعة</th><th>سريان البيانات</th><th>آخر تحقق ناجح</th><th>السجلات</th><th>الحالة</th></tr></thead>
            <tbody>
              {meta.datasets.map((d) => (
                <tr key={d.name}>
                  <td>{d.label}</td>
                  <td>{fmtDate(d.updated_at)}</td>
                  <td>{fmtDateTime(d.verified_at)}</td>
                  <td>{d.row_count}</td>
                  <td>{d.status === 'failed' ? <span className="warn">⚠ فشل التحديث الأخير: {d.message}</span> : d.stale ? <span className="warn">⚠ متأخر ({d.age_days} يوم)</span> : '✓ سليم'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>المصادر</h3>
        <ul className="src-list">
          {meta.sources.map((s) => (
            <li key={s.id}>
              <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name_ar}</a> <DataType type={s.kind} />
              <div className="small muted">سريان: {fmtDate(s.valid_as_of)} · تحقق: {fmtDate(s.verified_at)}</div>
              {s.note && <div className="small">{s.note}</div>}
            </li>
          ))}
        </ul>

        <h3>أنواع المعلومات</h3>
        <ul className="plain small">
          {Object.entries(DATA_TYPE_AR).map(([k, v]) => <li key={k}><DataType type={k} /> {v}</li>)}
        </ul>

        <h3>تقارير الجودة</h3>
        {q.conflicts && q.conflicts.length > 0 ? (
          <ul>{q.conflicts.map((c, i) => <li key={i}>{c.office_id}: الرسمي «{c.official}» مقابل «{c.other}» — {c.note}</li>)}</ul>
        ) : <p className="small">لا اختلافات في هوية الشاغلين بين المصادر عند آخر بناء.</p>}
        {q.warnings && q.warnings.length > 0 ? <ul>{q.warnings.map((w, i) => <li key={i} className="warn">{w}</li>)}</ul> : <p className="small">لا تحذيرات في عملية الاستيراد.</p>}
        <h3>القوائم الرسمية للمرشحين من هيئات الولايات</h3>
        {q.state_sources && q.state_sources.length > 0 ? (
          <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>الولاية</th><th>تاريخ الوثيقة</th><th>مرشحون رسميون</th><th>مطابقون للمصدر الثانوي</th><th>مضافون من الرسمي</th><th>مستبعدون (غير مدرجين رسميًا)</th><th>اختلاف حزب</th></tr></thead>
              <tbody>
                {q.state_sources.map((s) => (
                  <tr key={s.source_id}><td>{s.state}</td><td>{fmtDate(s.document_date)}</td><td>{s.official_candidates}</td><td>{s.matched}</td><td>{s.only_official}</td><td>{s.only_secondary}</td><td>{s.party_conflicts}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="small">لا قوائم رسمية من الولايات في هذا البناء.</p>}
        <p className="small muted">باقي الولايات تعتمد على المصدر الثانوي (ويكيبيديا) إلى أن تُضاف محوّلاتها (انظر README).</p>
        {q.candidate_discrepancies && q.candidate_discrepancies.length > 0 && (
          <details>
            <summary>اختلافات بين الرسمي والثانوي ({q.candidate_discrepancies.length})</summary>
            <ul className="small">{q.candidate_discrepancies.map((d, i) => <li key={i}>{d.election_id}: {d.name ?? '—'} — {d.note}</li>)}</ul>
          </details>
        )}
        <p className="small muted">{meta.forecast_note}</p>
      </div>
    </div>
  )
}
