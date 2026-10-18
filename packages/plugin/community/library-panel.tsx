import { StudioState } from "../studio-state.js";
import { StudioSearch } from "../studio-controls.js";
import { React } from "@webpack/common";
import { DEFAULT_CONFIG } from "../model.js";
import { StudioField as Field, StudioAction as Action, StudioChoice as Choice } from "../studio-controls.js";
import { MediaPicker, type VisualSlot } from "../MediaPicker.js";
import { Thumbnail } from "../CollectibleMedia.js";
import type { CommunityProps as Props } from "./types.js";
import { MediaRow } from "./media-row.js";

export function LibraryPanel(props: Props) {
  const [mediaPage, setMediaPage] = React.useState(0);
  const [name, setName] = React.useState(""),
    [selected, setSelected] = React.useState("favorites"),
    [query, setQuery] = React.useState(""),
    [folder, setFolder] = React.useState("all"),
    [picker, setPicker] = React.useState<VisualSlot | null>(null),
    [kind, setKind] = React.useState<VisualSlot>("effect");
  const library = props.workspace.library;
  const collection = library.collections.find((c) => c.id === selected);
  const ids =
    selected === "favorites"
      ? library.favorites
      : selected === "recent"
        ? library.recent
        : (collection?.items ?? []);
  const folders = [
    ...new Set(
      Object.values(props.workspace.mediaMetadata)
        .map((v) => v.folder)
        .filter(Boolean),
    ),
  ];
  const matchingAssets = props.state.assets.filter((asset) => {
    const meta = props.workspace.mediaMetadata[asset.id];
    return (
      (folder === "all" || meta?.folder === folder) &&
      `${meta?.label ?? ""} ${meta?.tags.join(" ") ?? ""} ${asset.slot}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  });
  const pageCount = Math.max(1, Math.ceil(matchingAssets.length / 8));
  const currentPage = Math.min(mediaPage, pageCount - 1);
  React.useEffect(() => setMediaPage((page) => Math.min(page, pageCount - 1)), [pageCount]);
  return (
    <section>
      <h3>Personal collections</h3>
      <Field id="ps-library-list" label="Collection">
        <Choice
          id="ps-library-list"
          value={selected}
          onChange={setSelected}
          options={[
            { value: "favorites", label: "Favorites" },
            { value: "recent", label: "Recently applied" },
            ...library.collections.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </Field>
      <div className="ps-inline">
        <Field id="ps-collection-name" label="New collection name">
          <input
            id="ps-collection-name"
            maxLength={64}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Action
          disabled={!name.trim() || library.collections.length >= props.workspace.capacity}
          onClick={() =>
            void props.onRun(async () => {
              const id = crypto.randomUUID();
              await props.onLibrary({
                ...library,
                collections: [...library.collections, { id, name: name.trim(), items: [] }],
              });
              setSelected(id);
              setName("");
            })
          }
        >
          Create collection
        </Action>
      </div>
      <p className="ps-help">
        {library.collections.length}/{props.workspace.capacity} collections · private to your account
      </p>
      {collection && (
        <div className="ps-actions">
          <Action
            variant="secondary"
            disabled={!name.trim()}
            onClick={() =>
              void props.onRun(() =>
                props.onLibrary({
                  ...library,
                  collections: library.collections.map((c) =>
                    c.id === selected ? { ...c, name: name.trim() } : c,
                  ),
                }),
              )
            }
          >
            Rename to entered name
          </Action>
          <Action
            variant="secondary"
            onClick={() =>
              props.onConfirm({
                title: "Delete collection?",
                detail: `Delete “${collection.name}”? Catalog items and uploaded media are kept.`,
                action: "Delete collection",
                run: () =>
                  void props.onRun(async () => {
                    await props.onLibrary({
                      ...library,
                      collections: library.collections.filter((c) => c.id !== selected),
                    });
                    setSelected("favorites");
                  }),
              })
            }
          >
            Delete collection
          </Action>
        </div>
      )}
      <div className="ps-inline">
        <Field id="ps-collection-kind" label="Appearance type">
          <Choice
            id="ps-collection-kind"
            value={kind}
            onChange={(v) => setKind(v as VisualSlot)}
            options={["effect", "decoration", "nameplate"].map((v) => ({ value: v, label: v }))}
          />
        </Field>
        <Action disabled={selected === "recent"} onClick={() => setPicker(kind)}>
          Add catalog item
        </Action>
      </div>
      {!ids.length && (
        <StudioState title="No appearances in this collection">
          Add a catalog item to keep it here for next time.
        </StudioState>
      )}
      <div className="ps-library-items">
        {ids.map((id) => {
          const item = props.items.find((v) => v.id === id);
          return (
            <div key={id}>
              <Thumbnail url={item?.staticUrl} />
              <strong>{item?.name ?? `Unavailable item · ${id.slice(0, 12)}`}</strong>
              <Action
                variant="secondary"
                onClick={() =>
                  void props.onRun(() =>
                    props.onLibrary({
                      ...library,
                      favorites:
                        selected === "favorites"
                          ? library.favorites.filter((v) => v !== id)
                          : library.favorites,
                      recent: selected === "recent" ? library.recent.filter((v) => v !== id) : library.recent,
                      collections: library.collections.map((c) =>
                        c.id === selected ? { ...c, items: c.items.filter((v) => v !== id) } : c,
                      ),
                    }),
                  )
                }
              >
                Remove from collection
              </Action>
            </div>
          );
        })}
      </div>
      <h3>Uploaded media</h3>
      <Field id="ps-media-query" label="Search media labels and tags">
        <StudioSearch
          id="ps-media-query"
          label="media search"
          value={query}
          onChange={(value) => {
            setQuery(value);
            setMediaPage(0);
          }}
        />
      </Field>
      <Field id="ps-media-folder" label="Folder">
        <Choice
          id="ps-media-folder"
          value={folder}
          onChange={(value) => {
            setFolder(value);
            setMediaPage(0);
          }}
          options={[{ value: "all", label: "All folders" }, ...folders.map((v) => ({ value: v, label: v }))]}
        />
      </Field>
      <p className="ps-help" role="status">
        {matchingAssets.length} {matchingAssets.length === 1 ? "file" : "files"}
      </p>
      {!matchingAssets.length && (
        <StudioState title={props.state.assets.length ? "No matching media" : "No uploads yet"}>
          {props.state.assets.length
            ? "Try another search or folder, or clear the search."
            : "Use /profile upload in your community server, then refresh uploads and status."}
        </StudioState>
      )}
      {matchingAssets.slice(currentPage * 8, currentPage * 8 + 8).map((asset) => (
        <MediaRow
          key={asset.id}
          asset={asset}
          metadata={props.workspace.mediaMetadata[asset.id]}
          usage={props.workspace.usage[asset.id] ?? []}
          props={props}
        />
      ))}
      <div className="ps-actions">
        <Action variant="secondary" disabled={!currentPage} onClick={() => setMediaPage(currentPage - 1)}>
          Previous media
        </Action>
        <span>
          Media page {currentPage + 1} of {pageCount}
        </span>
        <Action
          variant="secondary"
          disabled={currentPage + 1 >= pageCount}
          onClick={() => setMediaPage(currentPage + 1)}
        >
          Next media
        </Action>
      </div>
      {picker && (
        <MediaPicker
          slot={picker}
          config={DEFAULT_CONFIG}
          assets={[]}
          items={props.items}
          account={props.account}
          api={props.api}
          reduced={props.reduced}
          library={library}
          onUse={(value) => {
            const id = value.split(":")[1];
            if (!id) return;
            void props.onRun(() =>
              props.onLibrary({
                ...library,
                favorites:
                  selected === "favorites" ? [...new Set([...library.favorites, id])] : library.favorites,
                collections: library.collections.map((c) =>
                  c.id === selected ? { ...c, items: [...new Set([...c.items, id])] } : c,
                ),
              }),
            );
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </section>
  );
}
