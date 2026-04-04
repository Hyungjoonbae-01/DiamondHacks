import { useState, useCallback } from "react";
import { PreferencesForm } from "./PreferencesForm";
import { LoadingScreen } from "./LoadingScreen";
import { ResultsPage } from "./ResultsPage";
import { generateCampsites } from "@/lib/camping-data";
import { geocodeLocation } from "@/lib/mapbox";

export function CampingApp() {
  const [appState, setAppState] = useState("preferences");
  const [preferences, setPreferences] = useState(null);
  const [campsites, setCampsites] = useState([]);

  const handlePreferencesSubmit = useCallback(async (prefs) => {
    setPreferences(prefs);
    setAppState("loading");

    const [coords] = await Promise.all([
      geocodeLocation(prefs.location).catch(() => null),
      new Promise((r) => setTimeout(r, 2500)), // min loading time
    ]);

    const finalCoords = coords ?? [-119.5383, 37.8651];
    const sites = generateCampsites(finalCoords, prefs);
    setCampsites(sites);
    setPreferences((p) => ({ ...p, coordinates: finalCoords }));
    setAppState("results");
  }, []);

  const handleBack = useCallback(() => {
    setAppState("preferences");
    setPreferences(null);
    setCampsites([]);
  }, []);

  return (
    <>
      {appState === "preferences" && (
        <PreferencesForm onSubmit={handlePreferencesSubmit} />
      )}
      {appState === "loading" && <LoadingScreen />}
      {appState === "results" && preferences && (
        <ResultsPage
          preferences={preferences}
          campsites={campsites}
          onBack={handleBack}
        />
      )}
    </>
  );
}
