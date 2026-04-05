import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  ArrowLeft,
  Star,
  Clock,
  Navigation,
  Loader2,
  ExternalLink,
  Sun,
  Moon,
} from "lucide-react";
import { MAPBOX_TOKEN, fetchRoute } from "@/lib/mapbox";
import { fetchNearbyFacilities, facilitiesToPoiMarkers } from "@/lib/facilities";
import {
  addCampsiteTentLayer,
  CAMPSITE_TENT_LAYER_ID,
  TENT_MIN_ZOOM,
} from "@/lib/mapbox-tent-layer";
import { fetchTrails } from "@/lib/trails";

mapboxgl.accessToken = MAPBOX_TOKEN;

const FEATURE_LABELS = {
  near_water:    "Near Water",
  accessibility: "Accessible",
  pet_friendly:  "Pet Friendly",
  rv_access:     "RV Access",
  hiking_trails: "Hiking Trails",
  fishing_spots: "Fishing Spots",
  campfires:     "Campfires",
  free:          "Free / dispersed",
};

const REPORT_LABELS = {
  topo_map: "Topo / map research",
  land_rules: "Land rules & permits",
  community_intel: "Community intel",
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

function makeCampsiteEl(label, selected) {
  const el = document.createElement("div");
  Object.assign(el.style, {
    width: "34px", height: "34px",
    background: selected ? "#111" : "#fff",
    color: selected ? "#fff" : "#111",
    border: `2.5px solid ${selected ? "#111" : "#ccc"}`,
    borderRadius: "50%",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "12px", fontWeight: "600",
    fontFamily: "system-ui, sans-serif",
    transition: "all 0.2s",
  });
  el.textContent = label;
  return el;
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

export function ResultsPage({
  preferences,
  campsites,
  researchMeta = null,
  onBack,
}) {
  const mapContainer  = useRef(null);
  const mapRef        = useRef(null);
  const mapLoadedRef  = useRef(false);
  const markerMapRef  = useRef(new Map()); // site.id → { marker, el }
  const poiMarkersRef = useRef([]);

  const [selectedCampsite, setSelectedCampsite] = useState(null);
  const [pois,             setPois]             = useState([]);
  const [selectedPOI,      setSelectedPOI]      = useState(null);
  const [routeInfo,        setRouteInfo]         = useState(null);
  const [loadingPOIs,      setLoadingPOIs]       = useState(false);
  const [loadingRoute,     setLoadingRoute]      = useState(false);

  // Stable refs for callbacks — avoids stale closures in map event handlers
  const onSelectCampsiteRef = useRef(null);
  const onSelectPOIRef      = useRef(null);
  /** Mutable: { lngLat: [lng,lat] | null } for 3D tent custom layer */
  const tentPlacementRef    = useRef({ lngLat: null });

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
    markerMapRef.current.forEach(({ el }, id) => {
      const sel = id === selectedId;
      Object.assign(el.style, {
        background: sel ? "#111" : "#fff",
        color:      sel ? "#fff" : "#111",
        border:     `2.5px solid ${sel ? "#111" : "#ccc"}`,
        transform:  sel ? "scale(1.2)" : "scale(1)",
      });
    });
  }

  // ── select campsite ────────────────────────────────────────────────────────
  async function onSelectCampsite(site) {
    setSelectedCampsite(site);
    setSelectedPOI(null);
    setRouteInfo(null);
    clearPOIMarkers();
    clearRoute();
    resetCampsiteMarkers(site.id);

    tentPlacementRef.current.lngLat = site.coordinates;

    mapRef.current?.flyTo({
      center: site.coordinates,
      zoom: Math.max(14.5, TENT_MIN_ZOOM + 0.25),
      pitch: 55,
      bearing: -20,
      duration: 1200,
    });

    setLoadingPOIs(true);
    setPois([]);
    try {
      // Per-campsite [lng, lat] — not preferences/search center — so each site gets its own nearby POIs.
      const [lng, lat] = site.coordinates;
      const facilities = await fetchNearbyFacilities(lat, lng);
      const nearby = facilitiesToPoiMarkers(facilities);
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

  // ── back to list ───────────────────────────────────────────────────────────
  function handleBackToList() {
    setSelectedCampsite(null);
    tentPlacementRef.current.lngLat = null;
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

      // ── OSM trails (Overpass) — filled async after map init ───────────────
      map.addSource("trails", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
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

      // ── 3D tent (glTF) at selected campsite; visible only at high zoom ───
      addCampsiteTentLayer(map, tentPlacementRef.current, {
        beforeId: "route-layer",
      });

      // Trails under tent + driving route
      map.addLayer(
        {
          id: "trails-line",
          type: "line",
          source: "trails",
          slot: "middle",
          paint: {
            "line-color": [
              "match",
              ["get", "surface"],
              "paved",
              "#4CAF50",
              "asphalt",
              "#4CAF50",
              "concrete",
              "#5a9e8f",
              "dirt",
              "#8B4513",
              "ground",
              "#8B4513",
              "earth",
              "#8B4513",
              "gravel",
              "#FFA500",
              "fine_gravel",
              "#D9963B",
              "grass",
              "#3d6b2f",
              "wood",
              "#6B4423",
              "#2E8B57",
            ],
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              1,
              14,
              2.5,
              18,
              4,
            ],
            "line-opacity": 0.82,
            "line-dasharray": [0.8, 1.4],
          },
        },
        CAMPSITE_TENT_LAYER_ID
      );
      map.addLayer(
        {
          id: "trails-label",
          type: "symbol",
          source: "trails",
          slot: "middle",
          filter: ["!=", ["get", "name"], "Unnamed trail"],
          layout: {
            "symbol-placement": "line",
            "text-field": ["get", "name"],
            "text-size": 11,
            "text-offset": [0, 0.8],
            "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
            "text-max-angle": 30,
          },
          paint: {
            "text-color": "#1a5c40",
            "text-halo-color": "#ffffff",
            "text-halo-width": 2,
            "text-halo-blur": 0.5,
          },
          minzoom: 13,
        },
        CAMPSITE_TENT_LAYER_ID
      );

      // ── Campsite markers ──────────────────────────────────────────────────
      campsites.forEach((site, i) => {
        const el = makeCampsiteEl(i + 1, false);
        const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat(site.coordinates)
          .addTo(map);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectCampsiteRef.current?.(site);
        });
        markerMapRef.current.set(site.id, { marker, el });
      });

      // Fit all markers
      if (campsites.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        campsites.forEach((s) => bounds.extend(s.coordinates));
        map.fitBounds(bounds, { padding: 80, pitch: 62, bearing: -20 });
      }

      const [prefLng, prefLat] = preferences.coordinates;
      fetchTrails(prefLat, prefLng, 12000)
        .then((fc) => {
          const m = mapRef.current;
          if (!m?.getSource?.("trails")) return;
          m.getSource("trails").setData(fc);
        })
        .catch((err) => {
          console.warn("[trails] Overpass fetch failed:", err);
        });
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current     = null;
      mapLoadedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <div className="w-[380px] shrink-0 flex flex-col border-r border-border bg-card overflow-hidden">

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

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Campsite list ── */}
          {!selectedCampsite && campsites.length > 0 && (
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
                      <p className="text-sm font-medium text-foreground truncate">{site.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{site.description}</p>
                      {(site.rating != null ||
                        site.reviews != null ||
                        site.price != null) && (
                        <div className="flex items-center gap-3 mt-2">
                          {(site.rating != null || site.reviews != null) && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Star className="w-3 h-3 fill-current" />
                              {site.rating != null ? site.rating : "—"}
                              {site.reviews != null && (
                                <span>({site.reviews})</span>
                              )}
                            </span>
                          )}
                          {site.price != null && (
                            <span className="text-xs font-medium text-foreground">
                              {site.price}
                            </span>
                          )}
                        </div>
                      )}
                      {site.skyLight && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1" title="Approx. daylight today (clear sky, no terrain shade)">
                            <Sun className="w-3 h-3 shrink-0 text-amber-600" aria-hidden />
                            {site.skyLight.daylightHoursFormatted} sun
                          </span>
                          <span className="inline-flex items-center gap-1" title="Moon disk illumination; actual moonlight depends on weather and horizon">
                            <Moon className="w-3 h-3 shrink-0 text-slate-500" aria-hidden />
                            {site.skyLight.moonIlluminationPercent}% moon
                          </span>
                        </div>
                      )}
                      {site.features?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {site.features.slice(0, 3).map((f) => (
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
            </div>
          )}

          {!selectedCampsite && campsites.length === 0 && (
            <div className="p-4 space-y-4">
              {researchMeta?.researchError && (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {researchMeta.researchError}
                </p>
              )}
              <p className="text-sm text-muted-foreground leading-relaxed">
                No campsite coordinates were parsed from the topo research output. Open
                the sections below for full agent text (rules, community notes, and raw
                map research).
              </p>
              {researchMeta?.parse_note && (
                <p className="text-xs text-muted-foreground border border-border/60 rounded-lg px-3 py-2 bg-muted/20">
                  {researchMeta.parse_note}
                </p>
              )}
              {researchMeta?.reports &&
                Object.entries(researchMeta.reports).map(([id, row]) => (
                  <details
                    key={id}
                    className="rounded-xl border border-border bg-muted/15 text-sm open:bg-muted/25"
                  >
                    <summary className="cursor-pointer px-3 py-2.5 font-medium text-foreground">
                      {REPORT_LABELS[id] ?? id}
                      {row?.status && row.status !== "complete" && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          ({row.status})
                        </span>
                      )}
                    </summary>
                    <div className="px-3 pb-3 pt-0 space-y-2">
                      {row?.error && (
                        <p className="text-xs text-destructive">{row.error}</p>
                      )}
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background/80 p-2 text-xs text-muted-foreground border border-border/50">
                        {(row?.output || "").trim() || "(no output)"}
                      </pre>
                    </div>
                  </details>
                ))}
            </div>
          )}

          {/* ── Selected campsite detail + POIs ── */}
          {selectedCampsite && (
            <div className="p-4">
              <p className="text-sm text-muted-foreground mb-2">
                {selectedCampsite.description}
              </p>
              {selectedCampsite.website && (
                <a
                  href={selectedCampsite.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-4 decoration-foreground/40 hover:decoration-foreground mb-3"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden />
                  Official site and booking
                </a>
              )}
              {selectedCampsite.confidence && (
                <p className="text-xs text-muted-foreground mb-2">
                  Model confidence: {selectedCampsite.confidence}
                </p>
              )}
              {(selectedCampsite.rating != null ||
                selectedCampsite.reviews != null ||
                selectedCampsite.price != null) && (
                <div className="flex items-center gap-4 mb-3 text-sm">
                  {(selectedCampsite.rating != null ||
                    selectedCampsite.reviews != null) && (
                    <span className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      {selectedCampsite.rating != null
                        ? selectedCampsite.rating
                        : "—"}
                      {selectedCampsite.reviews != null && (
                        <span className="text-muted-foreground ml-1">
                          ({selectedCampsite.reviews})
                        </span>
                      )}
                    </span>
                  )}
                  {selectedCampsite.price != null && (
                    <span className="font-medium">{selectedCampsite.price}</span>
                  )}
                </div>
              )}
              {selectedCampsite.features?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-5">
                  {selectedCampsite.features.map((f) => (
                    <span key={f}
                      className="text-xs bg-muted px-2.5 py-1 rounded-full text-foreground">
                      {FEATURE_LABELS[f]}
                    </span>
                  ))}
                </div>
              )}

              {selectedCampsite.skyLight && (
                <div className="rounded-xl border border-border bg-muted/25 p-3.5 mb-5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Sun &amp; moon · {selectedCampsite.skyLight.dateLabel}
                  </p>
                  <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
                    Astronomy for this exact lat/lon (clear sky). Trees, cliffs, and weather change what you actually see on the ground.
                  </p>
                  <div className="space-y-2.5 text-sm">
                    <div className="flex gap-2">
                      <Sun className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" aria-hidden />
                      <div>
                        <p className="font-medium text-foreground">Direct sunlight (today)</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          About{" "}
                          <span className="text-foreground font-medium tabular-nums">
                            {selectedCampsite.skyLight.daylightHoursFormatted}
                          </span>{" "}
                          between sunrise and sunset
                          {selectedCampsite.skyLight.sunriseFormatted &&
                            selectedCampsite.skyLight.sunsetFormatted && (
                              <>
                                {" "}
                                ({selectedCampsite.skyLight.sunriseFormatted}–
                                {selectedCampsite.skyLight.sunsetFormatted})
                              </>
                            )}
                          . Peak sun angle at solar noon:{" "}
                          <span className="text-foreground font-medium tabular-nums">
                            {selectedCampsite.skyLight.peakSunAltitudeDeg}°
                          </span>{" "}
                          above the horizon.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Moon className="w-4 h-4 shrink-0 text-slate-500 mt-0.5" aria-hidden />
                      <div>
                        <p className="font-medium text-foreground">Moonlight (phase)</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <span className="text-foreground font-medium">
                            {selectedCampsite.skyLight.moonPhaseLabel}
                          </span>
                          {" · "}
                          disk{" "}
                          <span className="text-foreground font-medium tabular-nums">
                            {selectedCampsite.skyLight.moonIlluminationPercent}%
                          </span>{" "}
                          illuminated — typical night brightness:{" "}
                          <span className="text-foreground font-medium">
                            {selectedCampsite.skyLight.moonlightLevel}
                          </span>
                          .
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {selectedCampsite.skyLight.moonAlwaysUp && (
                            <>Moon above horizon all night (polar-region pattern for this date).</>
                          )}
                          {selectedCampsite.skyLight.moonAlwaysDown && (
                            <>Moon stays below the horizon tonight from this location.</>
                          )}
                          {!selectedCampsite.skyLight.moonAlwaysUp &&
                            !selectedCampsite.skyLight.moonAlwaysDown && (
                              <>
                                {selectedCampsite.skyLight.moonRiseFormatted && (
                                  <>Moonrise ~{selectedCampsite.skyLight.moonRiseFormatted}</>
                                )}
                                {selectedCampsite.skyLight.moonRiseFormatted &&
                                  selectedCampsite.skyLight.moonSetFormatted &&
                                  " · "}
                                {selectedCampsite.skyLight.moonSetFormatted && (
                                  <>Moonset ~{selectedCampsite.skyLight.moonSetFormatted}</>
                                )}
                                {!selectedCampsite.skyLight.moonRiseFormatted &&
                                  !selectedCampsite.skyLight.moonSetFormatted &&
                                  "Rise/set times unavailable for this date/location."}
                              </>
                            )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Nearby facilities: Mapbox Search Box, bbox ~20 km, ≤25 km straight-line */}
              <div className="border-t border-border pt-4">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-1">
                  Nearby facilities
                </h3>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Closest POI per category within about 25 km of this campsite (Search Box + local bbox). Tap for driving directions on the map.
                </p>

                {loadingPOIs && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Finding nearby facilities…
                  </div>
                )}

                {!loadingPOIs && pois.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No nearby facilities found for these categories.
                  </p>
                )}

                {!loadingPOIs && pois.length > 0 && (
                  <ul className="space-y-2 list-none p-0 m-0">
                    {pois.map((poi) => {
                      const isActive = selectedPOI?.id === poi.id;
                      return (
                        <li key={poi.id}>
                        <button
                          type="button"
                          onClick={() => onSelectPOI(poi, selectedCampsite)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${
                            isActive
                              ? "border-foreground/30 bg-foreground/5"
                              : "border-border hover:border-foreground/20 hover:bg-muted/30"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
                                style={{
                                  background: poi.color + "20",
                                  border: `2px solid ${poi.color}`,
                                }}
                              >
                                {poi.emoji}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs text-muted-foreground">
                                  {poi.category}
                                </p>
                                <p className="text-sm font-medium text-foreground truncate">
                                  {poi.name}
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
                            {poi.distanceKm != null && (
                              <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0">
                                {poi.distanceKm.toFixed(1)} km
                              </span>
                            )}
                          </div>
                        </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Map ──────────────────────────────────────────────────────────── */}
      <div ref={mapContainer} className="flex-1 min-w-0" />
    </div>
  );
}
