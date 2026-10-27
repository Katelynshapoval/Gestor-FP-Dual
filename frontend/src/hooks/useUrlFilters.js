import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

// List filters kept in the query string (Phase 4): links from the dashboard
// open a list already filtered, the back button restores the previous filters
// and a filtered list can be bookmarked. Values equal to their default are
// left out of the URL. The same names are meant for the server-side
// pagination of Phase 5 (PM-1).
export function useUrlFilters(defaults) {
  const [params, setParams] = useSearchParams();

  const values = useMemo(() => {
    const out = {};
    for (const [key, fallback] of Object.entries(defaults)) {
      out[key] = params.has(key) ? params.get(key) : fallback;
    }
    return out;
    // `defaults` is a literal per screen; its content is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, JSON.stringify(defaults)]);

  const setFilters = useCallback(
    (patch) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === defaults[key] || value == null) next.delete(key);
            else next.set(key, String(value));
          }
          return next;
        },
        { replace: true },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setParams, JSON.stringify(defaults)],
  );

  const setFilter = useCallback((key, value) => setFilters({ [key]: value }), [setFilters]);

  const reset = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const key of Object.keys(defaults)) next.delete(key);
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setParams, JSON.stringify(defaults)]);

  const active = Object.keys(defaults).some((key) => values[key] !== defaults[key]);

  return { filters: values, setFilter, setFilters, reset, active };
}
