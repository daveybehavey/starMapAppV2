import type { VisibleSky } from "./astronomy";

export type AstronomyWorkerRequest = {
  id: number;
  dateTime: string;
  location: {
    latitude: number;
    longitude: number;
    timezone: string;
  };
  width: number;
  height: number;
  showConstellations: boolean;
};

export type AstronomyWorkerResponse = {
  id: number;
  sky: VisibleSky | null;
  error?: string;
};
