/** Public deployment facts only. Never include credentials or internal host paths. */
export interface PrivacyNotice {
  version: 1;
  configured: boolean;
  updatedAt: string | null;
  operator: { name: string; email: string; country: string } | null;
  purpose: string;
  legalBasis: string | null;
  providers: { name: string; purpose: string; location: string }[];
  rights: string | null;
  sections: { title: string; text: string }[];
}

export const PRIVACY_SECTIONS: PrivacyNotice["sections"] = [
  {
    title: "Account and profile data",
    text: "The service stores your Discord account ID, profile drafts and revisions, presets, collections, media metadata and files, shared styles and copying permissions, automation rules, badge assignments, device session records and moderation decisions. Approved profiles and shared styles are visible to paired community members. The operator and authorized moderators can access the data needed to operate and review the service.",
  },
  {
    title: "Local data and external services",
    text: "Windows encrypted storage protects the remembered session and local draft recovery. Viewer preferences stay on the device. Discord, image providers and explicitly opened music players may receive connection information. Current music activity is read for display; the service does not keep a listening or game activity history. Authorized viewers can save displayed content.",
  },
  {
    title: "Retention",
    text: "Original uploads are removed after processing by the next maintenance pass. Failed, revoked or solely rejected uploads are retained for at most seven days; unused media and historical revisions for at most 30 days. Referenced saved presets, pending submissions and shared styles protect media from unused-file cleanup. Current approved profiles remain until withdrawal or deletion. Sessions expire after 90 days of inactivity. Pairing and publication codes expire after five minutes. Security and moderation records are retained for 30 days; hashed recovery fences for 31 days. Encrypted backups rotate after 30 days when the documented backup schedule is enabled.",
  },
  {
    title: "Export and deletion",
    text: "Account, devices and privacy offers authenticated export, device revocation and account deletion, including after community departure. Deletion removes access immediately and active storage within 24 hours. Encrypted backup copies expire within 30 days; recovery fences prevent erased accounts and revoked sessions from returning after restore. Discord moderation messages require operator cleanup. If your session has expired, contact the operator for verified support. Local files you exported yourself are not remotely deleted.",
  },
];
