import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

/**
 * One GET, loaded when the screen opens and again on pull-to-refresh. `data` is
 * null until the first answer for this path, so a screen can tell "loading"
 * from "empty" — and switching tabs never shows the other tab's list. A slow
 * answer that arrives after the screen moved on is dropped.
 */
export function useApi<T>(path: string | null) {
  const [result, setResult] = useState<{ path: string; data: T | null; error: string | null } | null>(null);
  const [version, setVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!path) return;
    let stale = false;
    api<T>(path)
      .then((data) => {
        if (!stale) setResult({ path, data, error: null });
      })
      .catch((err: unknown) => {
        if (stale) return;
        const error = err instanceof Error ? err.message : String(err);
        // Keep what was already on screen; a failed refresh should not blank it.
        setResult((prev) => ({ path, data: prev?.path === path ? prev.data : null, error }));
      })
      .finally(() => {
        if (!stale) setRefreshing(false);
      });
    return () => {
      stale = true;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const refresh = useCallback(() => {
    setRefreshing(true);
    setVersion((v) => v + 1);
  }, []);

  const current = result?.path === path ? result : null;
  return { data: current?.data ?? null, error: current?.error ?? null, refreshing, refresh, reload };
}
