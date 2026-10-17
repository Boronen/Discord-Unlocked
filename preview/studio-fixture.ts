import {
  normalizeStudio,
  EMPTY_LIBRARY,
  FEATURE_GROUPS,
  type WorkspaceState,
  type Preset,
} from "../packages/plugin/studio-model.js";
import { DEFAULT_CONFIG, type EditorState, type CatalogItem } from "../packages/plugin/model.js";
import type { WireResponse } from "../packages/plugin/client.js";
export function studioFixture(state: EditorState, catalog: CatalogItem[]) {
  const initial: Preset = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "My profile",
    version: 0,
    draft: normalizeStudio(DEFAULT_CONFIG),
    approvedRevisionId: null,
    approved: null,
    updatedAt: new Date().toISOString(),
  };
  const workspace: WorkspaceState = {
    presets: [initial],
    library: structuredClone(EMPTY_LIBRARY),
    libraryVersion: 0,
    automation: { enabled: false, rules: [], version: 0 },
    manualRevisionId: null,
    activeRevisionId: null,
    capacity: 20,
    canUseCustomTint: true,
    shares: [],
    badges: [],
    mediaMetadata: {},
    usage: {},
  };
  return (path: string, method: string, body?: string): WireResponse | null => {
    const response = (data: unknown, status = 200) => ({ status, body: JSON.stringify(data) }),
      input = body ? JSON.parse(body) : {};
    if (path === "/v2/capabilities")
      return response({
        version: 2,
        enabled: true,
        features: { ...Object.fromEntries(FEATURE_GROUPS.map((k) => [k, true])), musicPriority: true },
      });
    if (path === "/v2/me") return response(state);
    if (path.startsWith("/v2/catalog")) return response({ items: catalog, nextCursor: null });
    if (path === "/v2/me/workspace") return response(workspace);
    if (path === "/v2/me/presets" && method === "POST") {
      const source = workspace.presets.find((p) => p.id === input.sourceId);
      const p = {
        ...initial,
        id: crypto.randomUUID(),
        name: input.name,
        draft: structuredClone(source?.draft ?? normalizeStudio(DEFAULT_CONFIG)),
      };
      workspace.presets.push(p);
      return response(p);
    }
    const match = path.match(/^\/v2\/me\/presets\/([^/]+)(?:\/(submit|activate))?$/);
    if (match) {
      const p = workspace.presets.find((p) => p.id === match[1]);
      if (!p) return response({ message: "Preset not found." }, 404);
      if (method === "GET") return response(p);
      if (method === "DELETE") {
        workspace.presets = workspace.presets.filter((v) => v.id !== p.id);
        return response({ ok: true });
      }
      if (method === "PUT") {
        if (p.version !== input.version)
          return response({ message: "This preset changed on another device." }, 409);
        p.version++;
        p.draft = input.config;
        p.name = input.name ?? p.name;
        return response({ version: p.version });
      }
      if (match[2] === "submit") {
        const r = {
          id: crypto.randomUUID(),
          userId: state.userId,
          config: structuredClone(p.draft),
          status: "pending" as const,
          createdAt: new Date().toISOString(),
          decidedAt: null,
          reason: null,
          presetId: p.id,
          baselineRevisionId: state.published?.revisionId,
          activateOnApproval: input.activate,
        };
        state.revisions.unshift(r);
        return response(r);
      }
      if (match[2] === "activate" && p.approved) {
        workspace.manualRevisionId = workspace.activeRevisionId = p.approved.id;
        state.published = {
          userId: state.userId,
          revisionId: p.approved.id,
          config: p.approved.config,
          media: {},
          updatedAt: new Date().toISOString(),
        };
        return response({ ok: true });
      }
    }
    if (path === "/v2/me/library") {
      if (workspace.libraryVersion !== input.version)
        return response({ message: "Your library changed." }, 409);
      workspace.library = input.document;
      return response({ version: ++workspace.libraryVersion });
    }
    if (path === "/v2/me/automation") {
      workspace.automation = {
        enabled: input.enabled,
        rules: input.rules,
        version: workspace.automation.version + 1,
      };
      return response({ version: workspace.automation.version });
    }
    if (path === "/v2/styles") return response({ items: [] });
    if (path === "/v2/moderation/queue")
      return response({ profiles: state.revisions.filter((r) => r.status === "pending"), shares: [] });
    const review = path.match(/^\/v2\/moderation\/([^/]+)(?:\/decision)?$/);
    if (review) {
      const r = state.revisions.find((r) => r.id === review[1]);
      if (!r) return response({ message: "Submission not found." }, 404);
      if (method === "GET") return response({ revision: r, baseline: null, assets: [], changes: ["studio"] });
      r.status = input.action === "approve" ? "approved" : "rejected";
      r.decidedAt = new Date().toISOString();
      r.reason = input.reason ?? null;
      const p = workspace.presets.find((p) => p.id === r.presetId)!;
      if (r.status === "approved") {
        p.approved = r;
        p.approvedRevisionId = r.id;
        if (r.activateOnApproval) {
          workspace.manualRevisionId = workspace.activeRevisionId = r.id;
          state.published = {
            userId: state.userId,
            revisionId: r.id,
            config: r.config,
            media: {},
            updatedAt: new Date().toISOString(),
          };
        }
      }
      return response({ ok: true });
    }
    if (path === "/v2/admin/badges")
      return method === "GET" ? response({ items: workspace.badges }) : response({ id: crypto.randomUUID() });
    return null;
  };
}
