"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { VisibleSky } from "@/lib/astronomy";
import type { AstronomyWorkerRequest, AstronomyWorkerResponse } from "@/lib/astronomyWorkerTypes";

type WorkerInput = {
  dateTime: string;
  location: {
    latitude: number;
    longitude: number;
    timezone: string;
  };
  width: number;
  height: number;
  showConstellations: boolean;
  enabled?: boolean;
};

function createKey(input: WorkerInput) {
  return [
    input.dateTime,
    input.location.latitude,
    input.location.longitude,
    input.location.timezone,
    input.width,
    input.height,
    input.showConstellations ? "1" : "0",
  ].join("|");
}

export function useAstronomyWorker(input: WorkerInput) {
  const enabled = input.enabled ?? true;
  const [sky, setSky] = useState<VisibleSky | null>(null);
  const [pending, setPending] = useState(false);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const nextIdRef = useRef(0);
  const idToKeyRef = useRef<Map<number, string>>(new Map());
  const cacheRef = useRef<Map<string, VisibleSky | null>>(new Map());
  const activeKeyRef = useRef("");

  const requestKey = useMemo(() => createKey(input), [input]);

  useEffect(() => {
    activeKeyRef.current = requestKey;
  }, [requestKey]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (typeof Worker === "undefined") {
      setSupported(false);
      return;
    }

    try {
      const worker = new Worker(new URL("../workers/astronomy.worker.ts", import.meta.url), {
        type: "module",
      });
      workerRef.current = worker;
      setSupported(true);

      worker.onmessage = (event: MessageEvent<AstronomyWorkerResponse>) => {
        const { id, sky: nextSky, error: nextError } = event.data;
        const key = idToKeyRef.current.get(id);
        if (!key) return;
        idToKeyRef.current.delete(id);
        if (!nextError) {
          cacheRef.current.set(key, nextSky);
        }
        if (key !== activeKeyRef.current) return;
        if (nextError) {
          setError(nextError);
        } else {
          setError(null);
        }
        setSky(nextSky);
        setPending(false);
      };

      worker.onerror = () => {
        setSupported(false);
        setError("worker_runtime_error");
        setPending(false);
      };

      return () => {
        workerRef.current?.terminate();
        workerRef.current = null;
      };
    } catch {
      setSupported(false);
      setError("worker_init_error");
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !supported) return;
    if (input.width <= 0 || input.height <= 0) return;
    const worker = workerRef.current;
    if (!worker) return;

    if (cacheRef.current.has(requestKey)) {
      setSky(cacheRef.current.get(requestKey) ?? null);
      setError(null);
      setPending(false);
      return;
    }

    setError(null);
    setPending(true);
    const requestId = ++nextIdRef.current;
    idToKeyRef.current.set(requestId, requestKey);
    const payload: AstronomyWorkerRequest = {
      id: requestId,
      dateTime: input.dateTime,
      location: input.location,
      width: input.width,
      height: input.height,
      showConstellations: input.showConstellations,
    };
    worker.postMessage(payload);
  }, [
    enabled,
    input.dateTime,
    input.height,
    input.location,
    input.showConstellations,
    input.width,
    requestKey,
    supported,
  ]);

  return { sky, pending, supported, error };
}
