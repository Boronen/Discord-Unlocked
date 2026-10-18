import { React } from "@webpack/common";
import type { StudioBadge } from "../studio-model.js";
import { StudioField as Field, StudioAction as Action, StudioChoice as Choice } from "../studio-controls.js";
import { Thumbnail } from "../CollectibleMedia.js";
import { artworkPalette } from "../palette.js";
import type { CommunityProps as Props } from "./types.js";

export function AdminPanel(props: Props) {
  const [badges, setBadges] = React.useState<StudioBadge[]>([]),
    [name, setName] = React.useState(""),
    [icon, setIcon] = React.useState("star"),
    [description, setDescription] = React.useState(""),
    [badge, setBadge] = React.useState(""),
    [user, setUser] = React.useState(""),
    [itemId, setItem] = React.useState(""),
    [query, setQuery] = React.useState(""),
    [tags, setTags] = React.useState(""),
    [moods, setMoods] = React.useState(""),
    [colors, setColors] = React.useState(""),
    [progress, setProgress] = React.useState("");
  const [analyzing, setAnalyzing] = React.useState(false);
  const canceled = React.useRef(false);
  React.useEffect(
    () => () => {
      canceled.current = true;
    },
    [],
  );
  React.useEffect(() => {
    void props.onRun(async () => {
      const result = await props.api.request<{ items: StudioBadge[] }>("/v2/admin/badges");
      setBadges(result.items);
      setBadge(result.items[0]?.id ?? "");
    });
  }, [props.api]);
  const item = props.items.find((i) => i.id === itemId);
  React.useEffect(() => {
    setTags(item?.metadata?.tags.join(", ") ?? "");
    setMoods(item?.metadata?.moods.join(", ") ?? "");
    setColors(item?.metadata?.colors.join(", ") ?? "");
  }, [itemId]);
  async function analyze() {
    if (!props.artworkLoader) throw new Error("Native artwork loading is unavailable.");
    canceled.current = false;
    const todo = props.items.filter((i) => !i.metadata?.colors.length);
    let done = 0;
    for (const entry of todo) {
      if (canceled.current) break;
      try {
        const data = await props.artworkLoader(entry.staticUrl),
          image = new Image();
        image.src = data;
        await image.decode();
        if (image.naturalWidth * image.naturalHeight > 16_000_000) continue;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 32;
        canvas.getContext("2d")!.drawImage(image, 0, 0, 32, 32);
        const palette = artworkPalette(canvas.getContext("2d")!.getImageData(0, 0, 32, 32).data);
        if (palette)
          await props.api.request(`/v2/admin/catalog/${entry.id}`, "PUT", {
            colors: [palette.accent],
            tags: entry.metadata?.tags ?? [],
            moods: entry.metadata?.moods ?? [],
          });
      } catch {
        /* Unsupported thumbnails remain unclassified. */
      }
      done++;
      setProgress(`${done}/${todo.length} thumbnails checked`);
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    await props.onRefresh();
  }
  return (
    <section>
      <h3>Studio badges</h3>
      <p className="ps-help">
        Community labels only. They do not represent Discord verification or grant permissions.
      </p>
      <Field id="ps-badge-name" label="Badge name">
        <input id="ps-badge-name" maxLength={32} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field id="ps-badge-icon" label="Built-in icon">
        <Choice
          id="ps-badge-icon"
          value={icon}
          onChange={setIcon}
          options={["star", "heart", "flask", "crown", "leaf", "fire"].map((v) => ({ value: v, label: v }))}
        />
      </Field>
      <Field id="ps-badge-description" label="Description">
        <input
          id="ps-badge-description"
          maxLength={140}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Action
        disabled={!name.trim()}
        onClick={() =>
          void props.onRun(async () => {
            const result = await props.api.request<{ id: string }>("/v2/admin/badges", "POST", {
              name: name.trim(),
              icon,
              description,
            });
            setBadges([...badges, { id: result.id, name, icon, description, enabled: true }]);
            setBadge(result.id);
            setName("");
          })
        }
      >
        Create badge
      </Action>
      <Field id="ps-assignment-badge" label="Badge">
        <Choice
          id="ps-assignment-badge"
          value={badge}
          onChange={setBadge}
          options={badges.map((b) => ({ value: b.id, label: b.name }))}
        />
      </Field>
      <Field id="ps-assignment-user" label="Community member Discord ID">
        <input
          id="ps-assignment-user"
          inputMode="numeric"
          maxLength={20}
          value={user}
          onChange={(e) => setUser(e.target.value.replace(/\D/g, ""))}
        />
      </Field>
      <div className="ps-actions">
        {[true, false].map((grant) => (
          <Action
            key={String(grant)}
            variant={grant ? "primary" : "secondary"}
            disabled={!badge || !/^\d{17,20}$/.test(user)}
            onClick={() =>
              void props.onRun(async () => {
                await props.api.request(`/v2/admin/badges/${badge}/assignment`, "POST", {
                  userId: user,
                  grant,
                });
                props.onMessage(grant ? "Studio badge awarded." : "Studio badge revoked.");
              })
            }
          >
            {grant ? "Award badge" : "Revoke badge"}
          </Action>
        ))}
      </div>
      <h3>Catalog labels</h3>
      <Field id="ps-admin-catalog-query" label="Find catalog item">
        <div className="ps-search">
          <input
            id="ps-admin-catalog-query"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Action variant="secondary" disabled={!query} onClick={() => setQuery("")}>
            Clear
          </Action>
        </div>
      </Field>
      <Field id="ps-admin-item" label="Catalog item">
        <Choice
          id="ps-admin-item"
          value={itemId}
          onChange={setItem}
          options={[
            { value: "", label: "Choose an item" },
            ...props.items
              .filter((i) => i.name.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 30)
              .map((i) => ({ value: i.id, label: i.name })),
          ]}
        />
      </Field>
      {item && (
        <>
          <Thumbnail url={item.staticUrl} />
          <Field id="ps-admin-tags" label="Theme tags (comma separated)">
            <input id="ps-admin-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
          <Field id="ps-admin-moods" label="Mood tags (comma separated)">
            <input id="ps-admin-moods" value={moods} onChange={(e) => setMoods(e.target.value)} />
          </Field>
          <Field id="ps-admin-colors" label="Dominant HEX colors (comma separated)">
            <input id="ps-admin-colors" value={colors} onChange={(e) => setColors(e.target.value)} />
          </Field>
          <Action
            onClick={() =>
              void props.onRun(async () => {
                const parts = (v: string) =>
                  v
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                await props.api.request(`/v2/admin/catalog/${itemId}`, "PUT", {
                  colors: parts(colors),
                  tags: parts(tags),
                  moods: parts(moods),
                });
                await props.onRefresh();
                props.onMessage("Catalog labels saved.");
              })
            }
          >
            Save catalog labels
          </Action>
        </>
      )}
      <Action
        disabled={!props.artworkLoader || analyzing}
        onClick={() => {
          setAnalyzing(true);
          void analyze()
            .catch(() => props.onMessage("Thumbnail analysis failed. Try again shortly."))
            .finally(() => setAnalyzing(false));
        }}
      >
        Analyze remaining thumbnail colors
      </Action>
      <Action
        variant="secondary"
        onClick={() => {
          canceled.current = true;
        }}
      >
        Stop thumbnail analysis
      </Action>
      {progress && <p role="status">{progress}</p>}
    </section>
  );
}
