import { INCUMBENT_STATUS_AR, SEAT_STATUS_AR, districtLabel, fmtDate, personName } from '../labels'
import type { ElectionView, GovernorRow, HouseRow119, HouseRow120, Holder, SenateRow } from '../types'
import { CandidateList, DataType, ElectionSummary, ForecastTable, Photo, PartyBadge, Section, SourceLine } from './ui'

function HolderCard({ holder, title, extra }: { holder: Holder; title: string; extra?: React.ReactNode }) {
  if (holder.vacant || !holder.person) {
    return (
      <Section title={title}>
        <p><span className="badge badge-U"><span className="sym">؟</span>شاغر</span> لا يوجد شاغل حالي للمقعد في قاعدة البيانات الرسمية. <em className="muted">(المقعد الشاغر يختلف عن المقعد المفتوح انتخابيًا.)</em></p>
        <SourceLine source={holder.source} />
      </Section>
    )
  }
  const p = holder.person
  return (
    <Section title={title}>
      <div className="holder">
        <Photo url={p.photo_url} alt={`صورة ${p.name_ar ?? p.name_en}`} />
        <div>
          <p className="holder-name">{p.name_ar ?? p.name_en}</p>
          {p.name_ar && <p className="muted ltr">{p.name_en}</p>}
          <p>
            <PartyBadge party={holder.party} full />
            {holder.meta?.caucus && holder.party === 'I' && <span className="muted small"> · يصوّت ضمن كتلة الحزب {holder.meta.caucus === 'D' ? 'الديمقراطي' : 'الجمهوري'}</span>}
          </p>
          <p className="links small">
            {p.website && <a href={p.website} target="_blank" rel="noopener noreferrer">الموقع الرسمي ↗</a>}
            {p.profile_url && <a href={p.profile_url} target="_blank" rel="noopener noreferrer">السجل الرسمي في الكونغرس ↗</a>}
            {p.wikipedia && <a href={p.wikipedia} target="_blank" rel="noopener noreferrer">ويكيبيديا ↗</a>}
          </p>
        </div>
      </div>
      {extra}
      <SourceLine source={holder.source} />
      <p className="small muted">
        بيانات {holder.completeness === 'partial' ? 'جزئية' : 'مكتملة'} · نوعها: <DataType type={holder.data_type} />
      </p>
    </Section>
  )
}

function IncumbentStatus({ e }: { e: ElectionView }) {
  return (
    <p>
      <strong>موقف الشاغل الحالي من الانتخابات القادمة:</strong> {INCUMBENT_STATUS_AR[e.incumbent_status] ?? e.incumbent_status}
      {e.status_text && <span className="muted small ltr"> · المصدر: «{e.status_text}»</span>}
      <br />
      <span className="muted small">عدم إعلان الموقف لا يعني الانسحاب، وانتهاء الفترة الدستورية لا يعني عدم الترشح.</span>
    </p>
  )
}

