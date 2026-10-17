import { React } from "@webpack/common";
import { tintMatrix, type TintStyle } from "./tint.js";
export function TintSurface({
  tint,
  children,
  className = "",
}: {
  tint?: TintStyle | null;
  children: React.ReactNode;
  className?: string;
}) {
  const id = `ps-tint-${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <div className={`ps-tint-surface ${className}`}>
      {tint && tint.intensity > 0 && (
        <svg className="ps-filter-definitions" aria-hidden="true" width="0" height="0">
          <defs>
            <filter id={id} colorInterpolationFilters="sRGB">
              <feColorMatrix type="matrix" values={tintMatrix(tint)} />
            </filter>
          </defs>
        </svg>
      )}
      <div
        className="ps-tint-content"
        style={tint && tint.intensity > 0 ? { filter: `url(#${id})` } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
