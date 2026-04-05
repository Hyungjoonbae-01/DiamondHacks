/** Demo campsites when the topo agent has no parseable JSON/coordinates yet. */
const CAMPSITE_DATA = [
  { name: "Pine Ridge Campground",  description: "Serene spot nestled among tall pines with a nearby creek and mountain views." },
  { name: "Riverbend Retreat",      description: "Peaceful riverside camping with stunning sunset views and easy water access." },
  { name: "Eagle Peak Camp",        description: "High-elevation campground with panoramic mountain vistas and stargazing." },
  { name: "Whispering Pines",       description: "Shaded forest sites with well-maintained facilities and paved paths." },
  { name: "Lakeside Haven",         description: "Direct lake access with sandy shoreline, calm waters and picnic tables." },
  { name: "Blue Ridge Campsite",    description: "Forested hillside camp with well-marked hiking trails and fire rings." },
  { name: "Misty Falls Camp",       description: "Secluded waterfall camp perfect for nature photography and solitude." },
  { name: "Cedar Creek Grounds",    description: "Family-friendly grounds along a clear mountain stream with flush toilets." },
  { name: "Summit View Camp",       description: "Exposed summit camp ideal for stargazing with low light pollution." },
  { name: "Redwood Glen",           description: "Old-growth forest setting with towering canopy cover and quiet sites." },
];

const ALL_FEATURES = [
  "near_water", "accessibility", "pet_friendly",
  "rv_access", "hiking_trails", "fishing_spots", "campfires",
];

export function generateCampsites(coords, preferences) {
  const prefs = new Set(preferences.features || []);

  return CAMPSITE_DATA.map((data, i) => {
    const angle = (i / CAMPSITE_DATA.length) * 2 * Math.PI;
    const dist = 0.04 + Math.random() * 0.12;

    const features = ALL_FEATURES.filter((f) =>
      prefs.has(f) ? Math.random() > 0.25 : Math.random() > 0.6
    );

    const lng = coords[0] + Math.cos(angle) * dist;
    const lat = coords[1] + Math.sin(angle) * dist * 0.75;
    const coordLine = `Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)} (latitude, longitude).`;

    return {
      id: i + 1,
      name: data.name,
      description: `${data.description}\n\n${coordLine}`,
      coordinates: [lng, lat],
      features,
      rating: parseFloat((3.8 + Math.random() * 1.2).toFixed(1)),
      reviews: Math.floor(20 + Math.random() * 200),
      price: Math.random() > 0.3 ? `$${10 + Math.floor(Math.random() * 30)}/night` : "Free",
      source: "demo",
    };
  });
}
