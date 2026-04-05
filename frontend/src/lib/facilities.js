import { MAPBOX_TOKEN } from "./mapbox";

/**
 * Mapbox Search Box API (category + forward with types=poi).
 * Geocoding v5 forward + types=poi often returns [] for generic queries; Search Box returns real POIs.
 *
 * Bbox: west,south,east,north ≈ ±0.18° (~20 km at mid-latitudes).
 */
const SEARCH_BOX_BASE = "https://api.mapbox.com/search/searchbox/v1";
const BBOX_PAD = 0.18;
const MAX_DISTANCE_KM = 25;
const LIMIT_BBOX = 5;
const LIMIT_FALLBACK = 15;

function buildBbox(lng, lat) {
  const west = lng - BBOX_PAD;
  const south = lat - BBOX_PAD;
  const east = lng + BBOX_PAD;
  const north = lat + BBOX_PAD;
  return `${west},${south},${east},${north}`;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * POI features only, within MAX_DISTANCE_KM, sorted by distance; return closest.
 */
function pickClosestPoiWithinRadius(features, lat, lng) {
  const scored = (features ?? [])
    .filter((f) => f.properties?.feature_type === "poi")
    .filter((f) => Array.isArray(f.geometry?.coordinates))
    .map((f) => {
      const [pLng, pLat] = f.geometry.coordinates;
      return {
        f,
        d: haversineKm(lat, lng, pLat, pLng),
      };
    })
    .filter((x) => x.d <= MAX_DISTANCE_KM)
    .sort((a, b) => a.d - b.d);

  return scored[0] ?? null;
}

function featureToResult(cat, scored) {
  const { f, d } = scored;
  const p = f.properties;
  const [pLng, pLat] = f.geometry.coordinates;
  return {
    id: cat.id,
    label: cat.label,
    icon: cat.icon,
    color: cat.color,
    featureId: p.mapbox_id ?? `${cat.id}-${pLng}-${pLat}`,
    name: p.name_preferred || p.name || cat.label,
    address: p.full_address || p.place_formatted || p.name || cat.label,
    lat: pLat,
    lng: pLng,
    distanceKm: d,
  };
}

/**
 * @param {'category' | 'forward'} mode
 * @param {string} value — canonical category id OR forward query string
 */
async function fetchOneFacility(cat, lat, lng) {
  const bbox = buildBbox(lng, lat);
  const proximity = `${lng},${lat}`;

  const run = async (useBbox, limit) => {
    let url;
    if (cat.mode === "category") {
      url = new URL(`${SEARCH_BOX_BASE}/category/${encodeURIComponent(cat.value)}`);
    } else {
      url = new URL(`${SEARCH_BOX_BASE}/forward`);
      url.searchParams.set("q", cat.value);
      url.searchParams.set("types", "poi");
    }
    url.searchParams.set("access_token", MAPBOX_TOKEN);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("proximity", proximity);
    url.searchParams.set("language", "en");
    if (useBbox) url.searchParams.set("bbox", bbox);

    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.message) {
      console.warn("[facilities] Search Box:", data.message);
      return [];
    }
    return data.features ?? [];
  };

  let features = await run(true, LIMIT_BBOX);
  if (!features.length) {
    features = await run(false, LIMIT_FALLBACK);
  }

  const best = pickClosestPoiWithinRadius(features, lat, lng);
  if (!best) return null;
  return featureToResult(cat, best);
}

/** One row per UI category: Search Box category id or forward query. */
const FACILITY_DEFS = [
  { id: "grocery", label: "Grocery store", icon: "🛒", color: "#22c55e", mode: "category", value: "supermarket" },
  { id: "hospital", label: "Hospital", icon: "🏥", color: "#ef4444", mode: "category", value: "hospital" },
  { id: "restroom", label: "Restroom", icon: "🚻", color: "#64748b", mode: "forward", value: "restroom" },
  { id: "gas", label: "Gas station", icon: "⛽", color: "#f59e0b", mode: "category", value: "gas_station" },
  { id: "pharmacy", label: "Pharmacy", icon: "💊", color: "#3b82f6", mode: "category", value: "pharmacy" },
  { id: "ranger", label: "Ranger station", icon: "🌲", color: "#8b5cf6", mode: "forward", value: "ranger station" },
];

export const FACILITY_CATEGORIES = FACILITY_DEFS;

/**
 * Closest POI per category within 25 km of this campsite (not search center).
 * @param {number} lat WGS84 latitude of the selected campsite
 * @param {number} lng WGS84 longitude of the selected campsite
 */
export async function fetchNearbyFacilities(lat, lng) {
  const results = await Promise.all(
    FACILITY_DEFS.map((cat) => fetchOneFacility(cat, lat, lng).catch(() => null))
  );
  return results.filter(Boolean);
}

/** Shape expected by ResultsPage map markers + route picker. */
export function facilitiesToPoiMarkers(facilities) {
  return facilities.map((f) => ({
    id: f.featureId,
    name: f.name,
    category: f.label,
    color: f.color,
    emoji: f.icon,
    coordinates: [f.lng, f.lat],
    address: f.address,
    distanceKm: f.distanceKm,
    distanceLabel:
      typeof f.distanceKm === "number"
        ? `${f.distanceKm < 1 ? (f.distanceKm * 1000).toFixed(0) + " m" : f.distanceKm.toFixed(1) + " km"}`
        : "",
  }));
}
