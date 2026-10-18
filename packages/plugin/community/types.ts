import type { StudioClient } from "../client.js";
import { type ProfileConfig, type EditorState, type CatalogItem } from "../model.js";
import type { WorkspaceState, Preset, PersonalLibrary } from "../studio-model.js";

export type CommunityProps = {
  tab: string;
  api: StudioClient;
  workspace: WorkspaceState;
  state: EditorState;
  config: ProfileConfig;
  preset: Preset;
  items: CatalogItem[];
  account: { id: string; name: string; avatar?: string };
  urls: Record<string, string>;
  reduced: boolean;
  onRun: (task: () => Promise<void>) => Promise<void>;
  onMessage: (message: string) => void;
  onRefresh: () => Promise<void>;
  onLibrary: (doc: PersonalLibrary) => Promise<void>;
  onSelectPreset: (id: string) => Promise<void>;
  onConfirm: (value: { title: string; detail: string; action: string; run: () => void }) => void;
  artworkLoader?: (url: string) => Promise<string>;
  onSaveCurrent?: () => Promise<number>;
  activitySuggestions?: { applicationId: string; name: string }[];
};
