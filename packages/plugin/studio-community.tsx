import { React } from "@webpack/common";
import type { CommunityProps as Props } from "./community/types.js";
import { LibraryPanel } from "./community/library-panel.js";
import { SharingPanel } from "./community/sharing-panel.js";
import { AutomationPanel } from "./community/automation-panel.js";
import { ReviewPanel } from "./community/review-panel.js";
import { AdminPanel } from "./community/admin-panel.js";
export function StudioCommunity(props: Props) {
  return props.tab === "library" ? (
    <LibraryPanel {...props} />
  ) : props.tab === "sharing" ? (
    <SharingPanel {...props} />
  ) : props.tab === "automation" ? (
    <AutomationPanel {...props} />
  ) : props.tab === "review" && (props.state.canModerate || props.state.isOwner) ? (
    <ReviewPanel {...props} />
  ) : props.tab === "admin" && props.state.isOwner ? (
    <AdminPanel {...props} />
  ) : null;
}
export { StudioDialog } from "./studio-dialogs.js";
