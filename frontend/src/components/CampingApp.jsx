import { useState, useCallback } from "react";
import { PreferencesForm } from "./PreferencesForm";
import { LoadingScreen } from "./LoadingScreen";
import { ResultsPage } from "./ResultsPage";
import { generateCampsites } from "@/lib/camping-data";
import { geocodeLocation } from "@/lib/mapbox";

const LOADING_MS = 60_000;
const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/** Must match ``AGENT_IDS`` order in ``backend/app/agents.py``. */
const AGENT_IDS_ORDER = ["topo_map", "land_rules", "community_intel"];

export function CampingApp() {
  const [appState, setAppState] = useState("preferences");
  const [preferences, setPreferences] = useState(null);
  const [campsites, setCampsites] = useState([]);
  const [agentLiveUrls, setAgentLiveUrls] = useState([
    null,
    null,
    null,
  ]);
  const [agentApiError, setAgentApiError] = useState(null);

  const handlePreferencesSubmit = useCallback(async (prefs) => {
    const location = prefs.location.trim();
    if (!location) return;

    const prefsNormalized = { ...prefs, location };
    setPreferences(prefsNormalized);
    setAppState("loading");
    setAgentLiveUrls([null, null, null]);
    setAgentApiError(null);

    /** Start all Browser Use sessions in parallel so cloud browsers spin up together (no queue behind prior creates). */
    const startBrowserAgents = async () => {
      const bodyBase = {
        location,
        radius: prefs.radius,
        features: prefs.features,
      };
      try {
        await Promise.all(
          AGENT_IDS_ORDER.map(async (agent_id, i) => {
            const res = await fetch(`${API_BASE}/api/browser-agents/start-live`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...bodyBase, agent_id }),
            });
            if (!res.ok) {
              let message = `Agent ${agent_id} could not start (HTTP ${res.status}).`;
              try {
                const errBody = await res.json();
                const d = errBody?.detail;
                if (typeof d === "string") message = d;
                else if (Array.isArray(d))
                  message = d.map((x) => x?.msg ?? JSON.stringify(x)).join(" ");
              } catch {
                /* ignore */
              }
              setAgentApiError(message);
              throw new Error(message);
            }
            const data = await res.json();
            const row = data.agents?.[0];
            const liveUrl = row?.live_url ?? null;
            setAgentLiveUrls((prev) => {
              const next = [...prev];
              next[i] = liveUrl;
              return next;
            });
          })
        );
      } catch (e) {
        if (!(e instanceof Error) || !String(e.message).includes("could not start")) {
          setAgentApiError(
            `Could not reach the API at ${API_BASE}. Is the backend running?`
          );
        }
      }
    };

    const [coords] = await Promise.all([
      geocodeLocation(location).catch(() => null),
      new Promise((r) => setTimeout(r, LOADING_MS)),
      startBrowserAgents(),
    ]);

    const finalCoords = coords ?? [-119.5383, 37.8651];
    const sites = generateCampsites(finalCoords, prefsNormalized);
    setCampsites(sites);
    setPreferences((p) => ({ ...p, coordinates: finalCoords }));
    setAppState("results");
  }, []);

  const handleBack = useCallback(() => {
    setAppState("preferences");
    setPreferences(null);
    setCampsites([]);
    setAgentApiError(null);
  }, []);

  return (
    <>
      {appState === "preferences" && (
        <PreferencesForm onSubmit={handlePreferencesSubmit} />
      )}
      {appState === "loading" && (
        <LoadingScreen
          agentLiveUrls={agentLiveUrls}
          agentApiError={agentApiError}
        />
      )}
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
