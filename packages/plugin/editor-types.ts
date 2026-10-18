import { type CatalogItem, type ProfileConfig } from "./model.js";
import type { StudioClient } from "./client.js";
import type { AnimationMode } from "./motion.js";
import type { CatalogRefreshResult } from "./catalog-refresh.js";
import type { DraftStorage } from "./draft-history.js";
import type { GifExporter } from "./gif-recording.js";
import type { LiveMusic } from "./music-surface.js";

export interface EditorProps {
  activityCover?: string;
  liveMusic?: LiveMusic;
  artworkLoader?: (url: string) => Promise<string>;
  api: StudioClient;
  account: import("./model.js").ProfileAccount & { id: string };
  onPublished?: () => void;
  importCatalog?: () => Promise<CatalogItem[] | CatalogRefreshResult>;
  diagnostics?: () => string;
  onTestProfile?: (id: string | null, config: ProfileConfig) => void | Promise<void>;
  onClearCache?: () => void;
  animationMode?: AnimationMode;
  onAnimationMode?: (mode: AnimationMode) => void;
  animationsStatic?: boolean;
  onExportData?: () => Promise<boolean>;
  draftStorage?: DraftStorage;
  onExportCard?: (svg: string, width: number, height: number) => Promise<boolean>;
  gifExporter?: GifExporter;
}
