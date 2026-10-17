import { React } from "@webpack/common";
import type { CatalogItem } from "./model.js";
export function Thumbnail({ url }: { url?: string }) {
  const [failed, setFailed] = React.useState(false);
  return url && !failed ? (
    <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
  ) : (
    <span className="ps-thumbnail-fallback">{failed ? "Preview unavailable" : "Loading preview…"}</span>
  );
}
export function CollectibleMedia({ item, reduced = false }: { item: CatalogItem; reduced?: boolean }) {
  const [failed, setFailed] = React.useState(false);
  if (item.kind === "nameplate" && !reduced && !failed)
    return (
      <video
        src={item.imageUrl}
        poster={item.staticUrl}
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
        onError={() => setFailed(true)}
      />
    );
  return <Thumbnail url={item.staticUrl} />;
}
export function NameplatePreview({
  item,
  reduced = false,
  name = "Your name",
}: {
  item?: CatalogItem;
  reduced?: boolean;
  name?: string;
}) {
  return (
    <div className="ps-nameplate-preview">
      {item && <CollectibleMedia key={`${item.id}:${reduced}`} item={item} reduced={reduced} />}
      <span className="ps-nameplate-avatar" aria-hidden="true">
        ●
      </span>
      <strong>{name}</strong>
    </div>
  );
}
