import { React } from "@webpack/common";
import type { AutomationRule } from "../studio-model.js";
import { StudioField as Field, StudioAction as Action, StudioChoice as Choice } from "../studio-controls.js";
import type { CommunityProps as Props } from "./types.js";

export function AutomationPanel(props: Props) {
  const [rules, setRules] = React.useState<AutomationRule[]>(props.workspace.automation.rules),
    [enabled, setEnabled] = React.useState(props.workspace.automation.enabled);
  React.useEffect(() => {
    setRules(props.workspace.automation.rules);
    setEnabled(props.workspace.automation.enabled);
  }, [props.workspace.automation.version, props.workspace.automation.enabled]);
  const update = (id: string, patch: Partial<AutomationRule>) =>
    setRules((values) => values.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const approved = props.workspace.presets.filter((p) => p.approvedRevisionId);
  return (
    <section>
      <h3>Automatic preset switching</h3>
      <p>
        The first matching rule wins after 20 seconds. Manual activation pauses automation. Only approved
        presets can be activated. Activity details stay on this device.
      </p>
      <label className="ps-checkbox">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enable automation on this device
      </label>
      <Action
        disabled={!approved.length || rules.length >= 20}
        onClick={() =>
          setRules([
            ...rules,
            {
              id: crypto.randomUUID(),
              kind: "music",
              applicationId: "",
              presetId: approved[0]!.id,
              enabled: true,
            },
          ])
        }
      >
        Add rule
      </Action>
      {rules.map((rule, i) => (
        <fieldset className="ps-automation-rule" key={rule.id}>
          <legend>Rule {i + 1}</legend>
          <label className="ps-checkbox">
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={(e) => update(rule.id, { enabled: e.target.checked })}
            />
            Enabled
          </label>
          <Field id={`rule-kind-${rule.id}`} label="When">
            <Choice
              id={`rule-kind-${rule.id}`}
              value={rule.kind}
              onChange={(v) => update(rule.id, { kind: v as AutomationRule["kind"] })}
              options={[
                { value: "game", label: "Playing a game" },
                { value: "music", label: "Listening to music" },
                { value: "online", label: "Online" },
                { value: "idle", label: "Idle" },
                { value: "dnd", label: "Do Not Disturb" },
              ]}
            />
          </Field>
          {rule.kind === "game" && (
            <>
              <Field id={`rule-game-${rule.id}`} label="Game application ID">
                <input
                  id={`rule-game-${rule.id}`}
                  inputMode="numeric"
                  maxLength={20}
                  value={rule.applicationId}
                  onChange={(e) => update(rule.id, { applicationId: e.target.value.replace(/\D/g, "") })}
                />
              </Field>
              {props.activitySuggestions?.map((g) => (
                <Action
                  key={g.applicationId}
                  variant="secondary"
                  onClick={() => update(rule.id, { applicationId: g.applicationId })}
                >
                  Use {g.name}
                </Action>
              ))}
            </>
          )}
          <Field id={`rule-preset-${rule.id}`} label="Activate preset">
            <Choice
              id={`rule-preset-${rule.id}`}
              value={rule.presetId}
              onChange={(id) => update(rule.id, { presetId: id })}
              options={approved.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <div className="ps-actions">
            <Action
              variant="secondary"
              disabled={!i}
              onClick={() => {
                const list = [...rules];
                [list[i - 1], list[i]] = [list[i]!, list[i - 1]!];
                setRules(list);
              }}
            >
              Move up
            </Action>
            <Action variant="secondary" onClick={() => setRules(rules.filter((r) => r.id !== rule.id))}>
              Remove rule
            </Action>
          </div>
        </fieldset>
      ))}
      <Action
        onClick={() =>
          void props.onRun(async () => {
            await props.api.request("/v2/me/automation", "PUT", {
              version: props.workspace.automation.version,
              rules,
              enabled,
            });
            await props.onRefresh();
            props.onMessage(
              "Automation saved. If Discord closes, the manual preset returns within 90 seconds.",
            );
          })
        }
      >
        Save automation
      </Action>
    </section>
  );
}
