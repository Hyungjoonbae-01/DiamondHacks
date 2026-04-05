import { computeSkyLightAtLocation } from "./sky-light";

/**
 * Add sun/moon snapshot for each site (Mapbox order: [lng, lat]).
 */
export function enrichCampsitesWithSkyLight(campsites, when = new Date()) {
  return campsites.map((site) => {
    const coords = site.coordinates;
    if (!Array.isArray(coords) || coords.length !== 2) {
      return { ...site, skyLight: null };
    }
    const skyLight = computeSkyLightAtLocation(coords, when);
    return { ...site, skyLight };
  });
}
