import { StudioSearch, StudioTabs } from "./studio-controls.js";
import { usePrivateMedia } from "./usePrivateMedia.js";
import { React } from "@webpack/common";
import { assetIds } from "./model.js";
import { Button } from "@components/Button";
import type { CatalogItem, MediaAsset, MediaSlot, ProfileConfig } from "./model.js";
import type { StudioClient } from "./client.js";
import { ProfilePreview } from "./visuals.js";
import { PreviewFrame } from "./PreviewFrame.js";
import { pickerPageLayout } from "./picker-layout.js";
import { TintControls } from "./TintControls.js";
import type { TintStyle } from "./tint.js";
import { legacyConfig, type PersonalLibrary } from "./studio-model.js";

export type VisualSlot = Exclude<MediaSlot, "audio"> | "nameplate";
export const visualNames: Record<VisualSlot, string> = {
  avatar: "Avatar",
  decoration: "Avatar decoration",
  banner: "Banner",
  effect: "Profile effect",
  nameplate: "Nameplate",
};
export function visualValue(config: ProfileConfig, slot: VisualSlot): string {
  if (slot === "nameplate") return config.nameplate ? `discord:${config.nameplate}` : "";
  const value = config[slot];
  return !value ? "" : typeof value === "string" ? `media:${value}` : `${value.source}:${value.id}`;
}
export function visualPatch(slot: VisualSlot, value: string): Partial<ProfileConfig> {
  const [source, id] = value.split(":");
  if (slot === "nameplate") return { nameplate: id ?? null };
  if (slot === "effect" || slot === "decoration")
    return { [slot]: value ? { source, id } : null } as Partial<ProfileConfig>;
  return { [slot]: id ?? null };
}
import { Thumbnail, NameplatePreview } from "./CollectibleMedia.js";
export function MediaPicker({
  slot,
  config,
  assets,
  items,
  account,
  api,
  reduced,
  albumUrl,
  canUseCustomTint = false,
  onUse,
  onClose,
  library,
  onLibraryChange,
  previewConfig,
}: {
  slot: VisualSlot;
  config: ProfileConfig;
  assets: MediaAsset[];
  items: CatalogItem[];
  account: { name: string; avatar?: string };
  api: StudioClient;
  reduced: boolean;
  albumUrl?: string;
  canUseCustomTint?: boolean;
  onUse: (value: string, tint?: TintStyle | null) => void;
  onClose: () => void;
  library?: PersonalLibrary;
  onLibraryChange?: (value: PersonalLibrary) => void;
  previewConfig?: (value: string) => ProfileConfig;
}) {
  const dialog = React.useRef<HTMLDialogElement>(null);
  const tintKey = slot === "effect" ? "effectTint" : slot === "decoration" ? "decorationTint" : null;
  const [tint, setTint] = React.useState<TintStyle | null>(() =>
    tintKey ? (config[tintKey] ?? null) : null,
  );
  const [compareOriginal, setCompareOriginal] = React.useState(false);
  const [tab, setTab] = React.useState<"appearance" | "tint">("appearance");
  const tabId = React.useId();
  const [candidate, setCandidate] = React.useState(visualValue(config, slot));
  const [search, setSearch] = React.useState("");
  const [source, setSource] = React.useState("all");
  const [collection, setCollection] = React.useState("all"),
    [color, setColor] = React.useState(""),
    [theme, setTheme] = React.useState(""),
    [mood, setMood] = React.useState("");
  const [pageIndex, setPageIndex] = React.useState(0);
  const results = React.useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = React.useState(6);
  React.useLayoutEffect(() => {
    const measure = () => {
      if (!results.current) return;
      const { columns, capacity } = pickerPageLayout(
        results.current.clientWidth,
        results.current.clientHeight,
        slot === "nameplate",
      );
      results.current.style.setProperty("--ps-picker-columns", String(columns));
      setCapacity(capacity);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(results.current!);
    return () => observer.disconnect();
  }, [slot]);
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    element.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    return () => {
      element.close();
      previous?.focus();
    };
  }, []);
  const options = [
    ...assets
      .filter((asset) => asset.slot === slot && asset.status === "ready")
      .map((asset) => ({
        value: `media:${asset.id}`,
        name: `Uploaded ${visualNames[slot].toLowerCase()} · ${new Date(asset.createdAt).toLocaleDateString("en-US")}`,
        caption: asset.animated ? "Your upload · animated" : "Your upload",
        asset,
        item: undefined as CatalogItem | undefined,
      })),
    ...items
      .filter((item) => item.kind === slot)
      .map((item) => ({
        value: `discord:${item.id}`,
        name: item.name,
        caption: "Discord Shop",
        item,
        asset: undefined as MediaAsset | undefined,
      })),
  ];
  const matching = options.filter(
    (option) =>
      option.name.toLocaleLowerCase("en-US").includes(search.toLocaleLowerCase("en-US")) &&
      (source === "all" || option.value.startsWith(`${source}:`)) &&
      (collection === "all" ||
        (collection === "favorites"
          ? library?.favorites
          : collection === "recent"
            ? library?.recent
            : library?.collections.find((c) => c.id === collection)?.items
        )?.includes(option.item?.id ?? "")) &&
      (!color || option.item?.metadata?.colors.includes(color)) &&
      (!theme || option.item?.metadata?.tags.includes(theme)) &&
      (!mood || option.item?.metadata?.moods.includes(mood)),
  );
  const pageCount = Math.max(1, Math.ceil(matching.length / capacity));
  React.useEffect(() => {
    setPageIndex((index) => Math.min(index, pageCount - 1));
  }, [pageCount]);
  const page = matching.slice(pageIndex * capacity, (pageIndex + 1) * capacity);
  const candidateOption = options.find((option) => option.value === candidate);
  const needed = [
    ...new Set([
      ...page.flatMap((option) => (option.asset ? [option.asset.id] : [])),
      ...assets
        .filter(
          (asset) =>
            asset.status === "ready" && [...assetIds(config), candidateOption?.asset?.id].includes(asset.id),
        )
        .map((asset) => asset.id),
    ]),
  ].join(",");
  const neededIds = new Set(needed.split(","));
  const { urls, failed } = usePrivateMedia(
    api,
    assets
      .filter((a) => neededIds.has(a.id))
      .map((a) => [a.id, !reduced && a.id === candidateOption?.asset?.id ? a.url : (a.previewUrl ?? a.url)]),
    attempt,
  );
  const preview = previewConfig?.(candidate) ?? {
    ...legacyConfig(config),
    ...visualPatch(slot, candidate),
    ...(tintKey ? { [tintKey]: compareOriginal ? null : tint } : {}),
  };
  return (
    <dialog
      ref={dialog}
      className="ps-picker"
      aria-labelledby="ps-picker-title"
      aria-describedby="ps-picker-help"
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") event.stopPropagation();
      }}
      onCancel={(event) => event.stopPropagation()}
    >
      <header className="ps-picker-header">
        <div>
          <h2 id="ps-picker-title">Choose {visualNames[slot].toLowerCase()}</h2>
          <p id="ps-picker-help">
            Preview an item, then choose Use selection. Save and submit your draft when you are ready.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => dialog.current?.close()}
          aria-label="Close appearance picker"
        >
          Close
        </Button>
      </header>
      <div className="ps-picker-layout">
        <section className="ps-picker-browse" aria-label="Available appearances">
          <div className="ps-picker-filters">
            {tintKey && (
              <StudioTabs
                id={tabId}
                label="Appearance options"
                className="ps-picker-tabs"
                value={tab}
                onChange={(value) => setTab(value as "appearance" | "tint")}
                automatic
                options={[
                  { value: "appearance", label: "Appearances" },
                  { value: "tint", label: "Tint" },
                ]}
              />
            )}
            {tab === "appearance" && (
              <>
                <div className="ps-picker-search">
                  <label htmlFor="ps-picker-search">Search appearances</label>
                  <StudioSearch
                    id="ps-picker-search"
                    label="appearance search"
                    value={search}
                    onChange={(value) => {
                      setSearch(value);
                      setPageIndex(0);
                    }}
                  />
                  <label htmlFor="ps-picker-source">Source</label>
                  <select
                    id="ps-picker-source"
                    value={source}
                    onChange={(event) => {
                      setSource(event.target.value);
                      setPageIndex(0);
                    }}
                  >
                    <option value="all">All sources</option>
                    <option value="media">Your uploads</option>
                    <option value="discord">Discord Shop</option>
                  </select>
                  {library && (
                    <>
                      <label htmlFor="ps-picker-collection">Collection</label>
                      <select
                        id="ps-picker-collection"
                        value={collection}
                        onChange={(e) => {
                          setCollection(e.target.value);
                          setPageIndex(0);
                        }}
                      >
                        <option value="all">All collections</option>
                        <option value="favorites">Favorites</option>
                        <option value="recent">Recently applied</option>
                        {library.collections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  <details>
                    <summary>Color, theme and mood</summary>
                    {[
                      {
                        id: "color",
                        label: "Dominant color",
                        value: color,
                        set: setColor,
                        values: items.flatMap((i) => i.metadata?.colors ?? []),
                      },
                      {
                        id: "theme",
                        label: "Theme",
                        value: theme,
                        set: setTheme,
                        values: items.flatMap((i) => i.metadata?.tags ?? []),
                      },
                      {
                        id: "mood",
                        label: "Mood",
                        value: mood,
                        set: setMood,
                        values: items.flatMap((i) => i.metadata?.moods ?? []),
                      },
                    ].map((f) => (
                      <label key={f.id}>
                        {f.label}
                        <select
                          value={f.value}
                          onChange={(e) => {
                            f.set(e.target.value);
                            setPageIndex(0);
                          }}
                        >
                          <option value="">All · including untagged</option>
                          {[...new Set(f.values)].sort().map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </details>
                </div>
                {failed && (
                  <div role="alert" className="ps-notice ps-error">
                    Some uploaded previews could not load. Your draft is unchanged.{" "}
                    <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
                      Retry previews
                    </Button>
                  </div>
                )}
                <p role="status">
                  {matching.length} {matching.length === 1 ? "item" : "items"}
                </p>
                <Button variant="secondary" aria-pressed={!candidate} onClick={() => setCandidate("")}>
                  Original Discord appearance
                </Button>
                {candidate.startsWith("discord:") && library && onLibraryChange && (
                  <Button
                    variant="secondary"
                    aria-pressed={library.favorites.includes(candidate.slice(8))}
                    onClick={() => {
                      const id = candidate.slice(8);
                      onLibraryChange({
                        ...library,
                        favorites: library.favorites.includes(id)
                          ? library.favorites.filter((v) => v !== id)
                          : [...library.favorites, id],
                      });
                    }}
                  >
                    Favorite selection
                  </Button>
                )}
              </>
            )}
          </div>
          <div
            ref={results}
            className="ps-picker-results"
            id={`${tabId}-panel`}
            role={tintKey ? "tabpanel" : undefined}
            aria-labelledby={tintKey ? `${tabId}-${tab}-tab` : undefined}
            tabIndex={0}
          >
            {tab === "tint" && tintKey ? (
              <>
                <label className="ps-checkbox ps-picker-compare">
                  <input
                    type="checkbox"
                    checked={compareOriginal}
                    onChange={(event) => setCompareOriginal(event.target.checked)}
                  />
                  Show original colors
                </label>
                <TintControls
                  id={`${tabId}-tint`}
                  label={slot === "effect" ? "Profile effect tint" : "Avatar decoration tint"}
                  value={tint}
                  custom={canUseCustomTint}
                  onChange={(value) => {
                    setTint(value);
                    setCompareOriginal(false);
                  }}
                />
              </>
            ) : (
              <>
                <div className="ps-picker-grid">
                  {page.map((option) => (
                    <button
                      key={option.value}
                      aria-label={`${option.name} · ${option.caption}`}
                      type="button"
                      className="ps-picker-tile"
                      aria-pressed={candidate === option.value}
                      onClick={() => setCandidate(option.value)}
                    >
                      <span className={`ps-picker-art ps-picker-art-${slot}`}>
                        <Thumbnail
                          key={option.asset ? urls[option.asset.id] : option.item?.staticUrl}
                          url={option.item?.staticUrl ?? (option.asset ? urls[option.asset.id] : undefined)}
                        />
                      </span>
                      <strong>{option.name}</strong>
                      <small>{option.caption}</small>
                    </button>
                  ))}
                </div>
                {!matching.length && (
                  <p className="ps-help">
                    {options.length
                      ? "No matching appearances. Clear your search or change the source."
                      : "No appearances available yet. Upload a file with the bot, or ask the operator to refresh the Discord Shop catalog."}
                  </p>
                )}
              </>
            )}
          </div>
          {tab === "appearance" ? (
            <div className="ps-actions ps-picker-pages" aria-label="Appearance pages">
              <Button
                variant="secondary"
                disabled={pageIndex === 0}
                onClick={() => setPageIndex((value) => Math.max(0, value - 1))}
              >
                Previous
              </Button>
              <span className="ps-help">
                Page {pageIndex + 1} of {pageCount}
              </span>
              <Button
                variant="secondary"
                disabled={pageIndex >= pageCount - 1}
                onClick={() => setPageIndex((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          ) : (
            <p className="ps-help">
              Use selection applies the appearance and tint together. Cancel discards both.
            </p>
          )}
        </section>
        <aside className="ps-picker-preview" aria-label="Selection preview">
          <h3>
            {candidateOption?.name ??
              (candidate ? "Previously selected item" : "Original Discord appearance")}
          </h3>
          <PreviewFrame>
            {slot === "nameplate" ? (
              <NameplatePreview item={candidateOption?.item} reduced={reduced} name={account.name} />
            ) : (
              <ProfilePreview
                config={preview}
                urls={urls}
                items={items}
                account={account}
                reduced={reduced}
                albumUrl={albumUrl}
              />
            )}
          </PreviewFrame>
          <p className="ps-help">
            {reduced
              ? "Static previews follow your animation preference."
              : "Animations play in this preview. Sound is off."}
          </p>
        </aside>
      </div>
      <footer className="ps-picker-footer">
        <Button variant="secondary" onClick={() => dialog.current?.close()}>
          Cancel
        </Button>
        <Button
          disabled={!!candidate && !candidateOption}
          onClick={() => {
            if (tintKey) onUse(candidate, tint);
            else onUse(candidate);
            dialog.current?.close();
          }}
        >
          Use selection
        </Button>
      </footer>
    </dialog>
  );
}
