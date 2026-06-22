import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getAllUsers,
  getDashboardStats,
  listAuditEvents,
  listExports,
  logAuditEvent,
  updateUserRole,
  updateUserTelegram,
  updateUserTelegramById,
} from "../db";

function requireDoctor(role: string) {
  if (role !== "doctor" && role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the doctor can access this section." });
  }
}

export const adminRouter = router({
  // Dashboard statistics
  getDashboardStats: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "doctor" && ctx.user.role !== "assistant" && ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return getDashboardStats();
  }),

  // User management (doctor only)
  listUsers: protectedProcedure.query(async ({ ctx }) => {
    requireDoctor(ctx.user.role);
    return getAllUsers();
  }),

  updateUserRole: protectedProcedure
    .input(
      z.object({
        userId: z.number(),
        role: z.enum(["doctor", "assistant", "admin"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireDoctor(ctx.user.role);
      await updateUserRole(input.userId, input.role);
      await logAuditEvent({
        userId: ctx.user.id,
        action: "manage_users",
        entityType: "user",
        entityId: input.userId,
        metadata: { newRole: input.role },
      });
      return { success: true };
    }),

  updateTelegram: protectedProcedure
    .input(z.object({ telegramChatId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      requireDoctor(ctx.user.role);
      await updateUserTelegram(ctx.user.id, input.telegramChatId);
      return { success: true };
    }),

  updateUserTelegramById: protectedProcedure
    .input(z.object({ userId: z.number(), telegramChatId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      requireDoctor(ctx.user.role);
      await updateUserTelegramById(input.userId, input.telegramChatId || null);
      return { success: true };
    }),

  // Audit log (doctor only)
  listAuditEvents: protectedProcedure
    .input(z.object({ limit: z.number().default(100), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      requireDoctor(ctx.user.role);
      await logAuditEvent({
        userId: ctx.user.id,
        action: "view_audit_log",
        entityType: "audit_log",
      });
      return listAuditEvents(input.limit, input.offset);
    }),

  // Export history
  listExports: protectedProcedure.query(async ({ ctx }) => {
    requireDoctor(ctx.user.role);
    return listExports();
  }),
});
