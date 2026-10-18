import { React } from "@webpack/common";

export function Notice({
  children,
  error = false,
  focus = false,
}: {
  children: React.ReactNode;
  error?: boolean;
  focus?: boolean;
}) {
  const ref = React.useRef<HTMLParagraphElement>(null);
  React.useEffect(() => {
    if (focus && error) ref.current?.focus();
  }, [focus, error, children]);
  return (
    <p
      ref={ref}
      tabIndex={error ? -1 : undefined}
      className={`ps-notice${error ? " ps-error" : ""}`}
      role={error ? "alert" : "status"}
      aria-live={error ? "assertive" : "polite"}
    >
      {children}
    </p>
  );
}
