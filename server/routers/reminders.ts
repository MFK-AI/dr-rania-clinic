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

function requireDoctor(role: string) {
  if (role !== "doctor" && role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the doctor can perform this action." });
  }
}

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
          dueDate: input.dueDate,
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

  // Doctor approves an auto-extracted reminder for Calendar + Telegram.
  // Auto-extracted reminders are saved immediately with requiresDoctorReview=true.
  // This mutation clears that flag and fires Calendar + Telegram.
  sendToCalendar: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireDoctor(ctx.user.role);
      const reminder = await getReminderById(input.id);
      if (!reminder) throw new TRPCError({ code: "NOT_FOUND", message: "Reminder not found." });
      const db = await getDb();
      if (db) {
        await db.update(reminders)
          .set({ requiresDoctorReview: false })
          .where(eq(reminders.id, input.id));
      }
      // Fetch patient for name + phone in calendar event and Telegram
      const patient = reminder.patientId ? await getPatientById(reminder.patientId) : null;

      // Fire Calendar event — include patient name in description (private calendar)
      const calendarEventId = await createReminderCalendarEvent({
        title: reminder.title ?? "Follow-up",
        dueDate: reminder.dueDate ?? new Date().toISOString().split("T")[0],
        dueTime: reminder.dueTime ?? undefined,
        patientName: patient?.name ?? undefined,
        patientPhone: patient?.phone ?? undefined,
      }).catch((err) => {
        console.error("[reminders.sendToCalendar] Calendar failed:", err instanceof Error ? err.message : err);
        return null;
      });
      // Fire Telegram
      await sendTelegramAlert(
        "🔔 *Reminder Approved for Calendar*\n" +
        (patient ? "👤 " + patient.name + " (" + patient.phone + ")\n" : "") +
        "📋 " + (reminder.title ?? "Follow-up") + "\n" +
        "📅 Due: " + (reminder.dueDate ?? "TBD") + "\n" +
        "✅ Approved — open the clinic app for full details."
      ).catch(() => {});
      await logAuditEvent({
        userId: ctx.user.id,
        action: "create_reminder",
        entityType: "reminder",
        entityId: input.id,
        metadata: { calendarEventId, approvedForCalendar: true },
      });
      return { success: true, calendarEventId };
    }),
});
