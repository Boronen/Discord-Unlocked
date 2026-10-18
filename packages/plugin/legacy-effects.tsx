import { React } from "@webpack/common";
import { type EffectStyle } from "./model.js";
import { StudioField as Field, StudioChoice as Choice } from "./studio-controls.js";

export function Effects({
  id,
  value,
  onChange,
}: {
  id: string;
  value: EffectStyle;
  onChange: (value: EffectStyle) => void;
}) {
  return (
    <div className="ps-effect-controls">
      <Field id={`${id}-preset`} label="Animation">
        <Choice
          id={`${id}-preset`}
          value={value.preset}
          onChange={(preset) => onChange({ ...value, preset: preset as EffectStyle["preset"] })}
          options={[
            { value: "none", label: "None" },
            { value: "glow", label: "Glow" },
            { value: "gradient", label: "Gradient" },
            { value: "particles", label: "Particles" },
          ]}
        />
      </Field>
      <Field id={`${id}-color`} label="Effect color">
        <input
          id={`${id}-color`}
          type="color"
          value={value.color}
          onChange={(e) => onChange({ ...value, color: e.target.value })}
        />
      </Field>
      <Field id={`${id}-intensity`} label={`Intensity · ${Math.round(value.intensity * 100)}%`}>
        <input
          id={`${id}-intensity`}
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={value.intensity}
          onChange={(e) => onChange({ ...value, intensity: Number(e.target.value) })}
        />
      </Field>
      <Field id={`${id}-speed`} label={`Speed · ${value.speed}×`}>
        <input
          id={`${id}-speed`}
          type="range"
          min="0.25"
          max="3"
          step="0.25"
          value={value.speed}
          onChange={(e) => onChange({ ...value, speed: Number(e.target.value) })}
        />
      </Field>
    </div>
  );
}
