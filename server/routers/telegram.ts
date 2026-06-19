import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { logTelegramAlert, getOverdueReminders, getTodaysVisits, listPatients } from "../db";

const TELEGRAM_API = "https://api.telegram.org";

function requireDoctor(role: string) {
  if (role !== "doctor" && role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the doctor can manage Telegram alerts." });
  }
}

export async function sendTelegramMessage(message: string, parseMode: "HTML" | "Markdown" = "HTML"): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return false;
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: parseMode }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Rich message formatters ────────────────────────────────────────────────

export function formatNewPatientAlert(patient: {
  name: string;
  phone: string;
  age?: number | null;
  visitLocation?: string | null;
}): string {
  const lines = [
    `🏥 <b>New Patient Registered</b>`,
    ``,
    `👤 <b>Name:</b> ${patient.name}`,
    `📞 <b>Phone:</b> ${patient.phone}`,
  ];
  if (patient.age) lines.push(`🎂 <b>Age:</b> ${patient.age}`);
  if (patient.visitLocation) lines.push(`📍 <b>Location:</b> ${patient.visitLocation}`);
  lines.push(``, `⏰ ${new Date().toLocaleString("en-AE", { timeZone: "Asia/Dubai" })}`);
  return lines.join("\n");
}

export function formatReminderAlert(reminder: {
  patientName: string;
  patientPhone: string;
  reminderText: string;
  dueDate?: Date | null;
  priority?: string | null;
}): string {
  const priorityEmoji = reminder.priority === "high" ? "🔴" : reminder.priority === "medium" ? "🟡" : "🟢";
  const lines = [
    `${priorityEmoji} <b>Patient Reminder</b>`,
    ``,
    `👤 <b>Patient:</b> ${reminder.patientName}`,
    `📞 <b>Phone:</b> ${reminder.patientPhone}`,
    `📋 <b>Reminder:</b> ${reminder.reminderText}`,
  ];
  if (reminder.dueDate) {
    lines.push(`📅 <b>Due:</b> ${new Date(reminder.dueDate).toLocaleDateString("en-AE", { timeZone: "Asia/Dubai", weekday: "long", year: "numeric", month: "long", day: "numeric" })}`);
  }
  lines.push(``, `⏰ Sent: ${new Date().toLocaleString("en-AE", { timeZone: "Asia/Dubai" })}`);
  return lines.join("\n");
}

export function formatVisitAlert(visit: {
  patientName: string;
  patientPhone: string;
  visitType?: string | null;
  chiefComplaint?: string | null;
  visitDate: Date;
}): string {
  const lines = [
    `📅 <b>New Visit Recorded</b>`,
    ``,
    `👤 <b>Patient:</b> ${visit.patientName}`,
    `📞 <b>Phone:</b> ${visit.patientPhone}`,
  ];
  if (visit.visitType) lines.push(`🏷️ <b>Type:</b> ${visit.visitType}`);
  if (visit.chiefComplaint) lines.push(`💬 <b>Chief Complaint:</b> ${visit.chiefComplaint}`);
  lines.push(`📅 <b>Date:</b> ${new Date(visit.visitDate).toLocaleDateString("en-AE", { timeZone: "Asia/Dubai", weekday: "long", year: "numeric", month: "long", day: "numeric" })}`);
  lines.push(``, `⏰ ${new Date().toLocaleString("en-AE", { timeZone: "Asia/Dubai" })}`);
  return lines.join("\n");
}

export async function formatDailySummary(): Promise<string> {
  const dubaiNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dubai" }));
  const todayStr = dubaiNow.toLocaleDateString("en-AE", { timeZone: "Asia/Dubai", weekday: "long", year: "numeric", month: "long", day: "numeric" });

  let todayVisitCount = 0;
  let overdueCount = 0;
  let totalPatients = 0;

  try {
    const [visits, overdue, patients] = await Promise.all([
      getTodaysVisits(),
      getOverdueReminders(),
      listPatients(1000, 0),
    ]);
    todayVisitCount = visits.length;
    overdueCount = overdue.length;
    totalPatients = patients.length;
  } catch {
    // proceed with zeros if DB unavailable
  }

  const lines = [
    `🌅 <b>Good Morning, Dr. Rania!</b>`,
    `📅 ${todayStr}`,
    ``,
    `📊 <b>Clinic Summary</b>`,
    `👥 Total Patients: <b>${totalPatients}</b>`,
    `📋 Today's Visits: <b>${todayVisitCount}</b>`,
    `⚠️ Overdue Reminders: <b>${overdueCount}</b>`,
    ``,
    `Have a wonderful and productive day! 🏥✨`,
  ];

  return lines.join("\n");
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const telegramRouter = router({
  sendAlert: protectedProcedure
    .input(z.object({
      message: z.string(),
      alertType: z.enum(["instant", "daily_summary"]).default("instant"),
    }))
    .mutation(async ({ ctx, input }) => {
      requireDoctor(ctx.user.role);
      const success = await sendTelegramMessage(input.message);
      await logTelegramAlert("instant", input.message, success);
      if (!success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to send Telegram message." });
      return { success: true };
    }),

  sendReminderAlert: protectedProcedure
    .input(z.object({
      patientName: z.string(),
      patientPhone: z.string(),
      reminderText: z.string(),
      dueDate: z.string().optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireDoctor(ctx.user.role);
      const message = formatReminderAlert({
        patientName: input.patientName,
        patientPhone: input.patientPhone,
        reminderText: input.reminderText,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        priority: input.priority ?? null,
      });
      const success = await sendTelegramMessage(message);
      await logTelegramAlert("instant", message, success);
      return { success };
    }),

  sendNewPatientAlert: protectedProcedure
    .input(z.object({
      name: z.string(),
      phone: z.string(),
      age: z.number().optional(),
      visitLocation: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const message = formatNewPatientAlert(input);
      const success = await sendTelegramMessage(message);
      await logTelegramAlert("instant", message, success);
      return { success };
    }),

  sendDailySummary: protectedProcedure.mutation(async ({ ctx }) => {
    requireDoctor(ctx.user.role);
    const message = await formatDailySummary();
    const success = await sendTelegramMessage(message);
    await logTelegramAlert("daily_summary", message, success);
    return { success };
  }),

  testConnection: protectedProcedure.mutation(async ({ ctx }) => {
    requireDoctor(ctx.user.role);
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return { configured: false, message: "Telegram credentials not set." };
    const success = await sendTelegramMessage(
      `✅ <b>Dr. Rania Clinic</b>\n\nTelegram connection verified!\n🤖 Bot: @DrRaniaClinicbot\n📱 Chat: Dr. Rania Mousa\n⏰ ${new Date().toLocaleString("en-AE", { timeZone: "Asia/Dubai" })}`
    );
    return { configured: true, connected: success };
  }),
});

// ─── Exported helper for periodic jobs ──────────────────────────────────────
export async function sendTelegramAlert(message: string): Promise<boolean> {
  return sendTelegramMessage(message);
}
