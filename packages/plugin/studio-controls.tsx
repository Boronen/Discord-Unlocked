import { React } from "@webpack/common";
import { Button } from "@components/Button";
export function StudioField({
  id,
  label,
  children,
  help,
  error,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  help?: string;
  error?: string;
}) {
  const describedBy = [help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  const controls = React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;
    if (
      child.type !== StudioChoice &&
      child.type !== StudioSearch &&
      !(typeof child.type === "string" && ["input", "select", "textarea"].includes(child.type))
    )
      return child;
    const control = child as React.ReactElement<React.AriaAttributes & { id?: string }>;
    return React.cloneElement(control, {
      id: control.props.id ?? id,
      "aria-describedby":
        [control.props["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined,
      "aria-invalid": error ? true : control.props["aria-invalid"],
    });
  });
  return (
    <div className="ps-field">
      <label htmlFor={id}>{label}</label>
      {controls}
      {help && <small id={`${id}-help`}>{help}</small>}
      {error && (
        <small id={`${id}-error`} className="ps-error">
          {error}
        </small>
      )}
    </div>
  );
}
export function StudioAction({
  children,
  busy = false,
  ...props
}: React.ComponentProps<typeof Button> & { busy?: boolean }) {
  return (
    <Button
      {...props}
      onClick={props.onClick}
      type={props.type ?? "button"}
      disabled={props.disabled || busy}
      aria-busy={busy}
      className={`ps-action ${props.className ?? ""}`}
    >
      {children}
    </Button>
  );
}
export function StudioChoice({
  id,
  value,
  onChange,
  options,
  disabled = false,
  ...aria
}: React.AriaAttributes & {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select {...aria} id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function StudioSearch({
  id,
  value,
  onChange,
  label,
  ...aria
}: React.AriaAttributes & {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  return (
    <div className="ps-search">
      <input
        {...aria}
        ref={input}
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <StudioAction
        variant="secondary"
        disabled={!value}
        aria-label={`Clear ${label.toLowerCase()}`}
        onClick={() => {
          onChange("");
          input.current?.focus();
        }}
      >
        Clear
      </StudioAction>
    </div>
  );
}

export function StudioTabs({
  id,
  label,
  value,
  options,
  onChange,
  automatic = false,
  className = "",
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  automatic?: boolean;
  className?: string;
}) {
  return (
    <nav className={`ps-tabs ${className}`} role="tablist" aria-label={label}>
      {options.map((option, index) => (
        <button
          key={option.value}
          id={`${id}-${option.value}-tab`}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          aria-controls={`${id}-panel`}
          tabIndex={option.value === value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            if (
              event.nativeEvent.isComposing ||
              !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
            )
              return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? options.length - 1
                  : (index + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
            const target = options[next]!;
            if (automatic) onChange(target.value);
            document.getElementById(`${id}-${target.value}-tab`)?.focus();
          }}
        >
          {option.label}
        </button>
      ))}
    </nav>
  );
}
