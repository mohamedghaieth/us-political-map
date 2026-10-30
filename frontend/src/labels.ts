import type { Group, PartyCode } from './types'

export const PARTY_COLOR = { D: '#1f5fbf', R: '#c8202f', I: '#6b7280', O: '#6b7280', U: '#b6bcc6' } as const

export function groupOf(p: PartyCode | null | undefined): Group {
  if (p === 'D') return 'D'
  if (p === 'R') return 'R'
  if (p === 'I') return 'I'
  if (!p || p === 'U') return 'U'
  return 'O'
}

/** Symbol + text so that color is never the only carrier of meaning. */
export const GROUP_LABEL: Record<Group, string> = {
  D: 'الحزب الديمقراطي',
  R: 'الحزب الجمهوري',
  I: 'مستقل',
  O: 'حزب آخر',
  U: 'غير متوفر',
}
export const GROUP_SYMBOL: Record<Group, string> = { D: 'D', R: 'R', I: '◇', O: '◆', U: '؟' }
export const GROUP_SHORT: Record<Group, string> = { D: 'ديمقراطي', R: 'جمهوري', I: 'مستقل', O: 'آخر', U: 'غير متوفر' }

export const PARTY_NAME_AR: Record<string, string> = {
  D: 'الحزب الديمقراطي',
  R: 'الحزب الجمهوري',
  I: 'مستقل',
  L: 'الحزب الليبرتاري',
  G: 'حزب الخضر',
  O: 'حزب آخر',
  U: 'غير متوفر',
}

export const INCUMBENT_STATUS_AR: Record<string, string> = {
  running: 'أعلن الترشح لإعادة الانتخاب (مرشح رسمي)',
  retiring: 'أعلن عدم الترشح مجددًا',
  term_limited: 'انتهت ولايته الدستورية (لا يحق له الترشح)',
  lost_primary: 'خسر الانتخابات التمهيدية لحزبه',
  withdrawn: 'انسحب من السباق',
  ineligible: 'غير مؤهل للترشح (معيَّن مؤقتًا)',
  multiple: 'أكثر من شاغل حالي في الدائرة الجديدة',
  none: 'لا يوجد شاغل حالٍ للدائرة (مقعد جديد/شاغر)',
  unknown: 'لم يُعلن موقفه / غير محدد في المصدر',
}

export const SEAT_STATUS_AR: Record<string, string> = {
  up: 'مطروح للانتخاب',
  not_up: 'غير مطروح في هذه الدورة',
  vacant: 'شاغر',
}

export const DATA_TYPE_AR: Record<string, string> = {
  official: 'رسمي',
  announced: 'معلن',
  estimate: 'تقديري (جهة خارجية)',
  hypothetical: 'افتراضي (محاكاة)',
}
export const DATA_TYPE_CLASS: Record<string, string> = {
  official: 'dt-official',
  announced: 'dt-announced',
  estimate: 'dt-estimate',
  hypothetical: 'dt-hypo',
}

export const COMPLETENESS_AR: Record<string, string> = { complete: 'مكتملة', partial: 'جزئية' }

export const SENATE_CLASS_YEAR: Record<number, number> = { 1: 2030, 2: 2026, 3: 2028 }

const dateFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
const monthFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { year: 'numeric', month: 'long', timeZone: 'UTC' })

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return 'غير متوفر'
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso)
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d)
}
export function fmtMonth(iso: string | null | undefined): string {
  if (!iso) return 'غير متوفر'
  return monthFmt.format(new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso))
}
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return 'غير متوفر'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d) + ' ' + d.toISOString().slice(11, 16) + ' UTC'
}

export function districtLabel(stateAr: string, district: number, atLarge: boolean, delegate: boolean): string {
  if (delegate) return `${stateAr} — مندوب بلا حق التصويت`
  return atLarge ? `${stateAr} — دائرة واحدة (عن الولاية كلها)` : `${stateAr} — الدائرة ${district}`
}

export function daysText(days: number): string {
  if (days > 1) return `بعد ${days} أيام`
  if (days === 1) return 'غدًا'
  if (days === 0) return 'اليوم'
  return `انقضى منذ ${-days} ${-days === 1 ? 'يوم' : 'أيام'}`
}

export function personName(p: { name_ar: string | null; name_en: string } | null | undefined): string {
  if (!p) return '—'
  return p.name_ar ? `${p.name_ar} (${p.name_en})` : p.name_en
}
