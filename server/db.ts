import { and, desc, eq, gte, isNull, like, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2";
import {
  AiExtraction,
  Attachment,
  AuditEvent,
  Export,
  InsertAiExtraction,
  InsertAttachment,
  InsertAuditEvent,
  InsertExport,
  InsertPatient,
  InsertReminder,
  InsertUser,
  InsertVisit,
  Patient,
  Reminder,
  User,
  Visit,
  aiExtractions,
  attachments,
  auditEvents,
  exports,
  patientHistory,
  patients,
  reminders,
  telegramAlerts,
  users,
  visitHistory,
  visits,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = createPool({
        uri: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        waitForConnections: true,
        connectionLimit: 10,
        connectTimeout: 30000,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _db = drizzle(pool.promise()) as any;
      console.log("[Database] Pool created successfully");
    } catch (error) {
      console.error("[Database] Failed to create pool:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value !== undefined) {
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    }
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }

  // Owner always gets doctor role
  if (user.openId === ENV.ownerOpenId) {
    values.role = "doctor";
    updateSet.role = "doctor";
  } else if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getAllUsers(): Promise<User[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).where(eq(users.isActive, true));
}

export async function updateUserRole(userId: number, role: "doctor" | "assistant" | "admin"): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function updateUserTelegram(userId: number, telegramChatId: string | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ telegramChatId }).where(eq(users.id, userId));
}

// ─── Patients ─────────────────────────────────────────────────────────────────

export async function createPatient(data: InsertPatient): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(patients).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function getPatientById(id: number): Promise<Patient | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(patients)
    .where(and(eq(patients.id, id), eq(patients.isDeleted, false)))
    .limit(1);
  return result[0];
}

export async function getPatientByPhone(phone: string): Promise<Patient | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(patients)
    .where(and(eq(patients.phone, phone), eq(patients.isDeleted, false)))
    .limit(1);
  return result[0];
}

export async function searchPatients(query: string, limit = 20): Promise<Patient[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(patients)
    .where(
      and(
        eq(patients.isDeleted, false),
        or(like(patients.name, `%${query}%`), like(patients.phone, `%${query}%`))
      )
    )
    .orderBy(desc(patients.updatedAt))
    .limit(limit);
}

export async function listPatients(limit = 50, offset = 0): Promise<Patient[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(patients)
    .where(eq(patients.isDeleted, false))
    .orderBy(desc(patients.updatedAt))
    .limit(limit)
    .offset(offset);
}

export async function updatePatient(
  id: number,
  data: Partial<InsertPatient>,
  updatedBy: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const current = await getPatientById(id);
  if (!current) return;

  // Record history for changed fields
  const historyEntries = [];
  for (const [key, newVal] of Object.entries(data)) {
    const oldVal = (current as Record<string, unknown>)[key];
    if (oldVal !== newVal) {
      historyEntries.push({
        patientId: id,
        changedBy: updatedBy,
        fieldName: key,
        oldValue: oldVal != null ? String(oldVal) : null,
        newValue: newVal != null ? String(newVal) : null,
      });
    }
  }
  if (historyEntries.length > 0) {
    await db.insert(patientHistory).values(historyEntries);
  }
  await db.update(patients).set({ ...data, updatedBy }).where(eq(patients.id, id));
}

export async function softDeletePatient(id: number, deletedBy: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(patients)
    .set({ isDeleted: true, deletedAt: new Date(), deletedBy })
    .where(eq(patients.id, id));
}

export async function getPatientHistory(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(patientHistory)
    .where(eq(patientHistory.patientId, patientId))
    .orderBy(desc(patientHistory.changedAt));
}

// ─── Visits ───────────────────────────────────────────────────────────────────

export async function createVisit(data: InsertVisit): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(visits).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function getVisitById(id: number): Promise<Visit | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(visits)
    .where(and(eq(visits.id, id), eq(visits.isDeleted, false)))
    .limit(1);
  return result[0];
}

