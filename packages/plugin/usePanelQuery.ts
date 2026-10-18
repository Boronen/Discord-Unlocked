import { React } from "@webpack/common";
import type { StudioClient } from "./client.js";

/** Read-only panel state. Mount only after the caller's owner/moderator gate. */
export function usePanelQuery<T>(api: StudioClient, path: string) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const generation = React.useRef(0);
  const alive = React.useRef(false);
  const refresh = React.useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const value = await api.request<T>(path);
      if (alive.current && ticket === generation.current) setData(value);
    } catch (reason) {
      if (alive.current && ticket === generation.current)
        setError(reason instanceof Error ? reason.message : "This list could not be loaded. Try again.");
    } finally {
      if (alive.current && ticket === generation.current) setLoading(false);
    }
  }, [api, path]);
  React.useEffect(() => {
    alive.current = true;
    setData(null);
    void refresh();
    const unsubscribe = api.subscribe(() => {
      if (api.canView) return;
      ++generation.current;
      setData(null);
      setLoading(false);
      setError("Community access is unavailable. Reconnect your account to continue.");
    });
    return () => {
      alive.current = false;
      ++generation.current;
      unsubscribe();
    };
  }, [api, refresh]);
  return { data, loading, error, refresh, updateData: setData };
}
