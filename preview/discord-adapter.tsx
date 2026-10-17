import React from "react";
export { React };
export function Button({
  variant = "primary",
  size,
  children,
  ...props
}: React.ComponentProps<"button"> & { variant?: string; size?: string }) {
  return (
    <button
      type="button"
      {...props}
      className={`preview-button preview-button-${variant} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}
