import { useState, useCallback } from "react";
import { PreferencesForm } from "./PreferencesForm";
import { LoadingScreen } from "./LoadingScreen";
import { ResultsPage } from "./ResultsPage";
import { enrichCampsitesWithSkyLight } from "@/lib/camping-data";
import { geocodeLocation } from "@/lib/mapbox";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function fetchResearchCampsites(prefs) {
  try {
    const res = await fetch(`${API_BASE}/api/research/campsites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: prefs.location.trim(),
        radius: prefs.radius,
        features: prefs.features,
      }),
    });
    if (!res.ok) {
      let message = `Research could not complete (HTTP ${res.status}).`;
      try {
        const errBody = await res.json();
        const d = errBody?.detail;
        if (typeof d === "string") message = d;
        else if (Array.isArray(d))
          message = d.map((x) => x?.msg ?? JSON.stringify(x)).join(" ");
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        error: message,
        campsites: [],
        reports: null,
        parse_note: null,
      };
    }
    return { ok: true, ...(await res.json()) };
  } catch {
    return {
      ok: false,
      error: `Could not reach the API at ${API_BASE}. Is the backend running?`,
      campsites: [],
      reports: null,
      parse_note: null,
    };
  }
}

export function CampingApp() {
  const [appState, setAppState] = useState("preferences");
  const [preferences, setPreferences] = useState(null);
  const [campsites, setCampsites] = useState([]);
  const [researchMeta, setResearchMeta] = useState(null);

  const handlePreferencesSubmit = useCallback(async (prefs) => {
    const location = prefs.location.trim();
    if (!location) return;

    const prefsNormalized = { ...prefs, location };
    setPreferences(prefsNormalized);
    setAppState("loading");
    setResearchMeta(null);

    /**
     * Single Browser Use pipeline: POST /api/research/campsites runs topo_map → land_rules
     * → community_intel sequentially (three sessions total). Do not also call start-live,
     * or you exceed concurrent session limits (3 live + research = 429).
     */
    const [coords, research] = await Promise.all([
      prefsNormalized.coordinates
        ? Promise.resolve(prefsNormalized.coordinates)
        : geocodeLocation(location).catch(() => null),
      fetchResearchCampsites(prefsNormalized),
    ]);

    const finalCoords = coords ?? [-119.5383, 37.8651];

    const rawList = Array.isArray(research.campsites) ? research.campsites : [];
    const normalized = rawList
      .filter(
        (c) =>
          Array.isArray(c.coordinates) &&
          c.coordinates.length === 2 &&
          Number.isFinite(c.coordinates[0]) &&
          Number.isFinite(c.coordinates[1])
      )
      .map((c, i) => ({
        id: c.id ?? i + 1,
        name: c.name || `Site ${i + 1}`,
        description: c.description || "",
        website: c.website ?? null,
        coordinates: c.coordinates,
        features: Array.isArray(c.features) ? c.features : [],
        rating: c.rating ?? null,
        reviews: c.reviews ?? null,
        price: c.price ?? null,
        hazards: c.hazards ?? null,
        confidence: c.confidence ?? null,
      }));

    const sites = enrichCampsitesWithSkyLight(normalized);
    setCampsites(sites);
    setResearchMeta({
      reports: research.reports,
      parse_note: research.parse_note,
      researchError: research.ok ? null : research.error,
    });
    setPreferences((p) => ({ ...p, coordinates: finalCoords }));
    setAppState("results");
  }, []);

  const handleBack = useCallback(() => {
    setAppState("preferences");
    setPreferences(null);
    setCampsites([]);
    setResearchMeta(null);
  }, []);

  return (
    <>
      {appState === "preferences" && (
        <PreferencesForm onSubmit={handlePreferencesSubmit} />
      )}
      {appState === "loading" && (
        <LoadingScreen />
      )}
      {appState === "results" && preferences && (
        <ResultsPage
          preferences={preferences}
          campsites={campsites}
          researchMeta={researchMeta}
          onBack={handleBack}
        />
      )}
    </>
  );
}
