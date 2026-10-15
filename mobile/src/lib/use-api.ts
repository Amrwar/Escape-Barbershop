import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { api } from "./api";

/**
 * One GET, loaded whenever the screen comes into view — so a booking made on
 * one tab is already on the next — and again on pull-to-refresh. `data` is
 * null until the first answer for this path, so a screen can tell "loading"
 * from "empty", and switching tabs never shows the other tab's list. An answer
 * that arrives after the screen has moved on is dropped.
 */
export function useApi<T>(path: string | null) {
  const [result, setResult] = useState<{ path: string; data: T | null; error: string | null } | null>(null);
  const [version, setVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
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
        setRefreshing(false);
      };
      // `version` is how reload and refresh ask for the same path again.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [path, version])
  );

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const refresh = useCallback(() => {
    setRefreshing(true);
    setVersion((v) => v + 1);
  }, []);

  const current = result?.path === path ? result : null;
  return { data: current?.data ?? null, error: current?.error ?? null, refreshing, refresh, reload };
}
