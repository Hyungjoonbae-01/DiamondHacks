import { useState } from "react";
import {
  Search,
  MapPin,
  Waves,
  Accessibility,
  PawPrint,
  Truck,
  TreePine,
  Fish,
  Flame,
  ArrowRight,
  PiggyBankIcon,
} from "lucide-react";

const FEATURES = [
  {
    id: "near_water",
    label: "Near water",
    description: "Rivers, lakes, or streams",
    icon: Waves,
  },
  {
    id: "accessibility",
    label: "Accessibility features",
    description: "ADA compliant facilities",
    icon: Accessibility,
  },
  {
    id: "pet_friendly",
    label: "Pet friendly",
    description: "Dogs and pets welcome",
    icon: PawPrint,
  },
  {
    id: "rv_access",
    label: "RV access",
    description: "Sites with RV hookups",
    icon: Truck,
  },
  {
    id: "hiking_trails",
    label: "Hiking trails",
    description: "Nearby trail access",
    icon: TreePine,
  },
  {
    id: "fishing_spots",
    label: "Fishing spots",
    description: "Licensed fishing areas",
    icon: Fish,
  },
  {
    id: "campfires",
    label: "Campfires allowed",
    description: "Designated fire rings",
    icon: Flame,
  },
  {
    id: "free",
    label: "Free & Disperse Camping",
    description: "No-cost camping options",
    icon: PiggyBankIcon,
  }
];

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        checked ? "bg-foreground" : "bg-foreground/20"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function PreferencesForm({ onSubmit }) {
  const [location, setLocation] = useState("");
  const [radius, setRadius] = useState(25);
  const [features, setFeatures] = useState(new Set());

  function toggleFeature(id) {
    setFeatures((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!location.trim()) return;
    onSubmit({
      location,
      radius,
      features: Array.from(features),
      coordinates: null,
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-10">
          <h1 className="font-display text-4xl md:text-5xl font-normal leading-tight text-foreground mb-3">
            Where will your adventure begin?
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            Tell us your preferences and we'll find the ideal camping spots
            tailored just for you.
          </p>
        </div>

        {/* Location */}
        <div className="mb-8">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
            <MapPin className="w-4 h-4" />
            Camping Location
          </label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              name="camping-location"
              autoComplete="off"
              enterKeyHint="search"
              placeholder="Search for a city, park, or region..."
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>
        </div>

        {/* Radius */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-foreground">
              Search Radius
            </span>
            <span className="text-sm font-mono text-muted-foreground">
              {radius} miles
            </span>
          </div>
          <input
            type="range"
            min={5}
            max={100}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="w-full h-1 accent-foreground cursor-pointer"
          />
          <div className="flex justify-between mt-2">
            <span className="text-xs text-muted-foreground">5 mi</span>
            <span className="text-xs text-muted-foreground">100 mi</span>
          </div>
        </div>

        {/* Features */}
        <div className="mb-10">
          <h2 className="text-base font-medium text-foreground mb-4">
            What are you looking for?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FEATURES.map(({ id, label, description, icon: Icon }) => {
              const active = features.has(id);
              return (
                <div
                  key={id}
                  className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                    active
                      ? "border-foreground/30 bg-foreground/5"
                      : "border-border bg-card"
                  }`}
                  onClick={() => toggleFeature(id)}
                >
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${
                      active
                        ? "bg-foreground text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {description}
                    </p>
                  </div>
                  <Toggle
                    checked={active}
                    onChange={() => toggleFeature(id)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!location.trim()}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-foreground text-primary-foreground font-medium text-sm transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
        >
          Find Campsites
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
