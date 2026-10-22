/// <reference lib="webworker" />

import { computeVisibleStars } from "@/lib/astronomy";
import type { AstronomyWorkerRequest, AstronomyWorkerResponse } from "@/lib/astronomyWorkerTypes";

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<AstronomyWorkerRequest>) => {
  const { id, dateTime, location, width, height, showConstellations } = event.data;
  try {
    // E-1: the request carries the exact stored instant — compute from it
    // directly instead of rebuilding it from wall-clock fields.
    if (!Number.isFinite(new Date(dateTime).getTime())) {
      const response: AstronomyWorkerResponse = { id, sky: null };
      workerScope.postMessage(response);
      return;
    }

    const sky = computeVisibleStars(
      {
        datetimeISO: dateTime,
        lat: location.latitude,
        lon: location.longitude,
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
