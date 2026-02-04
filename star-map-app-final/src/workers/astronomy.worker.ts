/// <reference lib="webworker" />

import { computeVisibleStars } from "@/lib/astronomy";
import { formatDateTimeForLocation } from "@/lib/dateTime";
import type { AstronomyWorkerRequest, AstronomyWorkerResponse } from "@/lib/astronomyWorkerTypes";

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<AstronomyWorkerRequest>) => {
  const { id, dateTime, location, width, height, showConstellations } = event.data;
  try {
    const formatted = formatDateTimeForLocation(dateTime, location.timezone);
    if (!formatted) {
      const response: AstronomyWorkerResponse = { id, sky: null };
      workerScope.postMessage(response);
      return;
    }

    const sky = computeVisibleStars(
      {
        date: formatted.date,
        time: formatted.time,
        lat: location.latitude,
        lon: location.longitude,
        timezone: location.timezone,
        bortle: 4.5,
        showConstellations,
      },
      width,
      height,
    );

    const response: AstronomyWorkerResponse = { id, sky };
    workerScope.postMessage(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_worker_error";
    const response: AstronomyWorkerResponse = { id, sky: null, error: message };
    workerScope.postMessage(response);
  }
};
