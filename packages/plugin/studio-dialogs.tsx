import { React } from "@webpack/common";
import { StudioAction as Action } from "./studio-controls.js";

export function StudioDialog({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current!.showModal();
    return () => {
      ref.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`ps-studio-dialog ${className}`}
      aria-label={title}
      onClose={onClose}
      onCancel={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") e.stopPropagation();
      }}
    >
      <header>
        <h3>{title}</h3>
        <Action variant="secondary" onClick={() => ref.current?.close()}>
          Close
        </Action>
      </header>
      <div className="ps-studio-dialog-body">{children}</div>
    </dialog>
  );
}
export function ConfirmAction({
  title,
  detail,
  action,
  onConfirm,
  onClose,
}: {
  title: string;
  detail: string;
  action: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current!.showModal();
    return () => {
      ref.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="ps-confirm"
      aria-label={title}
      onClose={onClose}
      onCancel={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") e.stopPropagation();
      }}
    >
      <h3>{title}</h3>
      <p>{detail}</p>
      <div className="ps-actions">
        <Action autoFocus variant="secondary" onClick={() => ref.current?.close()}>
          Cancel
        </Action>
        <Action
          onClick={() => {
            onConfirm();
            ref.current?.close();
          }}
        >
          {action}
        </Action>
      </div>
    </dialog>
  );
}
