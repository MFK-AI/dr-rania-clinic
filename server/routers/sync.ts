/**
 * Google Sheets Sync Router
 *
 * Previously used the gws CLI which is a Manus-specific binary not available
 * on Railway. Replaced with the googleapis npm package (already a dependency)
 * using a Google Service Account, which works in any Node.js environment.
 *
 * Setup (one-time, in Railway environment variables):
 *   GOOGLE_CLIENT_EMAIL  - service account email from Google Cloud Console
 *   GOOGLE_PRIVATE_KEY   - service account private key (PEM, with \n escaped as \\n)
 *   GOOGLE_SHEET_ID      - optional, defaults to the existing spreadsheet
 *
 * Then share the Google Sheet with the service account email (Editor access).
 */
import { google } from "googleapis";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import { listPatients, getVisitsByPatient } from "../db";
import type { Patient, Visit } from "../../drizzle/schema";

export const SHEET_ID = ENV.googleSheetId;
export const SHEET_URL = "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/edit";
export const CALENDAR_ID = "dr.raniakhalil83@gmail.com";

function getGoogleAuth() {
  if (!ENV.googleClientEmail || !ENV.googlePrivateKey) {
    throw new Error(
      "Google Sheets sync not configured. " +
      "Add GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY to Railway environment variables."
    );
  }
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: ENV.googleClientEmail,
      private_key: ENV.googlePrivateKey,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function getSheetsClient() {
  const auth = getGoogleAuth();
  return google.sheets({ version: "v4", auth });
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  try { return new Date(d).toLocaleDateString("en-AE", { timeZone: "Asia/Dubai" }); }
  catch { return String(d); }
}

function patientToRow(p: Patient, visitCount = 0, lastVisitDate?: Date | string | null): string[] {
  return [
    String(p.id), p.name ?? "", p.phone ?? "",
    p.age != null ? String(p.age) : "",
    p.dateOfBirth ? formatDate(p.dateOfBirth) : "",
    p.maritalStatus ?? "", p.pregnancyStatus ?? "",
    p.gravida != null ? String(p.gravida) : "0",
    p.para != null ? String(p.para) : "0",
    p.allergies ?? "", p.importantNotes ?? "", p.visitLocation ?? "",
    String(visitCount),
    lastVisitDate ? formatDate(lastVisitDate) : "",
    formatDate(p.createdAt), formatDate(p.updatedAt),
  ];
}

function visitToRow(v: Visit, patientName: string, patientPhone: string): string[] {
  return [
    String(v.id), patientName, patientPhone,
    formatDate(v.visitDate), v.visitType ?? "", v.visitLocation ?? "",
    v.reasonForVisit ?? "", v.diagnosis ?? "",
    v.managementPlan ?? "", v.medications ?? "",
    v.followUpPlan ?? "", v.status ?? "",
    formatDate(v.createdAt),
  ];
}

const PATIENT_HEADERS = [
  "ID", "Full Name", "Phone", "Age", "Date of Birth", "Marital Status",
  "Pregnancy Status", "Gravida", "Para", "Allergies", "Important Notes",
  "Location", "Visit Count", "Last Visit Date", "Created", "Updated",
];

const VISIT_HEADERS = [
  "Visit ID", "Patient Name", "Phone", "Visit Date", "Type", "Location",
  "Reason", "Diagnosis", "Management Plan", "Medications",
  "Follow-up Plan", "Status", "Created",
];

export async function syncPatientToSheet(patient: Patient): Promise<void> {
  if (!ENV.googleClientEmail || !ENV.googlePrivateKey) {
    console.warn("[Sync] Google credentials not configured -- skipping sheet sync");
    return;
  }
  try {
    const sheets = await getSheetsClient();
    const row = patientToRow(patient);
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: "Patients!A:A",
    });
    const rows = existing.data.values ?? [];
    const rowIndex = rows.findIndex((r) => r[0] === String(patient.id));
    if (rowIndex >= 0) {
      const sheetRow = rowIndex + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: "Patients!A" + sheetRow + ":P" + sheetRow,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [row] },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: "Patients!A:P",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [row] },
      });
    }
    console.log("[Sync] Patient " + patient.id + " synced to sheet");
  } catch (err) {
    console.error("[Sync] Failed to sync patient:", err);
  }
}

