import { useState, useCallback, useRef } from "react";
import { PreferencesForm } from "./PreferencesForm";
import { LoadingScreen } from "./LoadingScreen";
import { ResultsPage } from "./ResultsPage";
import { generateCampsites } from "@/lib/camping-data";
import { geocodeLocation } from "@/lib/mapbox";
import {
  fetchTopoSessionResult,
  fetchLandRulesSessionResult,
} from "@/lib/topo-poll";
const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/** Must match ``AGENT_IDS`` order in ``backend/app/agents.py``. */
const AGENT_IDS_ORDER = ["topo_map", "land_rules", "community_intel"];

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_MS = 45 * 60 * 1000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeHint(h, sessionId) {
  if (h === "pending") return sessionId ? "pending" : "skipped";
  return h;
}

function buildSitesAndHints(
  topoSites,
  commSites,
  topoHint,
  commHint,
  finalCoords,
  prefsNormalized
) {
  let merged = [];
  let nextId = 1;
  if (topoSites?.length) {
    merged.push(
      ...topoSites.map((s) => ({
        ...s,
        id: nextId++,
        source: s.source ?? "topo_agent",
      }))
    );
  }
  if (commSites?.length) {
    merged.push(
      ...commSites.map((s) => ({
        ...s,
        id: nextId++,
        source: s.source ?? "community_intel",
      }))
    );
  }
  const usingDemoFallback = merged.length === 0;
  const sites =
    merged.length > 0 ? merged : generateCampsites(finalCoords, prefsNormalized);
  return {
    sites,
    mapAgentHints: {
      topo: topoHint,
      community: commHint,
      usingDemoFallback,
    },
  };
}

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
  const [landRulesText, setLandRulesText] = useState(null);
  const [landRulesPending, setLandRulesPending] = useState(false);
  const [mapAgentHints, setMapAgentHints] = useState(null);
  const [mapAgentsPending, setMapAgentsPending] = useState(false);

  const pollCancelledRef = useRef(false);

  const handlePreferencesSubmit = useCallback(async (prefs) => {
    const location = prefs.location.trim();
    if (!location) return;

    pollCancelledRef.current = false;

    const prefsNormalized = { ...prefs, location };
    setPreferences(prefsNormalized);
    setAppState("loading");
    setAgentLiveUrls([null, null, null]);
    setAgentApiError(null);
    setLandRulesText(null);
    setLandRulesPending(false);
    setMapAgentHints(null);
    setMapAgentsPending(false);

    const sessionIds = [null, null, null];
    const feats = prefsNormalized.features || [];
    const pollStart = Date.now();

    const coordsPromise = geocodeLocation(location).catch(() => null);

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

    let topoSites = null;
    let commSites = null;
    let landRulesTextLocal = null;
    let topoHint = "pending";
    let commHint = "pending";

    let shownResults = false;

    const pushResultsUi = async () => {
      const finalCoords = (await coordsPromise) ?? [-119.5383, 37.8651];
      const th = normalizeHint(topoHint, sessionIds[0]);
      const ch = normalizeHint(commHint, sessionIds[2]);
      const built = buildSitesAndHints(
        topoSites,
        commSites,
        th,
        ch,
        finalCoords,
        prefsNormalized
      );
      setLandRulesText(landRulesTextLocal);
      setMapAgentHints(built.mapAgentHints);
      setCampsites(built.sites);
      setPreferences((p) => ({ ...p, coordinates: finalCoords }));
      const waitingTopoMap = !!(sessionIds[0] && topoHint === "pending");
      const waitingCommMap = !!(sessionIds[2] && commHint === "pending");
      setMapAgentsPending(waitingTopoMap || waitingCommMap);
    };

    try {
      await startBrowserAgents();

      setLandRulesPending(!!sessionIds[1]);

      topoHint = !sessionIds[0] ? "skipped" : "pending";
      commHint = !sessionIds[2] ? "skipped" : "pending";
      let topoResolved = !sessionIds[0];
      let commResolved = !sessionIds[2];
      let landResolved = !sessionIds[1];

      while (!pollCancelledRef.current) {
        if (Date.now() - pollStart >= MAX_POLL_MS) {
          if (!topoResolved && sessionIds[0]) {
            topoResolved = true;
            topoHint = "none";
          }
          if (!commResolved && sessionIds[2]) {
            commResolved = true;
            commHint = "none";
          }
          if (!landResolved && sessionIds[1]) {
            landResolved = true;
            setLandRulesPending(false);
          }
          if (topoHint === "pending") {
            topoHint = sessionIds[0] ? "none" : "skipped";
          }
          if (commHint === "pending") {
            commHint = sessionIds[2] ? "none" : "skipped";
          }
          await pushResultsUi();
          setMapAgentsPending(false);
          if (!shownResults) {
            shownResults = true;
            setAppState("results");
          }
          break;
        }

        let tJson = null;
        let cJson = null;
        let lJson = null;
        try {
          [tJson, cJson, lJson] = await Promise.all([
            sessionIds[0]
              ? fetchTopoSessionResult(
                  API_BASE,
                  sessionIds[0],
                  feats,
                  "topo_agent"
                ).catch(() => null)
              : Promise.resolve(null),
            sessionIds[2]
              ? fetchTopoSessionResult(
                  API_BASE,
                  sessionIds[2],
                  feats,
                  "community_intel"
                ).catch(() => null)
              : Promise.resolve(null),
            sessionIds[1]
              ? fetchLandRulesSessionResult(API_BASE, sessionIds[1]).catch(
                  () => null
                )
              : Promise.resolve(null),
          ]);
        } catch {
          await sleep(POLL_INTERVAL_MS);
          continue;
        }

        if (sessionIds[0] && tJson) {
          if (
            tJson.ready &&
            Array.isArray(tJson.sites) &&
            tJson.sites.length > 0
          ) {
            topoSites = tJson.sites;
            topoResolved = true;
            topoHint = "data";
          } else if (tJson.agent_finished) {
            topoResolved = true;
            topoHint = topoSites?.length ? "data" : "none";
          }
        }

        if (sessionIds[2] && cJson) {
          if (
            cJson.ready &&
            Array.isArray(cJson.sites) &&
            cJson.sites.length > 0
          ) {
            commSites = cJson.sites;
            commResolved = true;
            commHint = "data";
          } else if (cJson.agent_finished) {
            commResolved = true;
            commHint = commSites?.length ? "data" : "none";
          }
        }

        if (sessionIds[1] && lJson) {
          if (
            lJson.ready &&
            typeof lJson.text === "string" &&
            lJson.text.trim()
          ) {
            landRulesTextLocal = lJson.text.trim();
            landResolved = true;
            setLandRulesPending(false);
          } else if (lJson.agent_finished) {
            landResolved = true;
            setLandRulesPending(false);
          }
        }

        const hasAgentMapPoints =
          (topoSites?.length > 0) || (commSites?.length > 0);
        const mapAgentsDone = topoResolved && commResolved;

        /** Leave loader when we have real map coordinates, or both map agents finished (demo fallback). */
        if (!shownResults && (hasAgentMapPoints || mapAgentsDone)) {
          shownResults = true;
          await pushResultsUi();
          setAppState("results");
        } else if (shownResults) {
          await pushResultsUi();
        }

        if (
          shownResults &&
          topoResolved &&
          commResolved &&
          landResolved
        ) {
          setMapAgentsPending(false);
          await pushResultsUi();
          break;
        }

        await sleep(POLL_INTERVAL_MS);
      }
    } catch {
      setMapAgentsPending(false);
      setLandRulesPending(false);
    }
  }, []);

  const handleBack = useCallback(() => {
    pollCancelledRef.current = true;
    setAppState("preferences");
    setPreferences(null);
    setCampsites([]);
    setAgentApiError(null);
    setLandRulesText(null);
    setLandRulesPending(false);
    setMapAgentHints(null);
    setMapAgentsPending(false);
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
          landRulesText={landRulesText}
          landRulesPending={landRulesPending}
          mapAgentHints={mapAgentHints}
          mapAgentsPending={mapAgentsPending}
          onBack={handleBack}
        />
      )}
    </>
  );
}