export function ElectionBlock({ e, showIncumbent = true }: { e: ElectionView; showIncumbent?: boolean }) {
  return (
    <>
      <Section title="الانتخابات القادمة" note={e.results_note ?? undefined}>
        <ElectionSummary e={e} />
        <p>
          {e.is_open ? <span className="chip chip-open">◩ مقعد مفتوح (الشاغل لن يترشح)</span> : <span className="chip">الشاغل ضمن المنافسة أو غير محسوم</span>}{' '}
          {e.competitive_by.length > 0 && <span className="chip chip-comp">◈ تنافسي وفق {e.competitive_by.length} من الجهات</span>}{' '}
          {e.uncontested && <span className="chip">مرشح واحد معلن فقط</span>}{' '}
          {e.candidates_undetermined && <span className="chip chip-open">مرشحون غير محسومين</span>}
        </p>
        {showIncumbent && <IncumbentStatus e={e} />}
        {e.pvi && <p className="small muted">مؤشر الميل الحزبي للدائرة (Cook PVI): <span className="ltr">{e.pvi}</span></p>}
        <SourceLine source={e.source} label="مصدر المواعيد والحالة" />
        {(e.candidate_sources ?? []).filter((s) => s.kind === 'official').map((s) => <SourceLine key={s.id} source={s} label="مصدر المرشحين (رسمي)" />)}
        {(e.candidate_sources ?? []).length > 0 && !(e.candidate_sources ?? []).some((s) => s.kind === 'official') && <p className="small muted">قائمة المرشحين من مصدر ثانوي؛ لم تُربط بعد بالقائمة الرسمية لهذه الولاية.</p>}
      </Section>
      <Section title="المرشحون الرسميون المعلنون" note="المرشحون المدرجون على بطاقة الاقتراع العامة وفق هيئات الانتخابات في الولاية كما جمعها المصدر.">
        <CandidateList list={e.candidates} empty="لا توجد أسماء مرشحين معلنة في المصدر حتى الآن." />
        {e.dropped_candidates.length > 0 && (
          <details>
            <summary>مرشحون لم يعودوا مدرجين ({e.dropped_candidates.length})</summary>
            <CandidateList list={e.dropped_candidates} empty="" />
          </details>
        )}
      </Section>
      <Section title="المرشحون المحتملون (غير مؤكَّد ترشحهم)" note="ترشح هؤلاء غير مؤكد ولا يُعدّون مرشحين رسميين.">
        <CandidateList list={e.potential_candidates} empty="لا توجد قائمة مرشحين محتملين في مصادر هذه النسخة: بعد انتهاء الانتخابات التمهيدية تصبح القوائم نهائية. لا نضيف أسماء غير موثّقة." />
      </Section>
      <Section title={<>تصنيفات الجهات الخارجية <DataType type="estimate" /></>}>
        <ForecastTable forecasts={e.forecasts} note={e.forecast_note} />
      </Section>
    </>
  )
}

export function GovernorDetails({ row }: { row: GovernorRow }) {
  const h = row.holder
  const e = row.election
  return (
    <div className="details">
      <header className="dh">
        <h2>{row.state.name_ar} <span className="muted ltr">{row.state.name_en}</span></h2>
        <p className="muted">العاصمة: {row.state.capital_ar} <span className="ltr">({row.state.capital_en})</span></p>
      </header>
      <HolderCard
        holder={h}
        title="الحاكم الحالي"
        extra={
          <dl className="kv">
            <dt>تاريخ تولي المنصب</dt>
            <dd>{fmtDate(h.term_start)}</dd>
            <dt>نهاية الفترة الدستورية الحالية</dt>
            <dd>{h.meta.term_end_year ? `${h.meta.term_end_year}${h.meta.term_end_text?.includes('limit') ? ' (حدّ الفترات)' : ''}` : 'غير متوفر'} <span className="muted small">(سنة فقط في المصدر)</span></dd>
            <dt>تولي الحاكم الجديد منصبه</dt>
            <dd className="muted">غير متوفر في المصادر المعتمدة (يحدده دستور الولاية، وهو منفصل عن موعد الاقتراع)</dd>
          </dl>
        }
      />
      {e ? (
        <ElectionBlock e={e} />
      ) : (
        <Section title="الانتخابات القادمة">
          <p>لا يُنتخب حاكم هذه الولاية في 2026. الانتخابات المقبلة عام <strong>{row.next_election_year ?? 'غير متوفر'}</strong>.</p>
          <p className="muted small">لا تتوفر في هذه النسخة قوائم مرشحين أو تصنيفات لتلك الدورة، ولن نخترع أسماء أو تواريخ.</p>
        </Section>
      )}
    </div>
  )
}

export function SenateDetails({ rows }: { rows: SenateRow[] }) {
  const st = rows[0].state
  return (
    <div className="details">
      <header className="dh">
        <h2>{st.name_ar} <span className="muted ltr">{st.name_en}</span></h2>
        <p className="muted">مقعدان في مجلس الشيوخ، من فئتين انتخابيتين مختلفتين (فترة كل عضو 6 سنوات).</p>
      </header>
      {rows.map((r) => (
        <div key={r.office_id} className="seat-block">
          <h3 className="seat-title">
            مقعد الفئة {r.senate_class}{' '}
            <span className={`chip ${r.seat_status === 'up' ? 'chip-up' : ''}`}>{r.seat_status === 'up' ? '▣ ' : ''}{SEAT_STATUS_AR[r.seat_status]}{r.seat_status === 'up' ? ' في 2026' : ''}</span>
            {r.election?.kind === 'special' && <span className="chip chip-open">انتخاب خاص</span>}
          </h3>
          <HolderCard
            holder={r.holder}
            title="عضو مجلس الشيوخ"
            extra={
              <dl className="kv">
                <dt>بداية الفترة الحالية</dt>
                <dd>{fmtDate(r.holder.term_start)}</dd>
                <dt>نهاية الفترة الحالية</dt>
                <dd>{fmtDate(r.holder.term_end)}</dd>
                <dt>الانتخابات المرتبطة بالمقعد</dt>
                <dd>{r.seat_status === 'up' ? `${fmtDate(r.election!.date)}` : `الدورة القادمة لهذه الفئة: ${r.next_election_year}`}</dd>
              </dl>
            }
          />
          {r.election ? (
            <ElectionBlock e={r.election} />
          ) : (
            <p className="notice small">المقعد غير مطروح في دورة 2026، وانتهاء/استمرار فترة العضو لا يعني شغور المقعد.</p>
          )}
        </div>
      ))}
    </div>
  )
}

