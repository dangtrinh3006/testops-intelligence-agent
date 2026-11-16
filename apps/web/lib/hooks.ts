"use client";

import { useSyncExternalStore } from "react";
import { api } from "./api";
import { useApi } from "./useApi";

export const useHealth = () => useApi("health", () => api.health());
export const useOverview = () => useApi("overview", () => api.overview());
export const useKnowledge = () => useApi("knowledge", () => api.knowledge());
export const useRun = (runId: string | null) => useApi(runId ? `run:${runId}` : null, () => api.run(runId!));

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
/** Live prefers-reduced-motion; false on the server so hydration matches. */
export const useReducedMotion = () =>
  useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
