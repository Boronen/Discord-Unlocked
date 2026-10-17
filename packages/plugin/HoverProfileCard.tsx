import { React } from "@webpack/common";
import { hoverProfileTarget } from "./hover-profiles.js";

export interface NativeHoverCardProps {
  userId: string;
  guildId?: string;
  channelId?: string;
  targetElementRef: { current: Element };
  shouldShow: boolean;
  fixed: boolean;
  position: "right";
  align: "top";
  clickTrap: boolean;
  scrollBehavior: "close";
  onRequestClose: () => void;
  onClosePopout: () => void;
  children: () => null;
}
/** Discord owns placement, profile data, loading, native actions and the popout surface. */
export function HoverProfileCard({
  id,
  anchor,
  guildId,
  channelId,
  component: NativeCard,
  onClose,
}: {
  id: string;
  anchor: Element;
  guildId?: string;
  channelId?: string;
  component: React.ComponentType<NativeHoverCardProps>;
  onClose: () => void;
}) {
  const target = React.useRef(anchor);
  React.useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const observer = new MutationObserver(() => {
      if (!anchor.isConnected || hoverProfileTarget(anchor)?.id !== id) onClose();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src"],
    });
    document.addEventListener("keydown", key, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", key, true);
    };
  }, [id, anchor, onClose]);
  return (
    <NativeCard
      userId={id}
      guildId={guildId}
      channelId={channelId}
      targetElementRef={target}
      shouldShow
      fixed
      position="right"
      align="top"
      clickTrap={false}
      scrollBehavior="close"
      onRequestClose={onClose}
      onClosePopout={onClose}
    >
      {() => null}
    </NativeCard>
  );
}