export function House119Details({ row, onGoto2026 }: { row: HouseRow119; onGoto2026: (geoid: string) => void }) {
  const r = row.running_2026
  return (
    <div className="details">
      <header className="dh">
        <h2>{districtLabel(row.state.name_ar, row.district, row.at_large, row.delegate)}</h2>
        <p className="muted small">حدود الدائرة: الكونغرس الـ119 (التي يمثّلها الأعضاء الحاليون حتى 3 يناير 2027)</p>
      </header>
      <HolderCard
        holder={row.holder}
        title="الممثل الحالي"
        extra={
          <dl className="kv">
            <dt>بداية الفترة الحالية</dt>
            <dd>{fmtDate(row.holder.term_start)}</dd>
            <dt>نهاية الفترة الحالية</dt>
            <dd>{fmtDate(row.holder.term_end)}</dd>
          </dl>
        }
      />
      {!row.holder.vacant && (
        <Section title="الترشح في انتخابات 2026">
          {r ? (
            <>
              <p>
                {INCUMBENT_STATUS_AR[r.incumbent_status] ?? r.incumbent_status}
                {r.status_text && <span className="muted small ltr"> · «{r.status_text}»</span>}
              </p>
              <p>
                الدائرة في خريطة 2026: <strong>{r.geoid}</strong>{' '}
                <button type="button" className="link-btn" onClick={() => onGoto2026(r.geoid)}>عرض تفاصيل السباق على خريطة 2026 ←</button>
              </p>
              <p className="notice small">قد تختلف حدود ورقم الدائرة في 2026 عن الدائرة الحالية بسبب إعادة التقسيم في بعض الولايات.</p>
            </>
          ) : (
            <p className="muted">لم يُعثر على سباق مرتبط بهذا العضو في خريطة 2026 (قد لا يترشح أو لم يُطابَق الاسم في المصدر). لا يُعدّ ذلك دليلًا على الانسحاب.</p>
          )}
        </Section>
      )}
    </div>
  )
}

export function House120Details({ row }: { row: HouseRow120 }) {
  const e = row.election
  return (
    <div className="details">
      <header className="dh">
        <h2>{districtLabel(row.state.name_ar, row.district, row.at_large, row.delegate)}</h2>
        <p className="muted small">حدود الدائرة: خريطة انتخابات 2026 (الكونغرس الـ120)</p>
      </header>
      {e ? (
        <>
          <Section title="الشاغل/الشاغلون المرتبطون بالدائرة" note="الدوائر الجديدة قد تضم شاغلًا واحدًا أو أكثر أو لا أحد.">
            {e.incumbents.length ? (
              <ul className="cand-list">
                {e.incumbents.map((i) => (
                  <li key={i.name}>
                    <PartyBadge party={i.party} />
                    <span>{i.name}</span>
                    {i.note && <span className="muted small ltr">{i.note}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">لا يوجد شاغل حالٍ مرتبط بهذه الدائرة (مقعد جديد أو شاغر).</p>
            )}
            {e.defending_party && <p className="small">الحزب المدافع عن المقعد: <PartyBadge party={e.defending_party} full /></p>}
          </Section>
          <ElectionBlock e={e} />
        </>
      ) : (
        <p className="muted">لا تتوفر بيانات انتخابية لهذه الدائرة.</p>
      )}
    </div>
  )
}

export { personName }
