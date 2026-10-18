import { React } from "@webpack/common";
import { StudioField as Field, StudioAction as Action, StudioChoice as Choice } from "./studio-controls.js";
import type { WorkspaceProps } from "./workspace-types.js";
import type { WorkspaceController } from "./useWorkspaceController.js";
export function WorkspaceSongs({
  controller,
  context,
}: {
  controller: WorkspaceController;
  context: WorkspaceProps;
}) {
  const { preset, config, tab, songInput, setSongInput, run, change } = controller;
  const { api } = context;
  if (!preset) return null;
  return (
    tab === "music" && (
      <section>
        <Field
          id="ps-music-priority"
          label="Music priority"
          help={
            api.musicPrioritySupported
              ? "Current Discord music replaces the favorite card and supplies the profile artwork, banner backing, effect-layer colors and avatar-decoration tint. Favorites return when playback stops. Save and submit this setting for approval."
              : "The server must be updated before current-music priority can be saved."
          }
        >
          <Choice
            id="ps-music-priority"
            value={config.musicPriority ? "activity" : "favorites"}
            disabled={!api.musicPrioritySupported}
            onChange={(value) => change({ ...config, musicPriority: value === "activity" })}
            options={[
              { value: "favorites", label: "Favorite songs" },
              { value: "activity", label: "Current Discord music first" },
            ]}
          />
        </Field>
        <h3>Favorite songs</h3>
        <p>Choose up to three songs. Playback opens only when a viewer chooses Play.</p>
        <Field id="ps-v2-song" label="Song link">
          <input
            id="ps-v2-song"
            type="url"
            value={songInput}
            placeholder="https://open.spotify.com/track/…"
            onChange={(e) => setSongInput(e.target.value)}
          />
        </Field>
        <Action
          disabled={!songInput || config.studio.songs.length >= 3}
          onClick={() =>
            void run(async () => {
              const song = await api.resolveSong(songInput);
              if (config.studio.songs.some((s) => s.url === song.url))
                throw new Error("This song is already in your favorites.");
              change((value) => ({
                ...value,
                studio: { ...value.studio, songs: [...value.studio.songs, song] },
              }));
              setSongInput("");
            })
          }
        >
          Add favorite song
        </Action>
        {config.studio.songs.map((song, i) => (
          <div className="ps-song-editor" key={song.url}>
            <Field id={`ps-song-title-${i}`} label={`Song ${i + 1} title`}>
              <input
                id={`ps-song-title-${i}`}
                maxLength={200}
                value={song.title}
                onChange={(e) =>
                  change(
                    (value) => ({
                      ...value,
                      studio: {
                        ...value.studio,
                        songs: value.studio.songs.map((s, index) =>
                          index === i ? { ...s, title: e.target.value } : s,
                        ),
                      },
                    }),
                    `song-title-${i}`,
                  )
                }
              />
            </Field>
            <Field id={`ps-song-artist-${i}`} label="Artist">
              <input
                id={`ps-song-artist-${i}`}
                maxLength={200}
                value={song.artist}
                onChange={(e) =>
                  change(
                    (value) => ({
                      ...value,
                      studio: {
                        ...value.studio,
                        songs: value.studio.songs.map((s, index) =>
                          index === i ? { ...s, artist: e.target.value } : s,
                        ),
                      },
                    }),
                    `song-artist-${i}`,
                  )
                }
              />
            </Field>
            <div className="ps-actions">
              <Action
                variant="secondary"
                disabled={!i}
                onClick={() =>
                  change((value) => {
                    const songs = [...value.studio.songs];
                    [songs[i - 1], songs[i]] = [songs[i]!, songs[i - 1]!];
                    return { ...value, studio: { ...value.studio, songs } };
                  })
                }
              >
                Move up
              </Action>
              <Action
                variant="secondary"
                onClick={() =>
                  change((value) => ({
                    ...value,
                    studio: {
                      ...value.studio,
                      songs: value.studio.songs.filter((_, index) => index !== i),
                    },
                  }))
                }
              >
                Remove song
              </Action>
            </div>
          </div>
        ))}
        <Field id="ps-v2-music-mode" label="Music color mode">
          <Choice
            id="ps-v2-music-mode"
            value={config.music.mode}
            onChange={(mode) =>
              change({ ...config, music: { ...config.music, mode: mode as "manual" | "artwork" } })
            }
            options={[
              { value: "artwork", label: "Automatic, from artwork" },
              { value: "manual", label: "Custom color" },
            ]}
          />
        </Field>
        <Field id="ps-v2-music-bg" label="Fallback background color">
          <input
            id="ps-v2-music-bg"
            type="color"
            value={config.music.background}
            onChange={(e) =>
              change({ ...config, music: { ...config.music, background: e.target.value } }, "music-color")
            }
          />
        </Field>
        <Field id="ps-v2-music-animation" label="Music card animation">
          <Choice
            id="ps-v2-music-animation"
            value={config.music.preset}
            onChange={(value) =>
              change({
                ...config,
                music: { ...config.music, preset: value as typeof config.music.preset },
              })
            }
            options={["none", "glow", "gradient", "particles"].map((v) => ({ value: v, label: v }))}
          />
        </Field>
      </section>
    )
  );
}
export function WorkspaceMusicStyle({
  controller,
  context,
}: {
  controller: WorkspaceController;
  context: WorkspaceProps;
}) {
  const { workspace, config, tab, urls, change } = controller;
  const { state } = context;
  if (!workspace) return null;
  return (
    tab === "music" && (
      <>
        <div className="ps-two-col">
          <Field id="ps-music-effect-color" label="Music effect color">
            <input
              id="ps-music-effect-color"
              type="color"
              value={config.music.color}
              onChange={(e) =>
                change({ ...config, music: { ...config.music, color: e.target.value } }, "music-tint")
              }
            />
          </Field>
          <Field id="ps-music-speed" label="Music effect speed">
            <input
              id="ps-music-speed"
              type="range"
              min=".25"
              max="3"
              step=".25"
              value={config.music.speed}
              onChange={(e) =>
                change(
                  { ...config, music: { ...config.music, speed: Number(e.target.value) } },
                  "music-speed",
                )
              }
            />
          </Field>
        </div>
        <Field id="ps-music-strength" label="Music effect strength">
          <input
            id="ps-music-strength"
            type="range"
            min="0"
            max="1"
            step=".05"
            value={config.music.intensity}
            onChange={(e) =>
              change(
                { ...config, music: { ...config.music, intensity: Number(e.target.value) } },
                "music-strength",
              )
            }
          />
        </Field>
        <Field
          id="ps-uploaded-audio"
          label="Optional profile sound"
          help="Used only when there are no favorite songs."
        >
          <Choice
            id="ps-uploaded-audio"
            value={config.audio ?? ""}
            onChange={(audio) => change({ ...config, audio: audio || null })}
            options={[
              { value: "", label: "No profile sound" },
              ...state.assets
                .filter((a) => a.slot === "audio" && a.status === "ready")
                .map((a) => ({
                  value: a.id,
                  label:
                    workspace.mediaMetadata[a.id]?.label ||
                    `Uploaded sound · ${new Date(a.createdAt).toLocaleDateString("en-US")}`,
                })),
            ]}
          />
        </Field>
        {config.audio && urls[config.audio] && <audio controls src={urls[config.audio]} preload="none" />}
      </>
    )
  );
}
