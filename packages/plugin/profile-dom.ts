import { profileReadability } from "./profile-readability.js";

export function tagAvatarSource(source: string, userId: string) {
  try {
    const url = new URL(source);
    if (url.protocol === "blob:") {
      url.hash = `ps-user=${userId}`;
      return url.toString();
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return source;
    url.searchParams.set("ps-user", userId);
    return url.toString();
  } catch {
    return source;
  }
}

export function profileRoot(anchor: Element) {
  let node = anchor.parentElement;
  while (node && node !== document.body) {
    if (
      node.matches('[class*="userProfileOuter"],[class*="outer_"]') &&
      node.getBoundingClientRect().width >= 240
    )
      return node;
    node = node.parentElement;
  }
  return null;
}

/** Override only approved color fields and restore precisely what we changed. */
export function applyProfileColors(root: HTMLElement, colors: [string, string]) {
  const readable = profileReadability(colors);
  const values: Record<string, string> = {
    "--profile-gradient-primary-color": colors[0],
    "--profile-gradient-secondary-color": colors[1],
    "--profile-gradient-modal-background-color": colors[1],
    "--profile-gradient-button-color": readable["--ps-profile-surface"],
    "--profile-gradient-overlay-color": readable["--ps-profile-surface"],
    "--profile-body-background-color": readable["--ps-profile-surface"],
  };
  const restore = [
    applyProperties(root, {
      ...values,
      "background-image": `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`,
    }),
  ];
  // Discord puts theme variables on inner wrappers too. A parent override cannot
  // beat a child's own variables; touch only explicit theme owners in this card.
  for (const element of root.querySelectorAll<HTMLElement>(
    '[style*="--profile-gradient-"],[style*="--profile-body-background-color"]',
  ))
    restore.push(applyProperties(element, values));
  return () => {
    for (const undo of restore.reverse()) undo();
  };
}

export function applyProfileReadability(root: HTMLElement, colors?: [string, string] | null) {
  const tokens = profileReadability(colors);
  const values: Record<string, string> = { ...tokens };
  // Discord's theme can supply dark labels even inside a custom dark profile.
  // Scope its text roles to this card only; independent music cards own their pair.
  if (colors) {
    for (const role of ["--text-normal", "--text-default", "--text-primary", "--header-primary"])
      values[role] = tokens["--ps-profile-text"];
    for (const role of ["--text-muted", "--text-secondary", "--header-secondary"])
      values[role] = tokens["--ps-profile-secondary"];
    values.color = tokens["--ps-profile-text"];
  }
  return applyProperties(root, values);
}

function applyProperties(root: HTMLElement, values: Record<string, string>) {
  const previous = Object.keys(values).map((key) => ({
    key,
    value: root.style.getPropertyValue(key),
    priority: root.style.getPropertyPriority(key),
  }));
  for (const [key, value] of Object.entries(values)) root.style.setProperty(key, value, "important");
  return () => {
    for (const { key, value, priority } of previous)
      if (value) root.style.setProperty(key, value, priority);
      else root.style.removeProperty(key);
  };
}
