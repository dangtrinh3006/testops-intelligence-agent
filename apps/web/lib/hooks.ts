"use client";

import { api } from "./api";
import { useApi } from "./useApi";

export const useHealth = () => useApi("health", () => api.health());
export const useOverview = () => useApi("overview", () => api.overview());
export const useKnowledge = () => useApi("knowledge", () => api.knowledge());
export const useRun = (runId: string | null) => useApi(runId ? `run:${runId}` : null, () => api.run(runId!));
