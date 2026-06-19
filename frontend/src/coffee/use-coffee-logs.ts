import React from 'react';
import type { CoffeeLog } from './types';

const API_BASE = localStorage.getItem("edp_api") || "/api";

interface UseCoffeeLogsParams {
  nota_pk?: number;
  tipo?: string;
  limit?: number;
}

interface UseCoffeeLogsResult {
  logs: CoffeeLog[];
  loading: boolean;
  refresh: () => void;
}

export function useCoffeeLogs(params?: UseCoffeeLogsParams): UseCoffeeLogsResult {
  const [logs, setLogs] = React.useState<CoffeeLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [tick, setTick] = React.useState(0);
  const key = JSON.stringify(params ?? {});

  const refresh = React.useCallback(() => setTick((t) => t + 1), []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const qs = new URLSearchParams();
    if (params?.nota_pk !== undefined) qs.set("nota_pk", String(params.nota_pk));
    if (params?.tipo) qs.set("tipo", params.tipo);
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";

    fetch(`${API_BASE}/coffee/logs${suffix}`, { headers: { Accept: "application/json" } })
      .then((res) => {
        if (!res.ok) throw new Error(`GET /coffee/logs -> ${res.status}`);
        return res.json();
      })
      .then((data: { logs: CoffeeLog[] }) => {
        if (!cancelled) { setLogs(data.logs); setLoading(false); }
      })
      .catch(() => {
        if (!cancelled) { setLogs([]); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [key, tick]);

  return { logs, loading, refresh };
}
