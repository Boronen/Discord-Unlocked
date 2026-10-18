import { React } from "@webpack/common";

export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return (
    <p
      className={`ps-notice${error ? " ps-error" : ""}`}
      role={error ? "alert" : "status"}
      aria-live={error ? "assertive" : "polite"}
    >
      {children}
    </p>
  );
}