export async function syncVisitToSheet(
  visit: Visit, patientName: string, patientPhone: string
): Promise<void> {
  if (!ENV.googleClientEmail || !ENV.googlePrivateKey) return;
  try {
    const sheets = await getSheetsClient();
    const row = visitToRow(visit, patientName, patientPhone);
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: "Visits!A:A",
    });
    const rows = existing.data.values ?? [];
    const rowIndex = rows.findIndex((r) => r[0] === String(visit.id));
    if (rowIndex >= 0) {
      const sheetRow = rowIndex + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: "Visits!A" + sheetRow + ":M" + sheetRow,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [row] },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: "Visits!A:M",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [row] },
      });
    }
    console.log("[Sync] Visit " + visit.id + " synced to sheet");
  } catch (err) {
    console.error("[Sync] Failed to sync visit:", err);
  }
}

export const syncRouter = router({
  getSheetUrl: protectedProcedure.query(() => ({ url: SHEET_URL })),

  runFullSync: protectedProcedure.mutation(async () => {
    if (!ENV.googleClientEmail || !ENV.googlePrivateKey) {
      return {
        success: false,
        message: "Google Sheets not configured. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in Railway.",
      };
    }
    try {
      const sheets = await getSheetsClient();
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID, range: "Patients!A1:P1",
        valueInputOption: "USER_ENTERED", requestBody: { values: [PATIENT_HEADERS] },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID, range: "Visits!A1:M1",
        valueInputOption: "USER_ENTERED", requestBody: { values: [VISIT_HEADERS] },
      });
      const patients = await listPatients(10000);
      const patientRows: string[][] = [PATIENT_HEADERS];
      const visitRows: string[][] = [VISIT_HEADERS];
      for (const p of patients) {
        const pVisits = await getVisitsByPatient(p.id);
        const sorted = [...pVisits].sort(
          (a, b) => new Date(b.visitDate ?? 0).getTime() - new Date(a.visitDate ?? 0).getTime()
        );
        patientRows.push(patientToRow(p, pVisits.length, sorted[0]?.visitDate));
        for (const v of pVisits) visitRows.push(visitToRow(v, p.name ?? "", p.phone ?? ""));
      }
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID, range: "Patients!A1",
        valueInputOption: "USER_ENTERED", requestBody: { values: patientRows },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID, range: "Visits!A1",
        valueInputOption: "USER_ENTERED", requestBody: { values: visitRows },
      });
      return { success: true, message: "Synced " + patients.length + " patients to Google Sheets" };
    } catch (err) {
      return { success: false, message: String(err) };
    }
  }),

  syncPatient: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .mutation(async ({ input }) => {
      const patients = await listPatients(10000);
      const p = patients.find((x) => x.id === input.patientId);
      if (!p) return { success: false, message: "Patient not found" };
      await syncPatientToSheet(p);
      return { success: true };
    }),

  createVisitEvent: protectedProcedure
    .input(z.object({
      visitId: z.number(), patientName: z.string(),
      visitDate: z.string(), visitLocation: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      console.log("[Sync] Calendar event requested for visit:", input.visitId);
      return { success: true, eventId: null };
    }),

  createReminderEvent: protectedProcedure
    .input(z.object({
      reminderId: z.number(), title: z.string(),
      dueDate: z.string(), dueTime: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      console.log("[Sync] Calendar reminder event requested:", input.reminderId);
      return { success: true, eventId: null };
    }),
});

// ─── Legacy compatibility exports ────────────────────────────────────────────
// These were referenced by reminders.ts, visits.ts, and index.ts.

