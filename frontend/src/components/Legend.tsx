import type { Level, } from '../scenario'
import type { Mode } from '../types'

const Sw = ({ bg, children, border }: { bg: string; children?: React.ReactNode; border?: string }) => (
  <span className="sw" style={{ background: bg, border: border ?? '1px solid rgba(0,0,0,.2)' }} aria-hidden="true">{children}</span>
)

/** Fixed key explaining every color, symbol and pattern used on the map. Color is never the only cue. */
export default function Legend({ mode, houseMap, level }: { mode: Mode; houseMap: 119 | 120; level: Level }) {
  const scen = mode === 'scen'
  return (
    <details className="legend" open>
      <summary>مفتاح الألوان والرموز</summary>
      <ul>
        <li><Sw bg="#1f5fbf">D</Sw> الحزب الديمقراطي (أزرق)</li>
        <li><Sw bg="#c8202f">R</Sw> الحزب الجمهوري (أحمر)</li>
        <li><Sw bg="repeating-linear-gradient(45deg,#6b7280 0 3px,#9aa1ad 3px 6px)">◇</Sw> مستقل (رمادي مخطط) · <Sw bg="radial-gradient(circle,#c7ccd5 1.5px,#6b7280 2px)">◆</Sw> حزب آخر (رمادي منقّط)</li>
        <li><Sw bg="#cfd4dc">؟</Sw> بيانات غير متوفرة{scen ? ' / غير محسوم' : ''}</li>
        {(mode === 'sen' || (scen)) && <li><Sw bg="repeating-linear-gradient(135deg,#1f5fbf 0 5px,#c8202f 5px 10px)" /> ولاية بمقعدين من حزبين مختلفين</li>}
        {(mode === 'gov' || mode === 'sen' || scen) && <li><Sw bg="#fff" border="2px solid #111827" /> مطروح للانتخاب في 2026 (إطار أسود)</li>}
        {!(mode === 'house' && houseMap === 119) && <li><Sw bg="#fff" border="2px dashed #d97706" /> تنافسي وفق تصنيف جهة خارجية واحدة على الأقل (إطار أصفر متقطع) — ليس نتيجة</li>}
        {mode === 'house' && houseMap === 120 && <li><Sw bg="repeating-linear-gradient(45deg,#c8202f 0 3px,#fff 3px 5px)" /> مقعد مفتوح (الشاغل لن يترشح / مقعد جديد) — تهشير</li>}
        {mode === 'house' && houseMap === 119 && <li><Sw bg="radial-gradient(circle,#6b7280 1.2px,#e5e7eb 1.8px)" /> مقعد شاغر</li>}
        {scen && <li><Sw bg="radial-gradient(circle,#6b7280 1.2px,#e5e7eb 1.8px)" /> مقعد غير محسوم في السيناريو (Toss-up)</li>}
        {scen && <li className="muted">المستوى المعروض: {level === 'current' ? 'رسمي' : level === 'base' ? 'تقدير جهة خارجية' : 'محاكاة افتراضية'}</li>}
      </ul>
    </details>
  )
}
