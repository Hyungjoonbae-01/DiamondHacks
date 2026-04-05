import SunCalc from "suncalc";

/**
 * Map lunar phase (0–1) to a short label. See suncalc getMoonIllumination docs.
 */
function moonPhaseLabel(phase) {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.0625 || p >= 0.9375) return "New Moon";
  if (p < 0.1875) return "Waxing Crescent";
  if (p < 0.3125) return "First Quarter";
  if (p < 0.4375) return "Waxing Gibbous";
  if (p < 0.5625) return "Full Moon";
  if (p < 0.6875) return "Waning Gibbous";
  if (p < 0.8125) return "Last Quarter";
  return "Waning Crescent";
}

function formatHm(date) {
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDaylightHours(hours) {
  const hPart = Math.floor(hours);
  const mPart = Math.round((hours - hPart) * 60);
  if (mPart === 60) return `${hPart + 1}h`;
  return mPart ? `${hPart}h ${mPart}m` : `${hPart}h`;
}

/**
 * Sun and moon metrics at a point for a given calendar day (local interpretation via Date).
 * Coordinates are Mapbox-style [longitude, latitude].
 *
 * @param {[number, number]} lngLat
 * @param {Date} [when]
 */
export function computeSkyLightAtLocation(lngLat, when = new Date()) {
  const [lng, lat] = lngLat;
  const times = SunCalc.getTimes(when, lat, lng);

  let daylightMs = times.sunset - times.sunrise;
  if (!Number.isFinite(daylightMs) || daylightMs < 0) {
    daylightMs = 0;
  }
  const daylightHours = daylightMs / (1000 * 60 * 60);

  const noonPos = SunCalc.getPosition(times.solarNoon, lat, lng);
  const peakSunAltitudeDeg = (noonPos.altitude * 180) / Math.PI;

  const moonIllum = SunCalc.getMoonIllumination(when);
  const moonTimes = SunCalc.getMoonTimes(when, lat, lng);

  const illuminationPct = Math.round(moonIllum.fraction * 100);
  const phaseLabel = moonPhaseLabel(moonIllum.phase);

  let moonlightLevel = "Low";
  if (illuminationPct >= 75) moonlightLevel = "Bright";
  else if (illuminationPct >= 40) moonlightLevel = "Moderate";
  else if (illuminationPct >= 15) moonlightLevel = "Dim";

  return {
    dateLabel: when.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
    sunriseFormatted: formatHm(times.sunrise),
    sunsetFormatted: formatHm(times.sunset),
    daylightHours,
    daylightHoursFormatted: formatDaylightHours(daylightHours),
    peakSunAltitudeDeg: Math.round(peakSunAltitudeDeg * 10) / 10,
    moonIlluminationPercent: illuminationPct,
    moonPhaseLabel: phaseLabel,
    moonRiseFormatted: formatHm(moonTimes.rise),
    moonSetFormatted: formatHm(moonTimes.set),
    moonAlwaysUp: moonTimes.alwaysUp === true,
    moonAlwaysDown: moonTimes.alwaysDown === true,
    moonlightLevel,
  };
}
