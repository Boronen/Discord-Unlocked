import { React } from "@webpack/common";
import { Button } from "@components/Button";
export function StudioField({
  id,
  label,
  children,
  help,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  help?: string;
}) {
  return (
    <div className="ps-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {help && <small id={`${id}-help`}>{help}</small>}
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
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
