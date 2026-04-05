import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  ArrowLeft,
  Star,
  Clock,
  Navigation,
  Loader2,
  ScrollText,
} from "lucide-react";
import { MAPBOX_TOKEN, fetchRoute } from "@/lib/mapbox";
import {
  fetchNearbyFacilities,
  facilitiesToPoiMarkers,
} from "@/lib/facilities";

mapboxgl.accessToken = MAPBOX_TOKEN;

/** Fingerprint of topo + community pins for incremental map updates while agents run. */
function agentSitesSignature(sites) {
  if (!sites?.length) return "";
  return sites
    .filter(
      (s) =>
        s.source === "topo_agent" || s.source === "community_intel"
    )
    .map(
      (s) =>
        `${s.id}:${Number(s.coordinates[0]).toFixed(5)},${Number(s.coordinates[1]).toFixed(5)}`
    )
    .sort()
    .join("|");
}

/** Full list fingerprint — final sync when agents finish or list changes. */
function allCampsitesSignature(sites) {
  if (!sites?.length) return "";
  return sites
    .map(
      (s) =>
        `${s.id}:${s.source ?? "demo"}:${Number(s.coordinates[0]).toFixed(5)},${Number(s.coordinates[1]).toFixed(5)}`
    )
    .sort()
    .join("|");
}

const FEATURE_LABELS = {
  near_water:    "Near Water",
  accessibility: "Accessible",
  pet_friendly:  "Pet Friendly",
  rv_access:     "RV Access",
  hiking_trails: "Hiking Trails",
  fishing_spots: "Fishing Spots",
  campfires:     "Campfires",
};

