export const MAPBOX_TOKEN =
  "pk.eyJ1IjoicGVpaGVuZ2p1biIsImEiOiJjbW5rbW1jMGIxMTNoMnRwc2NjNHA5bzluIn0.qkYXl4shMwmgedcLO0Sk9g";

export async function geocodeLocation(query) {
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
  );
  const data = await res.json();
  return data.features?.[0]?.center ?? null; // [lng, lat]
}

const POI_QUERIES = [
  { q: "hospital",       category: "Medical",        color: "#ef4444", emoji: "🏥" },
  { q: "pharmacy",       category: "Pharmacy",        color: "#3b82f6", emoji: "💊" },
  { q: "gas station",    category: "Fuel",            color: "#f59e0b", emoji: "⛽" },
  { q: "grocery store",  category: "Grocery",         color: "#22c55e", emoji: "🛒" },
  { q: "visitor center", category: "Visitor Center",  color: "#8b5cf6", emoji: "🏛️" },
];

export async function fetchNearbyPOIs(lng, lat) {
  const results = [];
  await Promise.all(
    POI_QUERIES.map(async ({ q, category, color, emoji }) => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
            `?proximity=${lng},${lat}&types=poi&limit=2&access_token=${MAPBOX_TOKEN}`
        );
        const data = await res.json();
        data.features?.slice(0, 2).forEach((f) => {
          results.push({
            id: f.id,
            name: f.text,
            category,
            color,
            emoji,
            coordinates: f.center,
            address: f.place_name,
          });
        });
      } catch {
        // ignore individual failures
      }
    })
  );
  return results;
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
