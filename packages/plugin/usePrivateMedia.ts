import { React } from "@webpack/common";
import type { StudioClient } from "./client.js";

/** Retain the displayed batch until its replacement has committed, then release it. */
export function usePrivateMedia(
  api: StudioClient,
  requests: readonly (readonly [string, string])[],
  attempt = 0,
) {
  const key = JSON.stringify(requests);
  const owned = React.useRef(new Set<AbortController>());
  const displayed = React.useRef<AbortController | null>(null);
  const [batch, setBatch] = React.useState<{
    urls: Record<string, string>;
    failed: boolean;
    owner: AbortController | null;
  }>({ urls: {}, failed: false, owner: null });
  React.useLayoutEffect(() => {
    const previous = displayed.current;
    displayed.current = batch.owner;
    if (previous && previous !== batch.owner) {
      previous.abort();
      owned.current.delete(previous);
    }
  }, [batch]);
  React.useEffect(() => {
    const owner = new AbortController();
    owned.current.add(owner);
    let canceled = false;
    const selected = JSON.parse(key) as [string, string][];
    void Promise.allSettled(
      selected.map(async ([id, url]) => [id, await api.privateMedia(url, owner.signal)] as const),
    ).then((results) => {
      if (!canceled && !owner.signal.aborted)
        setBatch({
          urls: Object.fromEntries(results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))),
          failed: results.some((r) => r.status === "rejected"),
          owner,
        });
    });
    return () => {
      canceled = true;
      if (displayed.current !== owner) {
        owner.abort();
        owned.current.delete(owner);
      }
    };
  }, [api, key, attempt]);
  React.useEffect(
    () => () => {
      owned.current.forEach((owner) => owner.abort());
      owned.current.clear();
    },
    [],
  );
  React.useEffect(
    () =>
      api.subscribe(() => {
        if (api.canView) return;
        owned.current.forEach((owner) => owner.abort());
        owned.current.clear();
        displayed.current = null;
        setBatch({ urls: {}, failed: false, owner: null });
      }),
    [api],
  );
  return batch;
}
