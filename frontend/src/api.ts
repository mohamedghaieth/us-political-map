import type { GovernorRow, HouseRow119, HouseRow120, Meta, SearchHit, SenateRow } from './types'

async function getJson<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new Error('تعذّر الاتصال بالخادم. تأكد من تشغيل واجهة API ثم أعد المحاولة.')
  }
  if (!res.ok) throw new Error(`خطأ ${res.status} أثناء تحميل ${url}`)
  return res.json() as Promise<T>
}

export const api = {
  meta: () => getJson<Meta>('/api/meta'),
  governors: () => getJson<GovernorRow[]>('/api/governors'),
  senate: () => getJson<SenateRow[]>('/api/senate'),
  house119: () => getJson<HouseRow119[]>('/api/house?map=119'),
  house120: () => getJson<HouseRow120[]>('/api/house?map=120'),
  search: (q: string) => getJson<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`),
}
