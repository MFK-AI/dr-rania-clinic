import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { customAuthRouter } from "./routers/auth";
import { adminRouter } from "./routers/admin";
import { aiRouter } from "./routers/ai";
import { exportsRouter } from "./routers/exports";
import { filesRouter } from "./routers/files";
import { patientsRouter } from "./routers/patients";
import { remindersRouter } from "./routers/reminders";
import { telegramRouter } from "./routers/telegram";
import { syncRouter } from "./routers/sync";
import { visitsRouter } from "./routers/visits";

export const appRouter = router({
  system: systemRouter,
  auth: customAuthRouter,
  patients: patientsRouter,
  visits: visitsRouter,
  reminders: remindersRouter,
  files: filesRouter,
  ai: aiRouter,
  admin: adminRouter,
  exports: exportsRouter,
  telegram: telegramRouter,
  sync: syncRouter,
});

export type AppRouter = typeof appRouter;
