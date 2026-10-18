import { usePanelQuery } from "../usePanelQuery.js";
import { StudioState } from "../studio-state.js";
import { usePrivateMedia } from "../usePrivateMedia.js";
import { React } from "@webpack/common";
import { DEFAULT_CONFIG, type MediaAsset, type ProfileRevision } from "../model.js";
import type { StyleShare } from "../studio-model.js";
import { StudioField as Field, StudioAction as Action, StudioChoice as Choice } from "../studio-controls.js";
import { ProfilePreview } from "../visuals.js";
import type { CommunityProps as Props } from "./types.js";
import { StudioDialog } from "../studio-dialogs.js";

export function ReviewPanel(props: Props) {
  const [review, setReview] = React.useState<{
      revision: ProfileRevision;
      baseline: ProfileRevision | null;
      assets: MediaAsset[];
      changes: string[];
    } | null>(null),
    [share, setShare] = React.useState<StyleShare | null>(null),
    [reason, setReason] = React.useState(""),
    [full, setFull] = React.useState(false),
    [phase, setPhase] = React.useState<"" | "intro" | "idle" | "hover">(""),
    [replay, setReplay] = React.useState(0);
  const {
    data: queue,
    loading,
    error,
    refresh,
  } = usePanelQuery<{ profiles: ProfileRevision[]; shares: StyleShare[] }>(props.api, "/v2/moderation/queue");
  const [assets, setAssets] = React.useState<MediaAsset[]>([]);
  const { urls } = usePrivateMedia(
    props.api,
    assets.map((a) => [a.id, props.reduced && a.previewUrl ? a.previewUrl : a.url]),
  );
  async function decide(action: "approve" | "reject") {
    const id = review?.revision.id ?? share?.id;
    if (!id) return;
    await props.api.request(`/v2/moderation/${share ? "styles/" : ""}${id}/decision`, "POST", {
      action,
      reason: reason.trim() || undefined,
    });
    setReview(null);
    setShare(null);
    setAssets([]);
    setReason("");
    await refresh();
    await props.onRefresh();
    props.onMessage(
      action === "approve" ? "The exact submitted version was approved." : "Submission rejected.",
    );
  }
  return (
    <section>
      <h3>Moderation queue</h3>
      <Action variant="secondary" busy={loading} onClick={() => void refresh()}>
        Refresh queue
      </Action>
      {error && (
        <StudioState
          title="Review queue could not be refreshed"
          error
          retry={() => void refresh()}
          busy={loading}
        >
          {error}
        </StudioState>
      )}
      {loading && (
        <p className="ps-help" role="status">
          {queue ? "Refreshing review queue…" : "Loading review queue…"}
        </p>
      )}
      {queue && !queue.profiles.length && !queue.shares.length && (
        <StudioState title="No pending submissions">
          New profile and shared-style submissions will appear here.
        </StudioState>
      )}
      {(queue?.profiles ?? []).map((r) => (
        <Action
          key={r.id}
          variant="secondary"
          onClick={() =>
            void props.onRun(async () => {
              const value = await props.api.request<NonNullable<typeof review>>(`/v2/moderation/${r.id}`);
              setReview(value);
              setShare(null);
              setAssets(value.assets);
            })
          }
        >
          Review profile · {r.userId} · {r.id.slice(0, 8)}
        </Action>
      ))}
      {(queue?.shares ?? []).map((s) => (
        <Action
          key={s.id}
          variant="secondary"
          onClick={() =>
            void props.onRun(async () => {
              const value = await props.api.request<{ share: StyleShare; assets: MediaAsset[] }>(
                `/v2/styles/${s.id}`,
              );
              setShare(value.share);
              setReview(null);
              setAssets(value.assets);
            })
          }
        >
          Review shared style · {s.title}
        </Action>
      ))}
      {(review || share) && (
        <StudioDialog
          title={share ? "Review shared style" : "Compare submitted profile"}
          className="ps-review-dialog"
          onClose={() => {
            setReview(null);
            setShare(null);
            setAssets([]);
          }}
        >
          <div className="ps-actions">
            <label className="ps-checkbox">
              <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />
              Full profile
            </label>
            <Field id="ps-review-phase" label="Animation role">
              <Choice
                id="ps-review-phase"
                value={phase}
                onChange={(v) => setPhase(v as typeof phase)}
                options={[
                  { value: "", label: "Automatic" },
                  { value: "intro", label: "Intro" },
                  { value: "idle", label: "Idle" },
                  { value: "hover", label: "Hover" },
                ]}
              />
            </Field>
            <Action variant="secondary" onClick={() => setReplay((v) => v + 1)}>
              Replay
            </Action>
          </div>
          <div className="ps-review-cards">
            {review ? (
              <>
                <div>
                  <h4>Published at submission</h4>
                  <ProfilePreview
                    config={review.baseline?.config ?? DEFAULT_CONFIG}
                    artworkLoader={props.artworkLoader}
                    urls={urls}
                    items={props.items}
                    account={{ name: review.revision.userId }}
                    reduced={props.reduced}
                    full={full}
                    forcedPhase={phase || undefined}
                    key={`before:${replay}`}
                  />
                </div>
                <div>
                  <h4>Submitted snapshot</h4>
                  <ProfilePreview
                    config={review.revision.config}
                    artworkLoader={props.artworkLoader}
                    urls={urls}
                    items={props.items}
                    account={{ name: review.revision.userId }}
                    reduced={props.reduced}
                    full={full}
                    forcedPhase={phase || undefined}
                    key={`after:${replay}`}
                  />
                </div>
              </>
            ) : (
              share?.variants.map((v) => (
                <div key={`${v.revisionId}:${replay}`}>
                  <h4>{v.name}</h4>
                  <ProfilePreview
                    config={v.config}
                    urls={urls}
                    items={props.items}
                    account={{ name: share.title }}
                    reduced={props.reduced}
                    full={full}
                    forcedPhase={phase || undefined}
                  />
                </div>
              ))
            )}
          </div>
          {review && (
            <details open>
              <summary>{review.changes.length} changed fields</summary>
              <ul>
                {review.changes.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
            </details>
          )}
          {share && <p>Upload copying: {share.copyUploads ? "Creator consented" : "Not permitted"}</p>}
          <Field id="ps-review-reason" label="Decision reason" help="A reason is required for rejection.">
            <textarea
              className="resize-none"
              id="ps-review-reason"
              rows={3}
              maxLength={1000}
              style={{ resize: "none" }}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="ps-actions">
            <Action onClick={() => void props.onRun(() => decide("approve"))}>Approve exact version</Action>
            <Action
              variant="secondary"
              disabled={!reason.trim()}
              onClick={() => void props.onRun(() => decide("reject"))}
            >
              Reject with reason
            </Action>
          </div>
        </StudioDialog>
      )}
    </section>
  );
}
