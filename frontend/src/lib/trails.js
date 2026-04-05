const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/**
 * Fetch OSM hiking / walking ways near a point via Overpass API.
 * @param {number} lat WGS84 latitude
 * @param {number} lng WGS84 longitude
 * @param {number} [radiusMeters=10000]
 * @returns {Promise<GeoJSON.FeatureCollection>}
 */
export async function fetchTrails(lat, lng, radiusMeters = 10000) {
  // Note: route=hiking applies to relations, not ways; member geometry needs a multi-step query.
  // Ways below cover most trail-like paths in OSM.
  const query = `
    [out:json][timeout:25];
    (
      way["highway"="path"](around:${radiusMeters},${lat},${lng});
      way["highway"="footway"](around:${radiusMeters},${lat},${lng});
      way["highway"="track"](around:${radiusMeters},${lat},${lng});
      way["highway"="steps"](around:${radiusMeters},${lat},${lng});
    );
    out body geom;
  `;

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    throw new Error(`Overpass HTTP ${res.status}`);
  }

  const data = await res.json();
  return osmToGeoJSON(data);
}

/**
 * Convert Overpass JSON (ways with `geometry`) → GeoJSON FeatureCollection of LineStrings.
 * @param {object} osmData
 * @returns {GeoJSON.FeatureCollection}
 */
function osmToGeoJSON(osmData) {
  const elements = osmData?.elements;
  if (!Array.isArray(elements)) {
    return { type: "FeatureCollection", features: [] };
  }

  const features = elements
    .filter(
      (el) =>
        el.type === "way" &&
        Array.isArray(el.geometry) &&
        el.geometry.length >= 2
    )
    .map((way) => ({
      type: "Feature",
      properties: {
        name: way.tags?.name || "Unnamed trail",
        surface: way.tags?.surface || "unknown",
        difficulty: way.tags?.sac_scale || null,
        highway: way.tags?.highway || null,
      },
      geometry: {
        type: "LineString",
        coordinates: way.geometry.map((pt) => [pt.lon, pt.lat]),
      },
    }));

  return { type: "FeatureCollection", features };
}
