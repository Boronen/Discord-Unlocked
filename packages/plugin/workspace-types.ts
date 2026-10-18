import type { StudioClient } from "./client.js";
import { type ProfileConfig, type EditorState, type CatalogItem } from "./model.js";
import { type DraftStorage } from "./draft-history.js";
import type { GifExporter } from "./gif-recording.js";
import type { LiveMusic } from "./music-surface.js";

export type WorkspaceProps = {
  api: StudioClient;
  account: import("./model.js").ProfileAccount & { id: string };
  state: EditorState;
  items: CatalogItem[];
  reduced: boolean;
  activityCover?: string;
  liveMusic?: LiveMusic;
  artworkLoader?: (url: string) => Promise<string>;
  draftStorage?: DraftStorage;
  onExportCard?: (svg: string, width: number, height: number) => Promise<boolean>;
  gifExporter?: GifExporter;
  onPublished?: () => void;
  onReload: () => Promise<void>;
  onTestProfile?: (id: string | null, config: ProfileConfig) => void | Promise<void>;
  diagnostics?: () => string;
  onClearCache?: () => void;
  refreshShop?: () => Promise<string>;
};
