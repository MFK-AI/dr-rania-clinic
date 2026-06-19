import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createReminder,
  getReminderById,
  getRemindersByPatient,
  getTodaysReminders,
  getOverdueReminders,
  getPatientById,
  logAuditEvent,
  updateReminderStatus,
} from "../db";
import { getDb } from "../db";
import { syncReminderToSheet, createReminderCalendarEvent } from "./sync";
import { sendTelegramAlert } from "./telegram";
import { reminders } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

function requireDoctorOrAssistant(role: string) {
  if (role !== "doctor" && role !== "assistant" && role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });
  }
}

const reminderInput = z.object({
  patientId: z.number(),
  visitId: z.number().optional(),
  reminderType: z.enum([
    "call_patient",
    "inform_result",
    "check_lab",
    "check_imaging",
    "follow_up",
    "medication_review",
    "procedure_booking",
    "custom",
  ]),
  title: z.string().min(1),
  notes: z.string().optional(),
  dueDate: z.string(),
  dueTime: z.string().optional(),
  isRepeating: z.boolean().default(false),
  requiresDoctorReview: z.boolean().default(false),
  sourceText: z.string().optional(),
});

export const remindersRouter = router({
  listByPatient: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      return getRemindersByPatient(input.patientId);
    }),

  getTodays: protectedProcedure.query(async ({ ctx }) => {
    requireDoctorOrAssistant(ctx.user.role);
    return getTodaysReminders();
  }),

  getOverdue: protectedProcedure.query(async ({ ctx }) => {
    requireDoctorOrAssistant(ctx.user.role);
    return getOverdueReminders();
  }),

  listAll: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      const db = await getDb();
      if (!db) return [];
      const { desc } = await import("drizzle-orm");
      return db
        .select()
        .from(reminders)
        .orderBy(desc(reminders.dueDate))
        .limit(input.limit);
    }),

  create: protectedProcedure
    .input(reminderInput)
    .mutation(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      const id = await createReminder({ ...input, createdBy: ctx.user.id });
      await logAuditEvent({
        userId: ctx.user.id,
        action: "create_reminder",
        entityType: "reminder",
        entityId: id,
        metadata: { type: input.reminderType, dueDate: input.dueDate },
      });
      // Non-blocking: sync to Sheets, Calendar, and Telegram
      getPatientById(input.patientId).then((p) => {
        if (!p) return;
        getReminderById(id).then((r) => {
          if (r) syncReminderToSheet(r, p.name, p.phone).catch(() => {});
        }).catch(() => {});
        createReminderCalendarEvent({
          patientName: p.name,
          patientPhone: p.phone,
          reminderText: input.title,
          dueDate: new Date(input.dueDate),
        }).catch(() => {});
        sendTelegramAlert(
          `🔔 *New Reminder*\n👤 ${p.name} (${p.phone})\n📋 ${input.title}\n📅 Due: ${input.dueDate}\n🏷️ Type: ${input.reminderType}`
        ).catch(() => {});
      }).catch(() => {});
      return { id };
    }),

  complete: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        completionNote: z.string().optional(),
        requiresDoctorReview: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      const reminder = await getReminderById(input.id);
      if (!reminder) throw new TRPCError({ code: "NOT_FOUND", message: "Reminder not found." });
      await updateReminderStatus(input.id, "done", ctx.user.id, input.completionNote);
      // Update requiresDoctorReview if needed
      if (input.requiresDoctorReview) {
        const db = await getDb();
        if (db) await db.update(reminders).set({ requiresDoctorReview: true }).where(eq(reminders.id, input.id));
      }
      await logAuditEvent({
        userId: ctx.user.id,
        action: "complete_reminder",
        entityType: "reminder",
        entityId: input.id,
        metadata: { completionNote: input.completionNote },
      });
      return { success: true };
    }),

  postpone: protectedProcedure
    .input(z.object({ id: z.number(), postponedTo: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      const reminder = await getReminderById(input.id);
      if (!reminder) throw new TRPCError({ code: "NOT_FOUND", message: "Reminder not found." });
      await updateReminderStatus(input.id, "postponed", undefined, undefined, input.postponedTo);
      await logAuditEvent({
        userId: ctx.user.id,
        action: "postpone_reminder",
        entityType: "reminder",
        entityId: input.id,
        metadata: { postponedTo: input.postponedTo },
      });
      return { success: true };
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      await updateReminderStatus(input.id, "cancelled");
      await logAuditEvent({
        userId: ctx.user.id,
        action: "cancel_reminder",
        entityType: "reminder",
        entityId: input.id,
      });
      return { success: true };
    }),
});
