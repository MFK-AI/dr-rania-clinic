import "dotenv/config";
import express from "express";
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
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // Direct file upload endpoint (multipart/form-data)
  app.post("/api/storage/upload", async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      await new Promise<void>((resolve, reject) => {
        req.on("end", resolve);
        req.on("error", reject);
      });
      const body = Buffer.concat(chunks);
      const contentType = req.headers["content-type"] ?? "application/octet-stream";
      // Parse fileKey from query param
      const fileKey = req.query["fileKey"] as string;
      if (!fileKey) {
        res.status(400).json({ error: "fileKey query param required" });
        return;
      }
      const { key, url } = await storagePut(fileKey, body, contentType);
      res.json({ key, url });
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