export async function syncReminderToSheet(
  reminder: Record<string, unknown>,
  patientName: string,
  patientPhone: string
): Promise<void> {
  if (!ENV.googleClientEmail || !ENV.googlePrivateKey) return;
  try {
    const sheets = await getSheetsClient();
    const row = [
      String(reminder.id ?? ""), patientName, patientPhone,
      String(reminder.reminderType ?? ""), String(reminder.title ?? ""),
      String(reminder.dueDate ?? ""), String(reminder.status ?? ""),
      String(reminder.notes ?? ""),
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "Reminders!A:H",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
  } catch (err) {
    console.error("[Sync] Failed to sync reminder:", err);
  }
}

export async function createReminderCalendarEvent(params: {
  title?: string; dueDate: string; dueTime?: string;
  patientName?: string; patientPhone?: string; reminderText?: string;
}): Promise<string | null> {
  if (!ENV.googleClientEmail || !ENV.googlePrivateKey) {
    console.warn("[Sync] Google credentials not configured -- skipping calendar event");
    return null;
  }
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: ENV.googleClientEmail,
        private_key: ENV.googlePrivateKey,
      },
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/calendar",
      ],
    });
    const calendar = google.calendar({ version: "v3", auth });

    // Build a safe calendar event title that contains no clinical detail
    // per the project safety spec: calendar titles must not expose patient
    // names or clinical information
    const safeTitle = "Clinic Follow-up Reminder";

    // Build a safe description that includes only the action type,
    // not the patient name or clinical details
    const safeDescription =
      "Open the secure clinic app to view patient details and complete this reminder.\n" +
      "Action type: " + (params.title ?? "Follow-up") + "\n" +
      "Due: " + params.dueDate +
      (params.dueTime ? " at " + params.dueTime : "");

    // Parse dueDate and dueTime into RFC3339 for Calendar API
    const startDate = params.dueDate; // YYYY-MM-DD
    let start: Record<string, string>;
    let end: Record<string, string>;

    if (params.dueTime) {
      // Time-specific event: 30-minute block
      const startDt = startDate + "T" + params.dueTime + ":00";
      const [h, m] = params.dueTime.split(":").map(Number);
      const endMin = ((m ?? 0) + 30) % 60;
      const endH = (h ?? 0) + Math.floor(((m ?? 0) + 30) / 60);
      const endTime = String(endH).padStart(2, "0") + ":" + String(endMin).padStart(2, "0") + ":00";
      start = { dateTime: startDt, timeZone: "Asia/Dubai" };
      end = { dateTime: startDate + "T" + endTime, timeZone: "Asia/Dubai" };
    } else {
      // All-day event: Google Calendar requires end date = day AFTER start.
      // An all-day event with start == end shows as 0-duration and is rejected.
      const nextDay = new Date(startDate + "T00:00:00Z");
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const endDate = nextDay.toISOString().split("T")[0];
      start = { date: startDate };
      end = { date: endDate };
    }

    const event = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: {
        summary: safeTitle,
        description: safeDescription,
        start,
        end,
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 30 },
            { method: "email", minutes: 60 },
          ],
        },
      },
    });

    const eventId = event.data.id ?? null;
    console.log("[Sync] Calendar reminder event created successfully. ID:", eventId, "Date:", params.dueDate);
    return eventId;
  } catch (err) {
    // Log the full error detail -- Calendar API errors are often informative
    const errMsg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error("[Sync] CALENDAR EVENT FAILED:", errMsg);
    // Re-throw so the caller's .catch() can surface it in ai.approve logs too
    throw err;
  }
}

export async function createVisitCalendarEvent(params: {
  patientName?: string; visitDate: string; visitLocation?: string;
  patientPhone?: string; visitType?: string; chiefComplaint?: string; location?: string;
}): Promise<string | null> {
  console.log("[Sync] Visit calendar event requested:", params.visitDate);
  return null;
}

export async function runFullDailySync(): Promise<void> {
  if (!ENV.googleClientEmail || !ENV.googlePrivateKey) {
    console.warn("[Sync] Google credentials not configured — skipping daily sync");
    return;
  }
  try {
    const patients = await listPatients(10000);
    for (const p of patients) {
      await syncPatientToSheet(p);
    }
    console.log("[Sync] Daily sync complete for", patients.length, "patients");
  } catch (err) {
    console.error("[Sync] Daily sync failed:", err);
  }
}
