import { geoAlbersUsa, geoPath } from 'd3-geo'
import type { GeometryCollection, Topology } from 'topojson-specification'
import { feature } from 'topojson-client'

export const VIEW_W = 975
export const VIEW_H = 610

export interface Shape {
  id: string // state abbreviation (states layer) or GEOID (district layer)
  stateFips: string
  d: string
  cx: number
  cy: number
  bounds: [[number, number], [number, number]]
  name?: string
}

export interface MapGeo {
  districts: Shape[]
  states: Shape[]
}

const FIPS_ABBR: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC',
  '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY',
  '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT',
  '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
  '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY',
}
export const abbrOfFips = (f: string) => FIPS_ABBR[f]

const cache = new Map<string, Promise<MapGeo>>()

/** Loads a TopoJSON file and projects it with Albers USA (Alaska/Hawaii insets). Territories are not drawn. */
export function loadGeo(url: string): Promise<MapGeo> {
  let p = cache.get(url)
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`تعذّر تحميل ملف الخريطة (${r.status})`)
        return r.json() as Promise<Topology>
      })
      .then(buildGeo)
    p.catch(() => cache.delete(url))
    cache.set(url, p)
  }
  return p
}

function buildGeo(topo: Topology): MapGeo {
  const statesFc = feature(topo, topo.objects.states as GeometryCollection) as GeoJSON.FeatureCollection
  const distFc = feature(topo, topo.objects.districts as GeometryCollection) as GeoJSON.FeatureCollection
  const projection = geoAlbersUsa().fitSize([VIEW_W, VIEW_H], {
    type: 'FeatureCollection',
    features: statesFc.features.filter((f) => FIPS_ABBR[String((f.properties as any).STATEFP)] && (f.properties as any).STATEFP !== '11'),
  } as GeoJSON.FeatureCollection)
  const path = geoPath(projection)
  const toShape = (f: GeoJSON.Feature, id: string): Shape | null => {
    const d = path(f)
    if (!d) return null // territories fall outside Albers USA
    const [cx, cy] = path.centroid(f)
    return { id, stateFips: String((f.properties as any).STATEFP), d, cx, cy, bounds: path.bounds(f) as any, name: (f.properties as any).NAMELSAD }
  }
  const states: Shape[] = []
  for (const f of statesFc.features) {
    const fips = String((f.properties as any).STATEFP)
    const abbr = FIPS_ABBR[fips]
    if (!abbr) continue
    const s = toShape(f, abbr)
    if (s) states.push(s)
  }
  const districts: Shape[] = []
  for (const f of distFc.features) {
    const s = toShape(f, String((f.properties as any).GEOID))
    if (s && FIPS_ABBR[s.stateFips]) districts.push(s)
  }
  return { states, districts }
}
