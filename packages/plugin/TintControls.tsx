import { React } from "@webpack/common";
import { Button } from "@components/Button";
import { TINT_PALETTE, type TintStyle } from "./tint.js";
export function TintControls({
  id,
  label,
  value,
  custom,
  onChange,
}: {
  id: string;
  label: string;
  value?: TintStyle | null;
  custom: boolean;
  onChange: (value: TintStyle | null) => void;
}) {
  const [hex, setHex] = React.useState(value?.color ?? "#ef2b2b");
  React.useEffect(() => setHex(value?.color ?? "#ef2b2b"), [value?.color]);
  const valid = /^#[0-9a-fA-F]{6}$/.test(hex);
  return (
    <fieldset className="ps-tint-controls">
      <legend>{label}</legend>
      <label className="ps-checkbox">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(event) =>
            onChange(event.target.checked ? { color: TINT_PALETTE[0]!.color, intensity: 0.6 } : null)
          }
        />
        Enable tint
      </label>
      {value && (
        <>
          <div className="ps-swatches" role="group" aria-label={`${label} basic colors`}>
            {TINT_PALETTE.map((item) => (
              <button
                key={item.color}
                type="button"
                aria-label={item.name}
                title={item.name}
                aria-pressed={value.color.toLowerCase() === item.color}
                onClick={() => onChange({ ...value, color: item.color })}
                style={{ "--ps-swatch": item.color } as React.CSSProperties}
              />
            ))}
          </div>
          <label htmlFor={`${id}-strength`}>Tint strength · {Math.round(value.intensity * 100)}%</label>
          <input
            id={`${id}-strength`}
            type="range"
            min="0"
            max="1"
            step=".05"
            value={value.intensity}
            onChange={(event) => onChange({ ...value, intensity: Number(event.target.value) })}
          />
          {custom ? (
            <div className="ps-custom-tint">
              <label htmlFor={`${id}-color`}>Custom color</label>
              <input
                type="color"
                id={`${id}-color`}
                value={value.color}
                onChange={(event) => onChange({ ...value, color: event.target.value })}
              />
              <label htmlFor={`${id}-hex`}>HEX color</label>
              <input
                id={`${id}-hex`}
                value={hex}
                maxLength={7}
                aria-invalid={!valid}
                aria-describedby={`${id}-hex-help`}
                onChange={(event) => setHex(event.target.value)}
              />
              <small id={`${id}-hex-help`}>
                {valid
                  ? "Six-digit HEX color, for example #ff2244."
                  : "Enter # followed by six hexadecimal digits."}
              </small>
              <Button
                variant="secondary"
                disabled={!valid}
                onClick={() => onChange({ ...value, color: hex.toLowerCase() })}
              >
                Apply custom color
              </Button>
            </div>
          ) : (
            <p className="ps-help">
              Supporters can choose any color. You can keep a previously approved custom color.
            </p>
          )}
          <Button variant="secondary" onClick={() => onChange(null)}>
            Reset {label.toLowerCase()}
          </Button>
        </>
      )}
    </fieldset>
  );
}
