import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { logTelegramAlert, getOverdueReminders, getTodaysReminders, getTodaysVisits, listPatients, getAllUsers, getPatientById } from "../db";

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

const REMINDER_TYPE_EMOJI: Record<string, string> = {
  call_patient: "📞",
  inform_result: "📋",
  check_lab: "🧪",
  check_imaging: "🔬",
  follow_up: "🔄",
  medication_review: "💊",
  procedure_booking: "📅",
  custom: "📌",
};

export async function formatDailySummary(): Promise<string> {
  const dubaiNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dubai" }));
  const todayStr = dubaiNow.toLocaleDateString("en-AE", { timeZone: "Asia/Dubai", weekday: "long", year: "numeric", month: "long", day: "numeric" });

  let todayVisitCount = 0;
  let overdueCount = 0;
  let totalPatients = 0;
  let todayReminders: Awaited<ReturnType<typeof getTodaysReminders>> = [];
  let overdueReminders: Awaited<ReturnType<typeof getOverdueReminders>> = [];

  try {
    const [visits, overdue, patients, todayRem] = await Promise.all([
      getTodaysVisits(),
      getOverdueReminders(),
      listPatients(1000, 0),
      getTodaysReminders(),
    ]);
    todayVisitCount = visits.length;
    overdueCount = overdue.length;
    totalPatients = patients.length;
    todayReminders = todayRem;
    overdueReminders = overdue;
  } catch {
    // proceed with zeros if DB unavailable
  }

  // Enrich reminders with patient names (best-effort)
  const enrichedToday: { title: string; patientName: string; dueTime: string | null; type: string }[] = [];
  for (const r of todayReminders) {
    let patientName = "Unknown Patient";
    try {
      const p = await getPatientById(r.patientId);
      if (p) patientName = p.name;
    } catch { /* ignore */ }
    enrichedToday.push({ title: r.title, patientName, dueTime: r.dueTime ?? null, type: r.reminderType });
  }

  const enrichedOverdue: { title: string; patientName: string; dueDate: string; type: string }[] = [];
  for (const r of overdueReminders.slice(0, 5)) { // cap at 5 overdue
    let patientName = "Unknown Patient";
    try {
      const p = await getPatientById(r.patientId);
      if (p) patientName = p.name;
    } catch { /* ignore */ }
    enrichedOverdue.push({ title: r.title, patientName, dueDate: r.dueDate, type: r.reminderType });
  }

  const lines = [
    `🌅 <b>Good Morning, Dr. Rania Khalil!</b>`,
    `📅 ${todayStr}`,
    ``,
    `📊 <b>Clinic Summary</b>`,
    `👥 Total Patients: <b>${totalPatients}</b>`,
    `📋 Today's Visits: <b>${todayVisitCount}</b>`,
    `🔔 Today's Reminders: <b>${enrichedToday.length}</b>`,
    overdueCount > 0 ? `⚠️ Overdue Reminders: <b>${overdueCount}</b>` : `✅ No overdue reminders`,
    ``,
  ];

  if (enrichedToday.length > 0) {
    lines.push(`📌 <b>Today's Reminder List</b>`);
    for (const r of enrichedToday) {
      const emoji = REMINDER_TYPE_EMOJI[r.type] ?? "📌";
      const time = r.dueTime ? ` — <i>${r.dueTime}</i>` : "";
      lines.push(`${emoji} <b>${r.patientName}</b>${time}`);
      lines.push(`   └ ${r.title}`);
    }
    lines.push(``);
  } else {
    lines.push(`✅ <b>No reminders scheduled for today</b>`);
    lines.push(``);
  }

  if (enrichedOverdue.length > 0) {
    lines.push(`⚠️ <b>Overdue (action needed)</b>`);
    for (const r of enrichedOverdue) {
      const emoji = REMINDER_TYPE_EMOJI[r.type] ?? "📌";
      lines.push(`${emoji} <b>${r.patientName}</b> — <i>was ${r.dueDate}</i>`);
      lines.push(`   └ ${r.title}`);
    }
    if (overdueCount > 5) lines.push(`   … and ${overdueCount - 5} more`);
    lines.push(``);
  }

  lines.push(`Have a wonderful and productive day! 🏥✨`);

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
      `✅ <b>Dr. Rania Khalil Clinic</b>\n\nTelegram connection verified!\n🤖 Bot: @DrRaniaClinicbot\n🌐 Domain: drmousa.clinic\n⏰ ${new Date().toLocaleString("en-AE", { timeZone: "Asia/Dubai" })}`
    );
    return { configured: true, connected: success };
  }),
});

// ─── Exported helper for periodic jobs ──────────────────────────────────────
export async function sendTelegramAlert(message: string): Promise<boolean> {
  return sendTelegramMessage(message);
}

// ─── Broadcast to ALL active staff with Telegram configured ─────────────────
// Sends the same HTML-formatted message to:
//   1. The primary TELEGRAM_CHAT_ID env var (Dr. Rania's main channel)
//   2. Every active user whose telegramChatId column is set in the DB
// Chat IDs are deduplicated so no one receives the message twice.
// All sends run in parallel — one failing recipient never blocks others.
export async function broadcastTelegramAlert(message: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const mainChatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken) return;

  // Build deduplicated set of chat IDs
  const chatIds = new Set<string>();
  if (mainChatId) chatIds.add(mainChatId);

  try {
    const allUsers = await getAllUsers();
    for (const u of allUsers) {
      if (u.isActive && u.telegramChatId) chatIds.add(u.telegramChatId);
    }
  } catch {
    // DB unavailable — fall through with just the primary chat ID
  }

  // Send to all recipients simultaneously
  await Promise.allSettled(
    Array.from(chatIds).map((chatId) =>
      fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
      }).catch(() => null)
    )
  );

  // Log to audit table (best-effort, non-blocking)
  logTelegramAlert("instant", message, true).catch(() => {});
}
