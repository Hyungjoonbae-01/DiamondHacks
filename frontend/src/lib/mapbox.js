export const MAPBOX_TOKEN =
  "pk.eyJ1IjoicGVpaGVuZ2p1biIsImEiOiJjbW5rbW1jMGIxMTNoMnRwc2NjNHA5bzluIn0.qkYXl4shMwmgedcLO0Sk9g";

export async function geocodeLocation(query) {
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
  );
  const data = await res.json();
  return data.features?.[0]?.center ?? null; // [lng, lat]
}

/** Forward geocode for autocomplete (addresses, places, regions). */
export async function fetchAddressSuggestions(
  query,
  { limit = 6, signal } = {}
) {
  const q = query.trim();
  if (q.length < 2) return [];

  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    autocomplete: "true",
    limit: String(limit),
    types: "country,region,district,place,locality,neighborhood,address,poi",
  });

  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?${params}`,
    { signal }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features ?? []).map((f) => ({
    id: f.id,
    placeName: f.place_name,
    coordinates: f.center,
  }));
}

export async function fetchRoute(fromCoords, toCoords) {
  const res = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${fromCoords[0]},${fromCoords[1]};${toCoords[0]},${toCoords[1]}` +
      `?geometries=geojson&access_token=${MAPBOX_TOKEN}`
  );
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) return null;
  return {
    geometry: route.geometry,
    duration: route.duration, // seconds
    distance: route.distance, // metres
  };
}
