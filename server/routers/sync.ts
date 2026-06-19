/**
 * Google Sheets & Calendar Sync Router
 *
 * Uses the `gws` CLI (pre-configured with Google OAuth) via child_process
 * to sync patient data to Google Sheets and create calendar events.
 *
 * Sheet ID: 1V9fsOxQwxNXmUn5PrjQhUGKaO48whZYVTIM2cp4ljOo
 * Calendar: dr.raniakhalil83@gmail.com
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { listPatients, getVisitsByPatient, getOverdueReminders, getTodaysVisits } from "../db";
import type { Patient, Visit, Reminder } from "../../drizzle/schema";

const execFileAsync = promisify(execFile);

export const SHEET_ID = "1V9fsOxQwxNXmUn5PrjQhUGKaO48whZYVTIM2cp4ljOo";
export const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
export const CALENDAR_ID = "dr.raniakhalil83@gmail.com";

// ─── gws CLI helper ──────────────────────────────────────────────────────────

async function gws(args: string[]): Promise<unknown> {
  try {
    const { stdout, stderr } = await execFileAsync("gws", args, {
      timeout: 30000,
      env: { ...process.env, HOME: process.env.HOME ?? "/home/ubuntu" },
    });
    if (stderr && !stdout) throw new Error(stderr);
    return JSON.parse(stdout);
  } catch (err) {
    console.error("[GWS] Error:", err);
    throw err;
  }
}

// ─── Sheets helpers ──────────────────────────────────────────────────────────

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-AE", { timeZone: "Asia/Dubai" });
  } catch {
    return String(d);
  }
}

function patientToRow(p: Patient, visitCount = 0, lastVisitDate?: Date | string | null): string[] {
  return [
    String(p.id),
    p.name ?? "",
    p.phone ?? "",
    p.age != null ? String(p.age) : "",
    p.dateOfBirth ? formatDate(p.dateOfBirth) : "",
    p.maritalStatus ?? "",
    p.pregnancyStatus ?? "",
    p.gravida != null ? String(p.gravida) : "0",
    p.para != null ? String(p.para) : "0",
    p.allergies ?? "",
    p.importantNotes ?? "",
    p.visitLocation ?? "",
    String(visitCount),
    lastVisitDate ? formatDate(lastVisitDate) : "",
    formatDate(p.createdAt),
    formatDate(p.updatedAt),
  ];
}

function visitToRow(v: Visit, patientName: string, patientPhone: string): string[] {
  return [
    String(v.id),
    patientName,
    patientPhone,
    formatDate(v.visitDate),
    v.visitType ?? "",
    v.visitLocation ?? "",
    v.reasonForVisit ?? "",
    v.diagnosis ?? "",
    v.examination ?? "",
    v.labsImaging ?? "",
    v.pendingResults ?? "",
    v.ultrasoundFindings ?? "",
    v.managementPlan ?? "",
    v.medications ?? "",
    v.followUpPlan ?? "",
    v.status ?? "",
    String(v.createdBy ?? ""),
    formatDate(v.createdAt),
  ];
}

function reminderToRow(r: Reminder, patientName: string, patientPhone: string): string[] {
  return [
    String(r.id),
    patientName,
    patientPhone,
    r.title ?? "",
    r.dueDate ? formatDate(r.dueDate) : "",
    r.reminderType ?? "",
    r.status ?? "",
    formatDate(r.createdAt),
    r.completedAt ? formatDate(r.completedAt) : "",
  ];
}

// ─── Sync a single patient row (real-time) ──────────────────────────────────

export async function syncPatientToSheet(patient: Patient): Promise<void> {
  try {
    // Get visit count for this patient
    const visits = await getVisitsByPatient(patient.id);
    const lastVisit = visits.length > 0 ? visits[0].visitDate : null;
    const row = patientToRow(patient, visits.length, lastVisit);

    // Check if patient already exists in sheet (search by ID in column A)
    const existing = await gws([
      "sheets", "spreadsheets", "values", "get",
      "--params", JSON.stringify({
        spreadsheetId: SHEET_ID,
        range: "Patients!A:A",
      }),
    ]) as { values?: string[][] };

    const rows = existing?.values ?? [];
    const rowIndex = rows.findIndex((r) => r[0] === String(patient.id));

    if (rowIndex > 0) {
      // Update existing row
      await gws([
        "sheets", "spreadsheets", "values", "update",
        "--params", JSON.stringify({
          spreadsheetId: SHEET_ID,
          range: `Patients!A${rowIndex + 1}:V${rowIndex + 1}`,
          valueInputOption: "RAW",
        }),
        "--json", JSON.stringify({ values: [row] }),
      ]);
    } else {
      // Append new row
      await gws([
        "sheets", "spreadsheets", "values", "append",
        "--params", JSON.stringify({
          spreadsheetId: SHEET_ID,
          range: "Patients!A:V",
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
        }),
        "--json", JSON.stringify({ values: [row] }),
      ]);
    }
  } catch (err) {
    console.error("[Sync] Failed to sync patient to sheet:", err);
    // Non-fatal — don't throw, just log
  }
}

// ─── Sync a visit row ────────────────────────────────────────────────────────

export async function syncVisitToSheet(
  visit: Visit,
  patientName: string,
  patientPhone: string
): Promise<void> {
  try {
    const row = visitToRow(visit, patientName, patientPhone);

    const existing = await gws([
      "sheets", "spreadsheets", "values", "get",
      "--params", JSON.stringify({ spreadsheetId: SHEET_ID, range: "Visits!A:A" }),
    ]) as { values?: string[][] };

    const rows = existing?.values ?? [];
    const rowIndex = rows.findIndex((r) => r[0] === String(visit.id));

    if (rowIndex > 0) {
      await gws([
        "sheets", "spreadsheets", "values", "update",
        "--params", JSON.stringify({
          spreadsheetId: SHEET_ID,
          range: `Visits!A${rowIndex + 1}:R${rowIndex + 1}`,
          valueInputOption: "RAW",
        }),
        "--json", JSON.stringify({ values: [row] }),
      ]);
    } else {
      await gws([
        "sheets", "spreadsheets", "values", "append",
        "--params", JSON.stringify({
          spreadsheetId: SHEET_ID,
          range: "Visits!A:R",
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
        }),
        "--json", JSON.stringify({ values: [row] }),
      ]);
    }
  } catch (err) {
    console.error("[Sync] Failed to sync visit to sheet:", err);
  }
}

// ─── Sync a reminder row ─────────────────────────────────────────────────────

export async function syncReminderToSheet(
  reminder: Reminder,
  patientName: string,
  patientPhone: string
): Promise<void> {
  try {
    const row = reminderToRow(reminder, patientName, patientPhone);

    const existing = await gws([
      "sheets", "spreadsheets", "values", "get",
      "--params", JSON.stringify({ spreadsheetId: SHEET_ID, range: "Reminders!A:A" }),
    ]) as { values?: string[][] };

    const rows = existing?.values ?? [];
    const rowIndex = rows.findIndex((r) => r[0] === String(reminder.id));

    if (rowIndex > 0) {
      await gws([
        "sheets", "spreadsheets", "values", "update",
        "--params", JSON.stringify({
          spreadsheetId: SHEET_ID,
          range: `Reminders!A${rowIndex + 1}:I${rowIndex + 1}`,
          valueInputOption: "RAW",
        }),
        "--json", JSON.stringify({ values: [row] }),
      ]);
    } else {
      await gws([
        "sheets", "spreadsheets", "values", "append",
        "--params", JSON.stringify({
          spreadsheetId: SHEET_ID,
          range: "Reminders!A:I",
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
        }),
        "--json", JSON.stringify({ values: [row] }),
      ]);
    }
  } catch (err) {
    console.error("[Sync] Failed to sync reminder to sheet:", err);
  }
}

// ─── Full daily sync (all patients, visits, reminders) ──────────────────────

export async function runFullDailySync(): Promise<{ patients: number; visits: number; reminders: number }> {
  const patients = await listPatients(10000, 0);
  let totalVisits = 0;

  // Clear existing data rows (keep header)
  await gws([
    "sheets", "spreadsheets", "values", "clear",
    "--params", JSON.stringify({ spreadsheetId: SHEET_ID, range: "Patients!A2:V10000" }),
  ]).catch(() => {});
  await gws([
    "sheets", "spreadsheets", "values", "clear",
    "--params", JSON.stringify({ spreadsheetId: SHEET_ID, range: "Visits!A2:R10000" }),
  ]).catch(() => {});
  await gws([
    "sheets", "spreadsheets", "values", "clear",
    "--params", JSON.stringify({ spreadsheetId: SHEET_ID, range: "Reminders!A2:I10000" }),
  ]).catch(() => {});

  // Write all patients in one batch
  const patientRows: string[][] = [];
  const allVisitRows: string[][] = [];
  const allReminderRows: string[][] = [];

  for (const patient of patients) {
    const visits = await getVisitsByPatient(patient.id);
    const lastVisit = visits.length > 0 ? visits[0].visitDate : null;
    patientRows.push(patientToRow(patient, visits.length, lastVisit));
    totalVisits += visits.length;

    for (const v of visits) {
      allVisitRows.push(visitToRow(v, patient.name ?? "", patient.phone ?? ""));
    }
  }

  const overdueReminders = await getOverdueReminders();
  // Reminders don't have patientName/phone directly - they have patientId
  // We'll use a simplified row for the daily sync
  for (const r of overdueReminders) {
    allReminderRows.push(reminderToRow(r, `Patient #${r.patientId}`, ""));
  }

  if (patientRows.length > 0) {
    await gws([
      "sheets", "spreadsheets", "values", "update",
      "--params", JSON.stringify({
        spreadsheetId: SHEET_ID,
        range: "Patients!A2",
        valueInputOption: "RAW",
      }),
      "--json", JSON.stringify({ values: patientRows }),
    ]);
  }

  if (allVisitRows.length > 0) {
    await gws([
      "sheets", "spreadsheets", "values", "update",
      "--params", JSON.stringify({
        spreadsheetId: SHEET_ID,
        range: "Visits!A2",
        valueInputOption: "RAW",
      }),
      "--json", JSON.stringify({ values: allVisitRows }),
    ]);
  }

  if (allReminderRows.length > 0) {
    await gws([
      "sheets", "spreadsheets", "values", "update",
      "--params", JSON.stringify({
        spreadsheetId: SHEET_ID,
        range: "Reminders!A2",
        valueInputOption: "RAW",
      }),
      "--json", JSON.stringify({ values: allReminderRows }),
    ]);
  }

  return { patients: patientRows.length, visits: allVisitRows.length, reminders: allReminderRows.length };
}

// ─── Google Calendar helpers ─────────────────────────────────────────────────

export async function createCalendarEvent(event: {
  summary: string;
  description?: string;
  startDateTime: string; // ISO 8601
  endDateTime: string;
  attendeeEmail?: string;
  reminderMinutes?: number;
}): Promise<string | null> {
  try {
    const body: Record<string, unknown> = {
      summary: event.summary,
      description: event.description ?? "",
      start: { dateTime: event.startDateTime, timeZone: "Asia/Dubai" },
      end: { dateTime: event.endDateTime, timeZone: "Asia/Dubai" },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: event.reminderMinutes ?? 30 },
          { method: "email", minutes: event.reminderMinutes ?? 30 },
        ],
      },
    };

    if (event.attendeeEmail) {
      body.attendees = [{ email: event.attendeeEmail }];
    }

    const result = await gws([
      "calendar", "events", "insert",
      "--params", JSON.stringify({ calendarId: CALENDAR_ID }),
      "--json", JSON.stringify(body),
    ]) as { id?: string; htmlLink?: string };

    return result?.id ?? null;
  } catch (err) {
    console.error("[Calendar] Failed to create event:", err);
    return null;
  }
}

export async function createReminderCalendarEvent(reminder: {
  patientName: string;
  patientPhone: string;
  reminderText: string;
  dueDate: Date;
  priority?: string | null;
}): Promise<string | null> {
  const priorityLabel = reminder.priority === "high" ? "🔴 URGENT" : reminder.priority === "medium" ? "🟡" : "🟢";
  const startISO = new Date(reminder.dueDate).toISOString();
  // Default to 30-minute event
  const endISO = new Date(new Date(reminder.dueDate).getTime() + 30 * 60 * 1000).toISOString();

  return createCalendarEvent({
    summary: `${priorityLabel} Reminder: ${reminder.patientName}`,
    description: `Patient: ${reminder.patientName}\nPhone: ${reminder.patientPhone}\n\nReminder: ${reminder.reminderText ?? ""}`,
    startDateTime: startISO,
    endDateTime: endISO,
    attendeeEmail: CALENDAR_ID,
    reminderMinutes: reminder.priority === "high" ? 60 : 30,
  });
}

export async function createVisitCalendarEvent(visit: {
  patientName: string;
  patientPhone: string;
  visitType?: string | null;
  chiefComplaint?: string | null;
  visitDate: Date;
  location?: string | null;
}): Promise<string | null> {
  const startISO = new Date(visit.visitDate).toISOString();
  const endISO = new Date(new Date(visit.visitDate).getTime() + 60 * 60 * 1000).toISOString();

  return createCalendarEvent({
    summary: `🏥 ${visit.patientName} — ${visit.visitType ?? "Visit"}`,
    description: [
      `Patient: ${visit.patientName}`,
      `Phone: ${visit.patientPhone}`,
      visit.visitType ? `Type: ${visit.visitType}` : "",
      visit.chiefComplaint ? `Chief Complaint: ${visit.chiefComplaint}` : "",
      visit.location ? `Location: ${visit.location}` : "",
    ].filter(Boolean).join("\n"),
    startDateTime: startISO,
    endDateTime: endISO,
    attendeeEmail: CALENDAR_ID,
    reminderMinutes: 30,
  });
}

// ─── tRPC Router ─────────────────────────────────────────────────────────────

export const syncRouter = router({
  getSheetUrl: protectedProcedure.query(() => ({
    url: SHEET_URL,
    sheetId: SHEET_ID,
  })),

  syncPatient: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .mutation(async ({ input }) => {
      const { getPatientById } = await import("../db");
      const patient = await getPatientById(input.patientId);
      if (!patient) throw new Error("Patient not found");
      await syncPatientToSheet(patient);
      return { success: true };
    }),

  runFullSync: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "doctor" && ctx.user.role !== "admin") {
      throw new Error("Only doctors can run a full sync");
    }
    const result = await runFullDailySync();
    return { success: true, ...result, sheetUrl: SHEET_URL };
  }),

  createVisitEvent: protectedProcedure
    .input(z.object({
      patientName: z.string(),
      patientPhone: z.string(),
      visitType: z.string().optional(),
      chiefComplaint: z.string().optional(),
      visitDate: z.string(),
      location: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const eventId = await createVisitCalendarEvent({
        patientName: input.patientName,
        patientPhone: input.patientPhone,
        visitType: input.visitType,
        chiefComplaint: input.chiefComplaint,
        location: input.location,
        visitDate: new Date(input.visitDate),
      });
      return { success: !!eventId, eventId };
    }),

  createReminderEvent: protectedProcedure
    .input(z.object({
      patientName: z.string(),
      patientPhone: z.string(),
      reminderText: z.string(),
      dueDate: z.string(),
      priority: z.enum(["low", "medium", "high"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const eventId = await createReminderCalendarEvent({
        patientName: input.patientName,
        patientPhone: input.patientPhone,
        reminderText: input.reminderText,
        priority: input.priority,
        dueDate: new Date(input.dueDate),
      });
      return { success: !!eventId, eventId };
    }),
});
