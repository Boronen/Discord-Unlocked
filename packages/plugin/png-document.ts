// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from "node:crypto";

/** Served from memory in the export window's private session; never fetched from the internet. */
export function pngDocument(svg: string) {
  const url = `https://profile-studio-export.invalid/${randomUUID()}`;
  const policy =
    "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
  const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden}img{display:block;width:100%;height:100%}</style><img alt="" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}">`;
  return {
    url,
    respond(request: { url: string; method: string }) {
      if (request.url !== url || request.method !== "GET") return new Response(null, { status: 403 });
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": policy,
          "Cache-Control": "no-store",
        },
      });
    },
    allows(request: { url: string; method: string; resourceType: string }) {
      return (
        request.method === "GET" &&
        ((request.url === url && request.resourceType === "mainFrame") ||
          (request.resourceType === "image" && request.url.startsWith("data:image/")))
      );
    },
  };
}
