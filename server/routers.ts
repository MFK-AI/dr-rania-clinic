import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { adminRouter } from "./routers/admin";
import { aiRouter } from "./routers/ai";
import { exportsRouter } from "./routers/exports";
import { filesRouter } from "./routers/files";
import { patientsRouter } from "./routers/patients";
import { remindersRouter } from "./routers/reminders";
import { telegramRouter } from "./routers/telegram";
import { visitsRouter } from "./routers/visits";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  patients: patientsRouter,
  visits: visitsRouter,
  reminders: remindersRouter,
  files: filesRouter,
  ai: aiRouter,
  admin: adminRouter,
  exports: exportsRouter,
  telegram: telegramRouter,
});

export type AppRouter = typeof appRouter;
