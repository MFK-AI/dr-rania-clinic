import type { Express, Request } from "express";
import { ENV } from "./env";
import { verifyToken } from "../routers/auth";
import { COOKIE_NAME } from "@shared/const";

// SECURITY FIX: this route previously had NO authentication check at all.
// Anyone who obtained or guessed a file key (e.g. from network logs, a
// shared link, or simple enumeration of the predictable
// "patients/{id}/{timestamp}_{name}" key pattern used in files.ts) could
// view any patient's uploaded file — lab results, ultrasound images, voice
// notes, screenshots — with no login required. This now requires a valid
// session before issuing the signed redirect, consistent with "private file
// URLs only" / "no public patient data" in the project's safety
// requirements. Authorization model matches the rest of the app: any
// authenticated doctor/assistant/admin can view any patient's files (same
// flat access model used everywhere else in this codebase).
function getSessionToken(req: Request): string | undefined {
  const header = req.headers?.cookie ?? "";
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === COOKIE_NAME) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const token = getSessionToken(req);
    const userId = token ? await verifyToken(token) : null;
    if (!userId) {
      res.status(401).send("Authentication required");
      return;
    }

    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