export async function getVisitsByPatient(patientId: number): Promise<Visit[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(visits)
    .where(and(eq(visits.patientId, patientId), eq(visits.isDeleted, false)))
    .orderBy(desc(visits.visitDate));
}

export async function getTodaysVisits(): Promise<Visit[]> {
  const db = await getDb();
  if (!db) return [];
  const today = new Date().toISOString().split("T")[0];
  return db
    .select()
    .from(visits)
    .where(and(eq(visits.visitDate, today!), eq(visits.isDeleted, false)))
    .orderBy(desc(visits.createdAt));
}

export async function getVisitsThisWeek(): Promise<Visit[]> {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekAgoStr = weekAgo.toISOString().split("T")[0];
  const todayStr = now.toISOString().split("T")[0];
  return db
    .select()
    .from(visits)
    .where(
      and(
        eq(visits.isDeleted, false),
        gte(visits.visitDate, weekAgoStr!),
        lte(visits.visitDate, todayStr!)
      )
    );
}

export async function updateVisit(
  id: number,
  data: Partial<InsertVisit>,
  updatedBy: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const current = await getVisitById(id);
  if (!current) return;
  // Save snapshot before update
  await db.insert(visitHistory).values({
    visitId: id,
    changedBy: updatedBy,
    snapshot: current as unknown as Record<string, unknown>,
  });
  await db.update(visits).set({ ...data, updatedBy }).where(eq(visits.id, id));
}

export async function softDeleteVisit(id: number, deletedBy: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(visits)
    .set({ isDeleted: true, deletedAt: new Date(), deletedBy })
    .where(eq(visits.id, id));
}

export async function getPendingAiReviews(): Promise<Visit[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(visits)
    .where(and(eq(visits.status, "ai_review"), eq(visits.isDeleted, false)))
    .orderBy(desc(visits.updatedAt));
}

// ─── AI Extractions ───────────────────────────────────────────────────────────

export async function createAiExtraction(data: InsertAiExtraction): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(aiExtractions).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function getAiExtractionById(id: number): Promise<AiExtraction | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(aiExtractions).where(eq(aiExtractions.id, id)).limit(1);
  return result[0];
}

export async function approveAiExtraction(id: number, approvedBy: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(aiExtractions)
    .set({ approvedBy, approvedAt: new Date() })
    .where(eq(aiExtractions.id, id));
}

export async function getPendingExtractions(): Promise<AiExtraction[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(aiExtractions)
    .where(isNull(aiExtractions.approvedAt))
    .orderBy(desc(aiExtractions.createdAt));
}

// ─── Attachments ──────────────────────────────────────────────────────────────

export async function createAttachment(data: InsertAttachment): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(attachments).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function getAttachmentsByPatient(patientId: number): Promise<Attachment[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(attachments)
    .where(eq(attachments.patientId, patientId))
    .orderBy(desc(attachments.createdAt));
}

export async function getAttachmentsByVisit(visitId: number): Promise<Attachment[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(attachments)
    .where(eq(attachments.visitId, visitId))
    .orderBy(desc(attachments.createdAt));
}

// ─── Reminders ────────────────────────────────────────────────────────────────

export async function createReminder(data: InsertReminder): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(reminders).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function getReminderById(id: number): Promise<Reminder | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(reminders).where(eq(reminders.id, id)).limit(1);
  return result[0];
}

export async function getRemindersByPatient(patientId: number): Promise<Reminder[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(reminders)
    .where(eq(reminders.patientId, patientId))
    .orderBy(desc(reminders.dueDate));
}

export async function getTodaysReminders(): Promise<Reminder[]> {
  const db = await getDb();
  if (!db) return [];
  const today = new Date().toISOString().split("T")[0];
  return db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.dueDate, today!),
        or(eq(reminders.status, "pending"), eq(reminders.status, "overdue"))
      )
    )
    .orderBy(reminders.dueTime);
}

