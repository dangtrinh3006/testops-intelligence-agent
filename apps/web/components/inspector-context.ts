"use client";

import { createContext, useContext } from "react";

export interface InspectorApi {
  open: (id: string) => void;
}

export const InspectorContext = createContext<InspectorApi>({ open: () => {} });

export function useInspector(): InspectorApi {
  return useContext(InspectorContext);
}
