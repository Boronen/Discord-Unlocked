import { open } from "node:fs/promises";
import { z } from "zod";
import { PRIVACY_SECTIONS, type PrivacyNotice } from "../shared/domain/privacy-notice.js";

const text = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((value) => !/REPLACE|example\.invalid/i.test(value), "Complete the operator fields before use.");
export const privacyDeploymentSchema = z
  .object({
    updatedAt: z.iso.date(),
    operator: z
      .object({
        name: text,
        email: z
          .email()
          .max(254)
          .refine((value) => !value.endsWith(".invalid")),
        country: text,
      })
      .strict(),
    legalBasis: text,
    providers: z
      .array(z.object({ name: text, purpose: text, location: text }).strict())
      .min(1)
      .max(20),
    rights: text,
  })
  .strict();

export function privacyNotice(deployment?: unknown): PrivacyNotice {
  const parsed = deployment === undefined ? null : privacyDeploymentSchema.parse(deployment);
  return {
    version: 1,
    configured: parsed !== null,
    updatedAt: parsed?.updatedAt ?? null,
    operator: parsed?.operator ?? null,
    purpose:
      "Operate a moderated, self-hosted Profile Studio community and provide profile editing, sharing and account management.",
    legalBasis: parsed?.legalBasis ?? null,
    providers: parsed?.providers ?? [],
    rights: parsed?.rights ?? null,
    sections: PRIVACY_SECTIONS,
  };
}

/** An explicitly configured but invalid notice prevents startup; errors never echo its content. */
export async function loadPrivacyNotice(path?: string): Promise<PrivacyNotice> {
  if (!path) return privacyNotice();
  try {
    const file = await open(path, "r");
    try {
      if (!(await file.stat()).isFile()) throw new Error();
      const bytes = Buffer.alloc(32 * 1024 + 1);
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
      if (bytesRead > 32 * 1024) throw new Error();
      return privacyNotice(JSON.parse(bytes.subarray(0, bytesRead).toString("utf8")));
    } finally {
      await file.close();
    }
  } catch {
    throw new Error("The public privacy notice is invalid or unreadable. Check PRIVACY_NOTICE_FILE locally.");
  }
}
