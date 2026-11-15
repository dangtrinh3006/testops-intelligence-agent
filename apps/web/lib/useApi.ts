"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";

export interface ApiState<T> {
  data: T | undefined;
  error: ApiError | Error | undefined;
  loading: boolean;
  reload: () => void;
}

// Shared in-flight/settled promises so the header and pages do not refetch the same resource.
const cache = new Map<string, Promise<unknown>>();

export function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fetcher();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

export function invalidate(key: string) {
  cache.delete(key);
}

export function useApi<T>(key: string | null, fetcher: () => Promise<T>): ApiState<T> {
  const [state, setState] = useState<{ key: string | null; data?: T; error?: ApiError | Error }>({ key: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (key === null) return;
    let alive = true;
    cached(key, fetcher).then(
      (data) => alive && setState({ key, data }),
      (error: unknown) => alive && setState({ key, error: error instanceof Error ? error : new Error(String(error)) }),
    );
    return () => {
      alive = false;
    };
    // fetcher is keyed by `key`; re-running on identity change would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  const reload = useCallback(() => {
    if (key) invalidate(key);
    setState({ key: null });
    setNonce((n) => n + 1);
  }, [key]);

  const current = state.key === key;
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : undefined,
    loading: key !== null && (!current || (state.data === undefined && state.error === undefined)),
    reload,
  };
}
