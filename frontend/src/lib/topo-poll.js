/**
 * Poll GET /api/topo/session/:id/result until ready or timeout.
 * @param {string} [siteSource] - "topo_agent" | "community_intel" (passed as query param)
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
    } catch {
      /* network */
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { sites: null, raw: null };
}

/**
 * Poll GET /api/topo/session/:id/land-rules-result until plain-text output is ready or timeout.
 */
export async function pollLandRulesSession(apiBase, sessionId, opts = {}) {
  const intervalMs = opts.intervalMs ?? 2000;
  const maxWaitMs = opts.maxWaitMs ?? 58_000;
  const deadline = Date.now() + maxWaitMs;
  const url = `${apiBase}/api/topo/session/${encodeURIComponent(sessionId)}/land-rules-result`;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, intervalMs));
        continue;
      }
      const data = await res.json();
      if (data.ready && typeof data.text === "string") {
        const t = data.text.trim();
        if (t.length > 0) {
          return { text: t, raw: data };
        }
      }
    } catch {
      /* network */
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { text: null, raw: null };
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