function fmt_duration(secs) {
  const m = Math.round(secs / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

function fmt_dist(metres) {
  return metres < 1000
    ? `${Math.round(metres)} m`
    : `${(metres / 1000).toFixed(1)} km`;
}

function getCampsitePalette(source, selected) {
  if (source === "community_intel") {
    return selected
      ? { background: "#ea580c", color: "#fff", border: "2.5px solid #c2410c" }
      : { background: "#fff7ed", color: "#9a3412", border: "2.5px solid #fb923c" };
  }
  if (source === "topo_agent") {
    return selected
      ? { background: "#0f766e", color: "#fff", border: "2.5px solid #115e59" }
      : { background: "#ecfdf5", color: "#134e4a", border: "2.5px solid #2dd4bf" };
  }
  return selected
    ? { background: "#111", color: "#fff", border: "2.5px solid #111" }
    : { background: "#fff", color: "#111", border: "2.5px solid #ccc" };
}

function makeCampsiteEl(label, selected, source = "demo") {
  const el = document.createElement("div");
  const p = getCampsitePalette(source, selected);
  Object.assign(el.style, {
    width: "34px",
    height: "34px",
    background: p.background,
    color: p.color,
    border: p.border,
    borderRadius: "50%",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    fontWeight: "600",
    fontFamily: "system-ui, sans-serif",
    transition: "all 0.2s",
  });
  el.textContent = label;
  return el;
}

function sourceBadgeLabel(source) {
  if (source === "topo_agent") return "Topo";
  if (source === "community_intel") return "Community";
  return "Demo";
}

function makePOIEl(color) {
  const el = document.createElement("div");
  Object.assign(el.style, {
    width: "22px", height: "22px",
    background: color,
    border: "2px solid #fff",
    borderRadius: "50%",
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
  });
  return el;
}

function stripSimpleMarkdown(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

/** Split on http(s) URLs and render links that wrap inside narrow cards. */
function renderLandRulesTextWithLinks(text) {
  if (!text) return null;
  const parts = text.split(/(https?:\/\/[^\s<>"'()[\]]+)/gi);
  return parts.map((part, i) => {
    if (!part) return null;
    if (/^https?:\/\//i.test(part)) {
      const trimmed = part.replace(/[.,;:!?)]+$/, "");
      const href = trimmed || part;
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline font-medium text-emerald-800 underline decoration-emerald-600/35 underline-offset-[3px] [overflow-wrap:anywhere] break-words hover:text-emerald-700 dark:text-emerald-300 dark:decoration-emerald-500/40 dark:hover:text-emerald-200"
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * Turn agent plain text into blocks: key/value lines (LABEL: detail) vs prose vs bullets.
 */
function parseLandRulesBlocks(raw) {
  let t = stripSimpleMarkdown(raw);
  t = t.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "");
  const lines = t
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const blocks = [];
  let proseBuf = [];

  const flushProse = () => {
    if (!proseBuf.length) return;
    const chunk = proseBuf.join("\n").trim();
    proseBuf = [];
    if (!chunk) return;
    const bulletish = chunk
      .split(/\n/)
      .every(
        (ln) =>
          /^[-•*]\s/.test(ln) || /^\d+[.)]\s/.test(ln)
      );
    if (bulletish) {
      const items = chunk.split(/\n/).map((ln) =>
        ln
          .replace(/^[-•*]\s*/, "")
          .replace(/^\d+[.)]\s*/, "")
          .trim()
      );
      blocks.push({ type: "list", items });
    } else {
      blocks.push({ type: "prose", text: chunk });
    }
  };

  const kvPattern = /^([^:\n]{2,88}):\s*(.+)$/;
  for (const line of lines) {
    const m = line.match(kvPattern);
    const label = m?.[1]?.trim();
    const value = m?.[2]?.trim();
    const looksLikeLabel =
      label &&
      !/^https?:/i.test(value) &&
      label.length <= 88 &&
      !label.includes("://") &&
      (label === label.toUpperCase() ||
        /^[A-Z]/.test(label) ||
        /^(land|stay|fire|road|permit|dispersed|current)/i.test(label));

    if (m && looksLikeLabel && value !== undefined) {
      flushProse();
      blocks.push({
        type: "kv",
        label: stripSimpleMarkdown(label),
        value: stripSimpleMarkdown(value),
      });
    } else {
      proseBuf.push(line);
    }
  }
  flushProse();
  return blocks;
}

/** Renders plain-text policy output from the land_rules Browser Use agent. */
function LandRulesSection({ text, loading = false }) {
  const hasText = Boolean(text?.trim());
  if (loading && !hasText) {
    return (
      <div className="min-w-0 overflow-hidden rounded-2xl border border-emerald-900/15 bg-gradient-to-b from-emerald-950/[0.07] to-card shadow-sm dark:border-emerald-500/20 dark:from-emerald-950/25">
        <div className="border-b border-emerald-900/10 bg-emerald-950/[0.06] px-4 py-3 dark:border-emerald-500/15 dark:bg-emerald-950/30">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-foreground">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
              <ScrollText className="h-3.5 w-3.5" aria-hidden />
            </span>
            Land rules
          </h3>
          <p className="mt-1.5 pl-9 text-[11px] leading-snug text-muted-foreground">
            Official-style summary from the land rules agent (USFS, BLM, NPS, or state). Verify
            before you camp.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-700/80 dark:text-emerald-400/90" aria-hidden />
          <span>Loading land rules for this area…</span>
        </div>
      </div>
    );
  }
  if (!hasText) return null;
  const blocks = parseLandRulesBlocks(text);

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-emerald-900/15 bg-gradient-to-b from-emerald-950/[0.07] to-card shadow-sm dark:border-emerald-500/20 dark:from-emerald-950/25">
      <div className="border-b border-emerald-900/10 bg-emerald-950/[0.06] px-4 py-3 dark:border-emerald-500/15 dark:bg-emerald-950/30">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-foreground">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
            <ScrollText className="h-3.5 w-3.5" aria-hidden />
          </span>
          Land rules
        </h3>
        <p className="mt-1.5 pl-9 text-[11px] leading-snug text-muted-foreground">
          Official-style summary from the land rules agent (USFS, BLM, NPS, or state). Verify
          before you camp.
        </p>
      </div>

      <div className="flex min-w-0 flex-col divide-y divide-border/55 p-4 dark:divide-border/40">
        {blocks.length === 0 ? (
          <div className="min-w-0 text-sm leading-relaxed text-foreground/90 [overflow-wrap:anywhere] whitespace-pre-wrap break-words">
            {renderLandRulesTextWithLinks(stripSimpleMarkdown(text.trim()))}
          </div>
        ) : (
          blocks.map((b, i) => {
            if (b.type === "kv") {
              return (
                <section
                  key={`kv-${i}`}
                  className="min-w-0 space-y-2 py-4 first:pt-0 last:pb-0"
                >
                  <div className="rounded-xl border border-border/80 bg-background/70 px-3.5 py-3 shadow-sm dark:bg-background/45">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800/90 dark:text-emerald-400/90">
                      {b.label}
                    </p>
                    <p className="mt-1.5 min-w-0 text-[13px] leading-relaxed text-foreground/95 [overflow-wrap:anywhere] break-words [text-wrap:pretty]">
                      {renderLandRulesTextWithLinks(b.value)}
                    </p>
                  </div>
                </section>
              );
            }
            if (b.type === "list") {
              return (
                <section
                  key={`list-${i}`}
                  className="min-w-0 py-4 first:pt-0 last:pb-0"
                >
                  <ul className="space-y-3 border-l-2 border-emerald-600/30 pl-3.5 dark:border-emerald-500/35">
                    {b.items.map((item, j) => (
                      <li
                        key={j}
                        className="min-w-0 text-[13px] leading-relaxed text-foreground/90 [overflow-wrap:anywhere] break-words [text-wrap:pretty]"
                      >
                        <span className="mr-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-emerald-600/70 align-middle dark:bg-emerald-400/70" />
                        {renderLandRulesTextWithLinks(item)}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            }
            return (
              <section
                key={`prose-${i}`}
                className="min-w-0 py-4 first:pt-0 last:pb-0"
              >
                <p className="min-w-0 text-[13px] leading-relaxed text-foreground/90 [overflow-wrap:anywhere] whitespace-pre-wrap break-words [text-wrap:pretty]">
                  {renderLandRulesTextWithLinks(b.text)}
                </p>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function MapAgentHintsBanner({ hints }) {
  if (!hints) return null;
  const parts = [];
  if (hints.topo === "none") {
    parts.push(
      "The topo agent finished without mappable campsite coordinates."
    );
  }
  if (hints.community === "none") {
    parts.push(
      "The community agent finished without mappable campsite coordinates."
    );
  }
  if (hints.usingDemoFallback) {
    parts.push(
      "Pins shown are demo suggestions because no agent-returned spots were available."
    );
  }
  if (!parts.length) return null;
  return (
    <div className="shrink-0 border-b border-amber-500/25 bg-amber-500/[0.09] px-4 py-3 dark:bg-amber-950/30">
      <ul className="space-y-1.5 text-xs leading-snug text-amber-950 dark:text-amber-100/95">
        {parts.map((t, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-600 dark:bg-amber-400" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResultsPage({
  preferences,
  campsites,
  landRulesText,
  landRulesPending = false,
  mapAgentHints = null,
  mapAgentsPending = false,
  onBack,
}) {
  const mapContainer  = useRef(null);
  const mapRef        = useRef(null);
  const mapLoadedRef  = useRef(false);
  const markerMapRef  = useRef(new Map()); // site.id → { marker, el }
  const poiMarkersRef = useRef([]);
  const campsitesRef  = useRef(campsites);
  campsitesRef.current = campsites;
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  const prevAgentSitesSigRef = useRef("");
  const prevFullCampsitesSigRef = useRef("");
  const prevMapAgentsPendingRef = useRef(false);
  const markerSyncRetryRef = useRef(0);
  const selectedCampsiteIdRef = useRef(null);

  const [selectedCampsite, setSelectedCampsite] = useState(null);
  const [pois,             setPois]             = useState([]);
  const [selectedPOI,      setSelectedPOI]      = useState(null);
  const [routeInfo,        setRouteInfo]         = useState(null);
  const [loadingPOIs,      setLoadingPOIs]       = useState(false);
  const [loadingRoute,     setLoadingRoute]      = useState(false);

  // Stable refs for callbacks — avoids stale closures in map event handlers
  const onSelectCampsiteRef = useRef(null);
  const onSelectPOIRef      = useRef(null);

  // ── helpers ────────────────────────────────────────────────────────────────
  function clearPOIMarkers() {
    poiMarkersRef.current.forEach((m) => m.remove());
    poiMarkersRef.current = [];
  }

  function clearRoute() {
    if (mapRef.current && mapLoadedRef.current) {
      mapRef.current.getSource("route-source")?.setData({
        type: "FeatureCollection", features: [],
      });
    }
  }

  function resetCampsiteMarkers(selectedId = null) {
    markerMapRef.current.forEach(({ el, source }, id) => {
      const sel = id === selectedId;
      const p = getCampsitePalette(source ?? "demo", sel);
      Object.assign(el.style, {
        background: p.background,
        color: p.color,
        border: p.border,
        transform: sel ? "scale(1.2)" : "scale(1)",
      });
    });
  }

  function syncCampsiteMarkers() {
    if (!mapLoadedRef.current || !mapRef.current) return;
    const map = mapRef.current;
    const list = campsitesRef.current;
    markerMapRef.current.forEach(({ marker }) => marker.remove());
    markerMapRef.current.clear();
    list.forEach((site, i) => {
      const el = makeCampsiteEl(i + 1, false, site.source ?? "demo");
      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat(site.coordinates)
        .addTo(map);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectCampsiteRef.current?.(site);
      });
      markerMapRef.current.set(site.id, {
        marker,
        el,
        source: site.source ?? "demo",
      });
    });

    const finish = () => {
      map.resize();
      if (list.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        list.forEach((s) => bounds.extend(s.coordinates));
        map.fitBounds(bounds, { padding: 80, pitch: 62, bearing: -20, duration: 900 });
      } else if (
        preferencesRef.current.coordinates &&
        preferencesRef.current.coordinates.length === 2
      ) {
        map.flyTo({
          center: preferencesRef.current.coordinates,
          zoom: 13,
          pitch: 62,
          bearing: -20,
          duration: 700,
        });
      }
      requestAnimationFrame(() => {
        const expected = campsitesRef.current.length;
        const actual = markerMapRef.current.size;
        if (expected > 0 && actual !== expected && markerSyncRetryRef.current < 1) {
          markerSyncRetryRef.current += 1;
          syncCampsiteMarkers();
        } else {
          markerSyncRetryRef.current = 0;
        }
      });
    };
    requestAnimationFrame(finish);
  }

  // ── select campsite ────────────────────────────────────────────────────────
  async function onSelectCampsite(site) {
    setSelectedCampsite(site);
    setSelectedPOI(null);
    setRouteInfo(null);
    clearPOIMarkers();
    clearRoute();
    resetCampsiteMarkers(site.id);

    mapRef.current?.flyTo({ center: site.coordinates, zoom: 14.5, pitch: 55, bearing: -20, duration: 1200 });

    setLoadingPOIs(true);
    try {
      const lng = site.coordinates[0];
      const lat = site.coordinates[1];
      const rawFacilities = await fetchNearbyFacilities(lat, lng);
      const nearby = facilitiesToPoiMarkers(rawFacilities);
      setPois(nearby);

      if (mapLoadedRef.current) {
        nearby.forEach((poi) => {
          const el = makePOIEl(poi.color);
          const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
            .setLngLat(poi.coordinates)
            .addTo(mapRef.current);
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            onSelectPOIRef.current?.(poi, site);
          });
          poiMarkersRef.current.push(marker);
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPOIs(false);
    }
  }

  // ── select POI ─────────────────────────────────────────────────────────────
  async function onSelectPOI(poi, campsite) {
    setSelectedPOI(poi);
    setRouteInfo(null);
    setLoadingRoute(true);
    clearRoute();

    const bounds = new mapboxgl.LngLatBounds()
      .extend(campsite.coordinates)
      .extend(poi.coordinates);
    mapRef.current?.fitBounds(bounds, { padding: 120, pitch: 45, bearing: -20, duration: 800 });

    try {
      const route = await fetchRoute(campsite.coordinates, poi.coordinates);
      setRouteInfo(route);
      if (route && mapLoadedRef.current) {
        mapRef.current.getSource("route-source")?.setData({
          type: "Feature",
          geometry: route.geometry,
          properties: {},
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRoute(false);
    }
  }

  // Keep refs current every render
  onSelectCampsiteRef.current = onSelectCampsite;
  onSelectPOIRef.current      = onSelectPOI;

  useEffect(() => {
    const id = selectedCampsite?.id ?? null;
    selectedCampsiteIdRef.current = id;
    resetCampsiteMarkers(id);
  }, [selectedCampsite?.id]);

  /**
   * While map agents run: refresh pins when topo/community coordinates change.
   * When finished: keep full list in sync and always replot once when agents complete.
   */
  useEffect(() => {
    if (!mapLoadedRef.current) return;

    const agentSig = agentSitesSignature(campsites);
    const fullSig = allCampsitesSignature(campsites);
    const pending = mapAgentsPending;
    const wasPending = prevMapAgentsPendingRef.current;

    let shouldSyncMarkers = false;

    if (pending) {
      if (agentSig !== prevAgentSitesSigRef.current) {
        shouldSyncMarkers = true;
        prevAgentSitesSigRef.current = agentSig;
      }
    } else {
      if (wasPending) {
        shouldSyncMarkers = true;
        prevAgentSitesSigRef.current = agentSig;
        prevFullCampsitesSigRef.current = fullSig;
      } else if (fullSig !== prevFullCampsitesSigRef.current) {
        shouldSyncMarkers = true;
        prevFullCampsitesSigRef.current = fullSig;
        prevAgentSitesSigRef.current = agentSig;
      }
    }

    prevMapAgentsPendingRef.current = pending;

    if (shouldSyncMarkers) {
      syncCampsiteMarkers();
      resetCampsiteMarkers(selectedCampsiteIdRef.current ?? null);
    }
  }, [campsites, mapAgentsPending]);

  const coordKey =
    preferences.coordinates?.length === 2
      ? `${preferences.coordinates[0]},${preferences.coordinates[1]}`
      : "";
  useEffect(() => {
    if (!coordKey || !mapLoadedRef.current || !mapRef.current) return;
    requestAnimationFrame(() => mapRef.current?.resize());
  }, [coordKey]);

  // ── back to list ───────────────────────────────────────────────────────────
  function handleBackToList() {
    setSelectedCampsite(null);
    setPois([]);
    setSelectedPOI(null);
    setRouteInfo(null);
    clearPOIMarkers();
    clearRoute();
    resetCampsiteMarkers(null);

    if (mapRef.current && campsites.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      campsites.forEach((s) => bounds.extend(s.coordinates));
      mapRef.current.fitBounds(bounds, { padding: 80, pitch: 50, bearing: -20, duration: 800 });
    }
  }

  // ── init map ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      // Standard style = 3D buildings + 3D tree models + dynamic lighting
      style:     "mapbox://styles/mapbox/standard",
      center:    preferences.coordinates,
      zoom:      13,
      pitch:     62,
      bearing:   -20,
      antialias: true,
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    mapRef.current.on("load", () => {
      mapLoadedRef.current = true;
      const map = mapRef.current;

      // ── Standard style config ─────────────────────────────────────────────
      // Show 3D objects (buildings, trees) and set daytime lighting
      map.setConfigProperty("basemap", "showRoadLabels",      true);
      map.setConfigProperty("basemap", "showPointOfInterestLabels", true);

      // ── 3D terrain (real elevation) ───────────────────────────────────────
      map.addSource("mapbox-dem", {
        type:     "raster-dem",
        url:      "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom:  14,
      });
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });

      // ── Fog / atmosphere for depth ────────────────────────────────────────
      map.setFog({
        range:            [0.8, 8],
        color:            "rgba(220, 235, 255, 0.6)",
        "horizon-blend":  0.08,
        "high-color":     "#87ceeb",
        "space-color":    "#1a3a5c",
        "star-intensity": 0.1,
      });

      // ── Hillshade (slot: "bottom" sits below Standard's 3D objects) ───────
      map.addSource("hillshade-source", {
        type:     "raster-dem",
        url:      "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
      });
      map.addLayer({
        id:     "hillshade-layer",
        type:   "hillshade",
        source: "hillshade-source",
        slot:   "bottom",          // Standard v3 slot — renders beneath everything
        paint: {
          "hillshade-shadow-color":           "#2c1f0e",
          "hillshade-highlight-color":        "#fff8e7",
          "hillshade-exaggeration":           0.4,
          "hillshade-illumination-direction": 335,
        },
      });

      // ── Land cover from mapbox-terrain-v2 (slot: "bottom") ───────────────
      map.addSource("terrain-v2", {
        type: "vector",
        url:  "mapbox://mapbox.mapbox-terrain-v2",
      });

      // Forest — rich green
      map.addLayer({
        id:             "landcover-wood",
        type:           "fill",
        source:         "terrain-v2",
        "source-layer": "landcover",
        slot:           "bottom",
        filter:         ["==", ["get", "class"], "wood"],
        paint: {
          "fill-color":   "#1a4731",
          "fill-opacity": 0.5,
        },
      });

      // Scrub — olive
      map.addLayer({
        id:             "landcover-scrub",
        type:           "fill",
        source:         "terrain-v2",
        "source-layer": "landcover",
        slot:           "bottom",
        filter:         ["==", ["get", "class"], "scrub"],
        paint: {
          "fill-color":   "#5a7a4a",
          "fill-opacity": 0.4,
        },
      });

      // Grass / meadow — light green
      map.addLayer({
        id:             "landcover-grass",
        type:           "fill",
        source:         "terrain-v2",
        "source-layer": "landcover",
        slot:           "bottom",
        filter:         ["in", ["get", "class"], ["literal", ["grass", "crop"]]],
        paint: {
          "fill-color":   "#a8d5b5",
          "fill-opacity": 0.35,
        },
      });

      // ── Contour lines (slot: "middle" — above terrain, below 3D objects) ──
      map.addLayer({
        id:             "contour-lines",
        type:           "line",
        source:         "terrain-v2",
        "source-layer": "contour",
        slot:           "middle",
        paint: {
          "line-color": [
            "interpolate", ["linear"], ["get", "index"],
            1, "rgba(140, 105, 55, 0.25)",
            5, "rgba(140, 105, 55, 0.60)",
          ],
          "line-width": [
            "interpolate", ["linear"], ["get", "index"],
            1, 0.5,
            5, 1.4,
          ],
        },
      });

      // ── River overlay — boost water visibility ────────────────────────────
      map.addLayer({
        id:             "river-overlay",
        type:           "line",
        source:         "terrain-v2",
        "source-layer": "contour",   // rivers come via waterway in streets tileset
        slot:           "middle",
        filter:         ["==", ["get", "class"], "river"],
        paint: {
          "line-color":   "#3a9bd5",
          "line-width":   3,
          "line-opacity": 0.8,
        },
      });

      // ── Route source + layer (slot: "top" — always on top) ───────────────
      map.addSource("route-source", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id:     "route-layer",
        type:   "line",
        source: "route-source",
        slot:   "top",
        layout: { "line-join": "round", "line-cap": "round" },
        paint:  { "line-color": "#2563eb", "line-width": 5, "line-opacity": 0.92 },
      });

      syncCampsiteMarkers();
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current     = null;
      mapLoadedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-background">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <div className="flex h-full min-h-0 w-[380px] shrink-0 flex-col border-r border-border bg-card overflow-hidden">

        {(mapAgentsPending || landRulesPending) && (
          <div
            className="flex shrink-0 items-center gap-2.5 border-b border-border bg-muted/40 px-4 py-2.5"
            role="status"
            aria-live="polite"
          >
            <div
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/70"
              aria-hidden
            />
            <p className="text-[11px] leading-snug text-muted-foreground">
              {mapAgentsPending && landRulesPending
                ? "Agents are still fetching map pins and land rules…"
                : mapAgentsPending
                  ? "Agents are still fetching map coordinates…"
                  : "Loading land rules for this area…"}
            </p>
          </div>
        )}

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <button
            onClick={selectedCampsite ? handleBackToList : onBack}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {selectedCampsite ? "All campsites" : "New search"}
          </button>
          <h1 className="text-sm font-semibold text-foreground">
            {selectedCampsite
              ? selectedCampsite.name
              : `Campsites near ${preferences.location}`}
          </h1>
          {!selectedCampsite && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {campsites.length} spots found
            </p>
          )}
        </div>

        <MapAgentHintsBanner hints={mapAgentHints} />

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto">

          {/* ── Campsite list ── */}
          {!selectedCampsite && (
            <div className="p-3 space-y-2">
              {campsites.map((site, i) => (
                <button
                  key={site.id}
                  onClick={() => onSelectCampsite(site)}
                  className="w-full text-left p-3.5 rounded-xl border border-border
                             hover:border-foreground/25 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-foreground text-primary-foreground
                                    flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">{site.name}</p>
                        <span
                          className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0 rounded ${
                            site.source === "community_intel"
                              ? "bg-orange-500/15 text-orange-700 dark:text-orange-400"
                              : site.source === "topo_agent"
                                ? "bg-teal-500/15 text-teal-800 dark:text-teal-300"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {sourceBadgeLabel(site.source)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{site.description}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Star className="w-3 h-3 fill-current" />
                          {site.rating} ({site.reviews})
                        </span>
                        <span className="text-xs font-medium text-foreground">{site.price}</span>
                      </div>
                      {(site.features ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {(site.features ?? []).slice(0, 3).map((f) => (
                            <span key={f}
                              className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                              {FEATURE_LABELS[f]}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
              {(landRulesPending || landRulesText?.trim()) && (
                <div className="px-0 pt-2 pb-1">
                  <LandRulesSection text={landRulesText} loading={landRulesPending} />
                </div>
              )}
            </div>
          )}

          {/* ── Selected campsite detail + POIs ── */}
          {selectedCampsite && (
            <div className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                {sourceBadgeLabel(selectedCampsite.source)} · map point
              </p>
              <p className="text-sm text-muted-foreground mb-2">
                {selectedCampsite.description}
              </p>
              <div className="flex items-center gap-4 mb-3 text-sm">
                <span className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-current" />
                  {selectedCampsite.rating}
                  <span className="text-muted-foreground ml-1">({selectedCampsite.reviews})</span>
                </span>
                <span className="font-medium">{selectedCampsite.price}</span>
              </div>
              {(selectedCampsite.features ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {(selectedCampsite.features ?? []).map((f) => (
                    <span key={f}
                      className="text-xs bg-muted px-2.5 py-1 rounded-full text-foreground">
                      {FEATURE_LABELS[f]}
                    </span>
                  ))}
                </div>
              )}

              {(landRulesPending || landRulesText?.trim()) && (
                <div className="mb-5">
                  <LandRulesSection text={landRulesText} loading={landRulesPending} />
                </div>
              )}

              {/* Nearby Facilities */}
              <div className="border-t border-border pt-4">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3">
                  Nearby facilities (closest per category)
                </h3>

                {loadingPOIs && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Finding nearby places…
                  </div>
                )}

                {!loadingPOIs && pois.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No nearby facilities found.
                  </p>
                )}

                {!loadingPOIs && pois.length > 0 && (
                  <div className="space-y-2">
                    {pois.map((poi) => {
                      const isActive = selectedPOI?.id === poi.id;
                      return (
                        <button
                          key={poi.id}
                          onClick={() => onSelectPOI(poi, selectedCampsite)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${
                            isActive
                              ? "border-foreground/30 bg-foreground/5"
                              : "border-border hover:border-foreground/20 hover:bg-muted/30"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {/* Coloured ring icon */}
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
                              style={{
                                background: poi.color + "20",
                                border: `2px solid ${poi.color}`,
                              }}
                            >
                              {poi.emoji}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {poi.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {poi.category}
                                {poi.distanceLabel ? ` · ${poi.distanceLabel}` : ""}
                              </p>

                              {isActive && (
                                <div className="flex items-center gap-3 mt-1">
                                  {loadingRoute ? (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      Calculating route…
                                    </span>
                                  ) : routeInfo ? (
                                    <>
                                      <span className="flex items-center gap-1 text-xs text-blue-600">
                                        <Clock className="w-3 h-3" />
                                        {fmt_duration(routeInfo.duration)}
                                      </span>
                                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Navigation className="w-3 h-3" />
                                        {fmt_dist(routeInfo.distance)}
                                      </span>
                                    </>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Map ──────────────────────────────────────────────────────────── */}
      <div ref={mapContainer} className="min-h-0 min-w-0 flex-1" />
    </div>
  );
}
