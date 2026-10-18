import { React } from "@webpack/common";
import { StudioAction } from "./studio-controls.js";

/** Shared initial, empty and retry state; existing data remains outside it on refresh. */
export function StudioState({
  title,
  children,
  error = false,
  retry,
  busy = false,
}: {
  title: string;
  children?: React.ReactNode;
  error?: boolean;
  retry?: () => void;
  busy?: boolean;
}) {
  return (
    <div className={`ps-state${error ? " ps-state-error" : ""}`} role={error ? "alert" : "status"}>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {retry && (
        <StudioAction variant="secondary" busy={busy} onClick={retry}>
          Try again
        </StudioAction>
      )}
    </div>
  );
}
