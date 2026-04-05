/**
 * One-shot GET for topo/community session (used by background poll loop).
 * @param {string} siteSource - "topo_agent" | "community_intel"
 */
export async function fetchTopoSessionResult(
  apiBase,
  sessionId,
  featurePrefs = [],
  siteSource = "topo_agent"
) {
  const params = new URLSearchParams();
  (featurePrefs || []).forEach((f) => params.append("features", f));
  params.set("site_source", siteSource);
  const url = `${apiBase}/api/topo/session/${encodeURIComponent(sessionId)}/result?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`topo session HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchLandRulesSessionResult(apiBase, sessionId) {
  const url = `${apiBase}/api/topo/session/${encodeURIComponent(sessionId)}/land-rules-result`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`land rules session HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Poll GET /api/topo/session/:id/result until sites ready or agent_finished.
 */
export async function pollAgentSessionSites(
  apiBase,
  sessionId,
  featurePrefs = [],
  siteSource = "topo_agent",
  opts = {}
) {
  const intervalMs = opts.intervalMs ?? 2000;
  const maxWaitMs = opts.maxWaitMs ?? 58_000;
  const deadline = Date.now() + maxWaitMs;
  const params = new URLSearchParams();
  (featurePrefs || []).forEach((f) => params.append("features", f));
  params.set("site_source", siteSource);
  const qs = params.toString();
  const url = `${apiBase}/api/topo/session/${encodeURIComponent(sessionId)}/result?${qs}`;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, intervalMs));
        continue;
      }
      const data = await res.json();
      if (data.ready && Array.isArray(data.sites) && data.sites.length > 0) {
        return { sites: data.sites, raw: data };
      }
      if (data.agent_finished) {
        return { sites: null, raw: data, agentFinished: true };
      }
    } catch {
      /* network */
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { sites: null, raw: null };
}

/** @deprecated use pollAgentSessionSites */
export async function pollTopoSessionSites(
  apiBase,
  sessionId,
  featurePrefs = [],
  opts = {}
) {
  return pollAgentSessionSites(
    apiBase,
    sessionId,
    featurePrefs,
    "topo_agent",
    opts
  );
}
