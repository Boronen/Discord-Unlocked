import { React } from "@webpack/common";
import type { StudioClient } from "./client.js";
import type { PrivacyNotice } from "./privacy-notice.js";
import { StudioAction } from "./studio-controls.js";
import { Notice } from "./studio-notice.js";

export function PrivacyPanel({ api }: { api: StudioClient }) {
  const [open, setOpen] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const [notice, setNotice] = React.useState<PrivacyNotice | null>(null);
  const [error, setError] = React.useState("");
  const base = api.base;
  React.useEffect(() => {
    setNotice(null);
    setError("");
    if (!open) return;
    let active = true;
    void api.privacyNotice().then(
      (value) => {
        if (active) setNotice(value);
      },
      (reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "The privacy notice could not be loaded.");
      },
    );
    return () => {
      active = false;
    };
  }, [api, base, open, attempt]);
  return (
    <details className="ps-field" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Privacy notice · read before pairing</summary>
      {open && !notice && !error && <p role="status">Loading the public privacy notice…</p>}
      {error && (
        <>
          <Notice error>{error}</Notice>
          <StudioAction variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </StudioAction>
        </>
      )}
      {notice && (
        <>
          {!notice.configured && (
            <Notice error>
              The operator has not completed this deployment's privacy notice. Ask the operator before pairing
              or uploading.
            </Notice>
          )}
          {notice.operator && (
            <p>
              Operator: {notice.operator.name} · {notice.operator.email} · {notice.operator.country}
            </p>
          )}
          {notice.updatedAt && <p>Updated: {notice.updatedAt}</p>}
          <p>{notice.purpose}</p>
          {notice.legalBasis && <p>Legal basis: {notice.legalBasis}</p>}
          {notice.providers.length > 0 && (
            <>
              <h4>Service providers</h4>
              <ul>
                {notice.providers.map((p, i) => (
                  <li key={i}>
                    {p.name}: {p.purpose} ({p.location})
                  </li>
                ))}
              </ul>
            </>
          )}
          {notice.sections.map((section, i) => (
            <section key={i}>
              <h4>{section.title}</h4>
              <p>{section.text}</p>
            </section>
          ))}
          {notice.rights && <p>{notice.rights}</p>}
        </>
      )}
    </details>
  );
}