export async function getOverdueReminders(): Promise<Reminder[]> {
  const db = await getDb();
  if (!db) return [];
  const today = new Date().toISOString().split("T")[0];
  return db
    .select()
    .from(reminders)
    .where(
      and(
        lte(reminders.dueDate, today!),
        or(eq(reminders.status, "pending"), eq(reminders.status, "overdue"))
      )
    )
    .orderBy(reminders.dueDate);
}

export async function updateReminderStatus(
  id: number,
  status: "pending" | "done" | "cancelled" | "postponed" | "overdue",
  completedBy?: number,
  completionNote?: string,
  postponedTo?: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const updateData: Partial<Reminder> = { status };
  if (status === "done" && completedBy) {
    updateData.completedBy = completedBy;
    updateData.completedAt = new Date();
    updateData.completionNote = completionNote ?? null;
  }
  if (status === "postponed" && postponedTo) {
    updateData.postponedTo = postponedTo;
    updateData.dueDate = postponedTo;
  }
  await db.update(reminders).set(updateData).where(eq(reminders.id, id));
}

export async function markOverdueReminders(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const today = new Date().toISOString().split("T")[0];
  await db
    .update(reminders)
    .set({ status: "overdue" })
    .where(and(lte(reminders.dueDate, today!), eq(reminders.status, "pending")));
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export async function createExportRecord(data: InsertExport): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(exports).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function updateExportRecord(
  id: number,
  data: Partial<Export>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(exports).set(data).where(eq(exports.id, id));
}

export async function listExports(limit = 20): Promise<Export[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(exports).orderBy(desc(exports.createdAt)).limit(limit);
}

// ─── Audit Events ─────────────────────────────────────────────────────────────

export async function logAuditEvent(data: InsertAuditEvent): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(auditEvents).values(data);
  } catch (err) {
    // Audit log failures must never break the main flow
    console.error("[Audit] Failed to log event:", err);
  }
}

export async function listAuditEvents(limit = 100, offset = 0): Promise<AuditEvent[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit)
    .offset(offset);
}

// ─── Telegram Alerts ──────────────────────────────────────────────────────────

export async function logTelegramAlert(
  alertType: "instant" | "daily_summary",
  message: string,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(telegramAlerts).values({ alertType, message, success, errorMessage });
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return null;

  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [
    todayVisitsResult,
    weekVisitsResult,
    newPatientsWeekResult,
    pendingRemindersResult,
    overdueRemindersResult,
    pendingAiResult,
    exportsResult,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(visits)
      .where(and(eq(visits.visitDate, today!), eq(visits.isDeleted, false))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(visits)
      .where(
        and(
          eq(visits.isDeleted, false),
          gte(visits.visitDate, weekAgo!),
          lte(visits.visitDate, today!)
        )
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(patients)
      .where(and(eq(patients.isDeleted, false), gte(patients.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(reminders)
      .where(eq(reminders.status, "pending")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(reminders)
      .where(eq(reminders.status, "overdue")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(visits)
      .where(and(eq(visits.status, "ai_review"), eq(visits.isDeleted, false))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(exports)
      .where(eq(exports.status, "completed")),
  ]);

  return {
    todayVisits: Number(todayVisitsResult[0]?.count ?? 0),
    visitsThisWeek: Number(weekVisitsResult[0]?.count ?? 0),
    newPatientsThisWeek: Number(newPatientsWeekResult[0]?.count ?? 0),
    pendingReminders: Number(pendingRemindersResult[0]?.count ?? 0),
    overdueReminders: Number(overdueRemindersResult[0]?.count ?? 0),
    pendingAiReviews: Number(pendingAiResult[0]?.count ?? 0),
    exportsGenerated: Number(exportsResult[0]?.count ?? 0),
  };
}

export async function updateAiExtractionPatient(id: number, patientId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(aiExtractions).set({ patientId }).where(eq(aiExtractions.id, id));
}

export async function updateUserTelegramById(userId: number, telegramChatId: string | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ telegramChatId }).where(eq(users.id, userId));
}
