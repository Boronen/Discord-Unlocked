import { React } from "@webpack/common";
import { ProfilePreview } from "./visuals.js";
import { PreviewFrame, PinnedPreview } from "./PreviewFrame.js";
import { StudioField as Field, StudioAction as Action } from "./studio-controls.js";
import { statusNames } from "./editor-labels.js";
import type { EditorProps } from "./editor-types.js";
import type { EditorController } from "./useEditorController.js";
export function LegacyAccount({
  controller,
  context,
}: {
  controller: EditorController;
  context: EditorProps;
}) {
  const { setMessage, busy, connected, devices, setDevices, deleteText, setDeleteText, run } = controller;
  const { api, onExportData } = context;

  return (
    connected && (
      <details className="ps-field">
        <summary>Account, devices and privacy</summary>
        <p>
          Sessions remain signed in for up to 90 days of inactivity. You can manage your data here even after
          leaving the community.
        </p>
        <div className="ps-actions">
          <Action
            variant="secondary"
            busy={busy}
            onClick={() => void run(async () => setDevices(await api.sessions()))}
          >
            Show signed-in devices
          </Action>
          <Action
            variant="secondary"
            busy={busy}
            onClick={() =>
              void run(async () => {
                if (onExportData) {
                  setMessage(
                    (await onExportData()) ? "Your account and media export was saved." : "Export cancelled.",
                  );
                  return;
                }
                const data = await api.exportData(),
                  url = URL.createObjectURL(
                    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
                  );
                const link = document.createElement("a");
                link.href = url;
                link.download = "profile-studio-data.json";
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setMessage("Data exported. The media manifest lists your authenticated file downloads.");
              })
            }
          >
            Export my data
          </Action>
          <Action
            variant="secondary"
            busy={busy}
            onClick={() =>
              void run(async () => {
                await api.revokeSession();
                await api.logout().catch(() => {});
              })
            }
          >
            Sign out all devices
          </Action>
        </div>
        {devices.map((device) => (
          <div className="ps-field" key={device.id}>
            <span>
              {device.name}
              {device.current ? " · This device" : ""} · Last used{" "}
              {new Date(device.lastSeenAt).toLocaleString("en-US")}
            </span>
            <Action
              variant="secondary"
              busy={busy}
              onClick={() =>
                void run(async () => {
                  await api.revokeSession(device.id);
                  if (device.current) await api.logout().catch(() => {});
                  else setDevices(await api.sessions());
                })
              }
            >
              Sign out this device
            </Action>
          </div>
        ))}
        <Field
          id="ps-delete-account"
          label="Delete my Profile Studio account"
          help="Your profile and access disappear immediately. Active files are removed within 24 hours; encrypted backups expire within 30 days. Type DELETE MY ACCOUNT to enable deletion."
        >
          <input
            id="ps-delete-account"
            value={deleteText}
            autoComplete="off"
            onChange={(event) => setDeleteText(event.target.value)}
          />
        </Field>
        <Action
          variant="secondary"
          disabled={deleteText !== "DELETE MY ACCOUNT"}
          busy={busy}
          onClick={() =>
            void run(async () => {
              await api.deleteAccount();
              setMessage("Your account was deleted. Active files will be removed within 24 hours.");
            })
          }
        >
          Permanently delete my account
        </Action>
      </details>
    )
  );
}
export function LegacyPairing({
  controller,
  context,
}: {
  controller: EditorController;
  context: EditorProps;
}) {
  const { setMessage, setError, busy, pair, setPair, run, beginPair } = controller;
  const { api } = context;

  return (
    <div className="ps-connect">
      <h3>Connect your account</h3>
      <p>The bot verifies your account with a one-time code. No Discord user token is needed.</p>
      {pair ? (
        <>
          <code className="ps-pair-code">/profile connect code:{pair.code}</code>
          <div className="ps-actions">
            <Action
              onClick={() =>
                void navigator.clipboard
                  .writeText(`/profile connect code:${pair.code}`)
                  .then(() => setMessage("Command copied."))
                  .catch(() => setError("Copy failed. Select and copy the command manually."))
              }
            >
              Copy command
            </Action>
            <Action
              variant="secondary"
              onClick={() => {
                api.pendingPair = undefined;
                setPair(null);
              }}
            >
              Cancel
            </Action>
          </div>
        </>
      ) : (
        <Action busy={busy} onClick={() => void run(beginPair)}>
          Pair with the bot
        </Action>
      )}
      <small>API: {api.base}. Your session is stored encrypted on this computer.</small>
    </div>
  );
}
export function LegacyCatalogAdmin({
  controller,
  context,
}: {
  controller: EditorController;
  context: EditorProps;
}) {
  const { state, setMessage, busy, run, load } = controller;
  const { api, importCatalog } = context;
  if (!state) return null;
  return (
    state.isOwner &&
    importCatalog && (
      <Action
        variant="secondary"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const result = await importCatalog();
            const imported = Array.isArray(result) ? result : result.items;
            await api.importCatalog(imported);
            await load();
            setMessage(
              `${imported.length} Discord items updated in the catalog.${!Array.isArray(result) && result.warning ? ` ${result.warning}` : ""}`,
            );
          })
        }
      >
        Refresh Discord Shop catalog
      </Action>
    )
  );
}
export function LegacyModeration({
  controller,
  context,
}: {
  controller: EditorController;
  context: EditorProps;
}) {
  const {
    state,
    setMessage,
    busy,
    items,
    motion,
    reviewId,
    setReviewId,
    review,
    setReview,
    reviewUrls,
    setReviewUrls,
    alive,
    run,
  } = controller;
  const { api } = context;
  if (!state) return null;
  return (
    state.canModerate && (
      <section>
        <h3>Moderator preview</h3>
        <p>Use the revision ID from the bot message to review animations and sound.</p>
        <Field id="ps-review-id" label="Submitted revision ID">
          <input id="ps-review-id" value={reviewId} onChange={(event) => setReviewId(event.target.value)} />
        </Field>
        <Action
          variant="secondary"
          disabled={!/^[0-9a-f-]{36}$/i.test(reviewId)}
          busy={busy}
          onClick={() =>
            void run(async () => {
              const value = await api.review(reviewId);
              const urls = await Promise.all(
                value.assets.map(async (asset) => [
                  asset.id,
                  await api.privateMedia(!motion && asset.previewUrl ? asset.previewUrl : asset.url),
                ]),
              );
              if (!alive.current) return;
              setReview(value);
              setReviewUrls(Object.fromEntries(urls));
              setMessage("Submitted revision preview loaded. Use the bot to approve or reject it.");
            })
          }
        >
          Open revision
        </Action>
        {review && (
          <div className="ps-review-preview">
            <p>
              {review.revision.userId} · {statusNames[review.revision.status]}
            </p>
            <ProfilePreview
              config={review.revision.config}
              urls={reviewUrls}
              items={items}
              account={{ name: review.revision.userId }}
              reduced={!motion}
            />
            {review.revision.config.audio && reviewUrls[review.revision.config.audio] && (
              <audio
                controls
                aria-label="Submitted profile sound"
                src={reviewUrls[review.revision.config.audio]}
                preload="metadata"
              />
            )}
          </div>
        )}
      </section>
    )
  );
}
export function LegacyAdmin({ controller, context }: { controller: EditorController; context: EditorProps }) {
  const {
    state,
    config,
    version,
    dirty,
    setMessage,
    busy,
    testId,
    setTestId,
    confirmation,
    setConfirmation,
    run,
    save,
    submit,
    pending,
  } = controller;
  const { api, diagnostics, onTestProfile, onClearCache } = context;
  if (!state) return null;
  return (
    state.isOwner && (
      <section className="ps-admin">
        <h3>Admin testing</h3>
        <p>Direct publishing changes your own profile and is recorded in the audit log.</p>
        <div className="ps-actions">
          {onClearCache && (
            <Action
              variant="secondary"
              onClick={() => {
                onClearCache();
                setMessage("Profile and artwork caches cleared.");
              }}
            >
              Clear cache
            </Action>
          )}
          <Action
            disabled={!!pending}
            busy={busy}
            onClick={() =>
              void run(async () => {
                const currentVersion = dirty ? await save() : version;
                setConfirmation(await api.beginPublishConfirmation(currentVersion));
                setMessage(
                  "Run the confirmation command with the bot, then publish this draft within five minutes.",
                );
              })
            }
          >
            Prepare test publication
          </Action>
        </div>
        {confirmation && (
          <div className="ps-field">
            <Field
              id="ps-publish-code"
              label="Confirm once with the bot"
              help="This code is tied to your account and saved draft. Editing the draft invalidates it."
            >
              <input
                id="ps-publish-code"
                readOnly
                value={`/profile confirm code:${confirmation.code}`}
                onFocus={(event) => event.target.select()}
              />
            </Field>
            <Action busy={busy} onClick={() => void run(() => submit(true))}>
              Publish confirmed draft
            </Action>
          </div>
        )}
        {onTestProfile && (
          <>
            <Field
              id="ps-test-id"
              label="Discord user ID for local testing"
              help="Changes appear only on this client. Nothing is published for another user."
            >
              <input
                id="ps-test-id"
                value={testId}
                inputMode="numeric"
                onChange={(e) => setTestId(e.target.value)}
              />
            </Field>
            <div className="ps-actions">
              <Action
                variant="secondary"
                disabled={!/^\d{17,20}$/.test(testId)}
                onClick={() =>
                  void run(async () => {
                    await onTestProfile(testId, config);
                    setMessage("Local test profile enabled. Other clients cannot see it.");
                  })
                }
              >
                Apply local test
              </Action>
              <Action
                variant="secondary"
                onClick={() =>
                  void run(async () => {
                    await onTestProfile(null, config);
                    setMessage("Local test cleared.");
                  })
                }
              >
                Clear local test
              </Action>
            </div>
          </>
        )}
        {diagnostics && (
          <details>
            <summary>Diagnostics</summary>
            <pre>{diagnostics()}</pre>
          </details>
        )}
      </section>
    )
  );
}
export function LegacyPreview({
  controller,
  context,
}: {
  controller: EditorController;
  context: EditorProps;
}) {
  const { config, album, items, urls, full, setFull, motion, setMotion } = controller;
  const { account } = context;

  return (
    <PinnedPreview>
      <div className="ps-preview-toolbar">
        <h3>Live preview</h3>
        <label>
          <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />
          Full profile
        </label>
        <label>
          <input type="checkbox" checked={motion} onChange={(e) => setMotion(e.target.checked)} />
          Animation
        </label>
      </div>
      <PreviewFrame>
        <ProfilePreview
          config={config}
          urls={urls}
          items={items}
          account={account}
          reduced={!motion}
          full={full}
          albumUrl={album.url}
        />
      </PreviewFrame>
      {config.audio && urls[config.audio] && (
        <div className="ps-audio-preview">
          <label htmlFor="ps-audio-preview">Preview profile sound</label>
          <audio id="ps-audio-preview" src={urls[config.audio]} controls preload="metadata" />
        </div>
      )}
      <p className="ps-help">This is your local draft. Others see your latest approved profile.</p>
    </PinnedPreview>
  );
}
