import { useState, useCallback } from "react";
import { PreferencesForm } from "./PreferencesForm";
import { LoadingScreen } from "./LoadingScreen";
import { ResultsPage } from "./ResultsPage";
import { generateCampsites } from "@/lib/camping-data";
import { geocodeLocation } from "@/lib/mapbox";
import { pollAgentSessionSites } from "@/lib/topo-poll";
import { LOADING_DURATION_MS as LOADING_MS } from "@/lib/loading-duration";
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

    const sessionIds = [null, null, null];

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
            sessionIds[i] = row?.session_id ?? null;
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

    /** Poll topo_map and community_intel sessions in parallel for JSON → map sites. */
    const pollAgentSessionsForSites = async () => {
      try {
        await startBrowserAgents();
        const topoSid = sessionIds[0];
        const commSid = sessionIds[2];
        const feats = prefsNormalized.features || [];
        const opts = {
          maxWaitMs: LOADING_MS - 1500,
          intervalMs: 2000,
        };
        const [topoRes, commRes] = await Promise.all([
          topoSid
            ? pollAgentSessionSites(
                API_BASE,
                topoSid,
                feats,
                "topo_agent",
                opts
              )
            : Promise.resolve({ sites: null }),
          commSid
            ? pollAgentSessionSites(
                API_BASE,
                commSid,
                feats,
                "community_intel",
                opts
              )
            : Promise.resolve({ sites: null }),
        ]);
        return {
          topoSites: topoRes.sites,
          communitySites: commRes.sites,
        };
      } catch {
        return { topoSites: null, communitySites: null };
      }
    };

    const [coords, , agentPoll] = await Promise.all([
      geocodeLocation(location).catch(() => null),
      new Promise((r) => setTimeout(r, LOADING_MS)),
      pollAgentSessionsForSites(),
    ]);

    const finalCoords = coords ?? [-119.5383, 37.8651];
    const topoSites = agentPoll?.topoSites;
    const communitySites = agentPoll?.communitySites;

    let merged = [];
    let nextId = 1;
    if (topoSites?.length) {
      merged.push(
        ...topoSites.map((s) => ({ ...s, id: nextId++, source: s.source ?? "topo_agent" }))
      );
    }
    if (communitySites?.length) {
      merged.push(
        ...communitySites.map((s) => ({
          ...s,
          id: nextId++,
          source: s.source ?? "community_intel",
        }))
      );
    }

    const sites =
      merged.length > 0 ? merged : generateCampsites(finalCoords, prefsNormalized);
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
