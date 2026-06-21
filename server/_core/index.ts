import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { storagePut } from "../storage";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { runFullDailySync } from "../routers/sync";
import { formatDailySummary, sendTelegramMessage } from "../routers/telegram";
import { runMigrations } from "../migrate";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Run database migrations on startup (idempotent — safe to run every boot)
  await runMigrations();

  const app = express();
  const server = createServer(app);

  // ─── CORS — allow Cloudflare Pages domains and custom domain ─────────────
  const allowedOrigins: (string | RegExp)[] = [
    "https://dr-rania-clinic.pages.dev",
    "https://drmousa.clinic",
    "https://www.drmousa.clinic",
    // Allow any *.pages.dev preview deployments
    /\.pages\.dev$/,
  ];
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (same-origin, mobile apps, curl)
        if (!origin) return callback(null, true);
        const allowed = allowedOrigins.some((o) =>
          typeof o === "string" ? o === origin : o.test(origin)
        );
        if (allowed) return callback(null, true);
        // In development allow all origins
        if (process.env.NODE_ENV === "development") return callback(null, true);
        callback(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    })
  );

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // Direct file upload endpoint (multipart/form-data)
  app.post("/api/storage/upload", (req, res) => {
    // BUGFIX: this previously buffered the ENTIRE raw request body --
    // multipart boundaries, per-part headers, and all -- and stored that
    // whole envelope as if it were the file itself, with the request's
    // own "multipart/form-data" content-type label attached to it. The
    // AI provider (Gemini, via Forge) correctly rejected that as an
    // invalid image. busboy properly parses the multipart stream and
    // extracts just the actual file bytes and its real per-file mime type.
    try {
      const fileKey = req.query["fileKey"] as string;
      if (!fileKey) {
        res.status(400).json({ error: "fileKey query param required" });
        return;
      }

      const bb = busboy({ headers: req.headers });
      let fileBuffer: Buffer | null = null;
      let fileMimeType = "application/octet-stream";
      let fileSeen = false;

      bb.on("file", (_name, stream, info) => {
        fileSeen = true;
        fileMimeType = info.mimeType || fileMimeType;
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          fileBuffer = Buffer.concat(chunks);
        });
      });

      bb.on("error", (err) => {
        console.error("[Upload] busboy parse error:", err);
        if (!res.headersSent) res.status(400).json({ error: "Invalid upload" });
      });

      bb.on("finish", async () => {
        try {
          if (!fileSeen || !fileBuffer) {
            res.status(400).json({ error: "No file found in upload" });
            return;
          }
          // DIAGNOSTIC: verify busboy actually isolated the file bytes,
          // not the raw multipart envelope (magic bytes for a real JPEG
          // start with ffd8ff; a captured multipart envelope would start
          // with "--" i.e. 2d2d).
          console.log(
            "[Upload] fileBuffer length:", fileBuffer.length,
            "magic bytes:", fileBuffer.subarray(0, 12).toString("hex"),
            "fileMimeType from busboy:", fileMimeType
          );
          const { key, url } = await storagePut(fileKey, fileBuffer, fileMimeType);
          res.json({ key, url });
        } catch (err) {
          console.error("[Upload] storagePut error:", err);
          res.status(500).json({ error: "Upload failed" });
        }
      });

      req.pipe(bb);
    } catch (err) {
      console.error("[Upload] Error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // ─── Scheduled: Daily 7AM Dubai sync ─────────────────────────────────────
  app.post("/api/scheduled/daily-sync", async (req, res) => {
    try {
        // Run full sync (secured by a shared secret in production)
      const result = await runFullDailySync();
      // Send Telegram daily summary
      const summary = await formatDailySummary();
      await sendTelegramMessage(summary, "Markdown");
      return res.json({ ok: true, synced: result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[daily-sync] Error:", message);
      return res.status(500).json({ error: message, timestamp: new Date().toISOString() });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
