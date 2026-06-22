import {
  boolean,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["doctor", "assistant", "admin"]).default("assistant").notNull(),
  telegramChatId: varchar("telegramChatId", { length: 64 }),
  isActive: boolean("isActive").default(true).notNull(),
  // Doctor / staff profile fields
  title: varchar("title", { length: 32 }),            // Dr., Prof., etc.
  specialty: varchar("specialty", { length: 128 }),
  dateOfBirth: varchar("dateOfBirth", { length: 20 }),
  address: text("address"),
  country: varchar("country", { length: 64 }),
  emirate: varchar("emirate", { length: 64 }),
  mobileNumber: varchar("mobileNumber", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Patients ─────────────────────────────────────────────────────────────────
export const patients = mysqlTable("patients", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  age: int("age"),
  dateOfBirth: varchar("dateOfBirth", { length: 20 }),
  maritalStatus: mysqlEnum("maritalStatus", ["single", "married", "divorced", "widowed"]),
  visitLocation: mysqlEnum("visitLocation", ["Prime Hospital", "Mazher Center"]),
  pregnancyStatus: varchar("pregnancyStatus", { length: 100 }),
  gravida: int("gravida"),
  para: int("para"),
  allergies: text("allergies"),
  importantNotes: text("importantNotes"),
  isDeleted: boolean("isDeleted").default(false).notNull(),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  createdBy: int("createdBy").notNull(),
  updatedBy: int("updatedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;

// ─── Patient Edit History ─────────────────────────────────────────────────────
export const patientHistory = mysqlTable("patient_history", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  changedBy: int("changedBy").notNull(),
  changedAt: timestamp("changedAt").defaultNow().notNull(),
  fieldName: varchar("fieldName", { length: 100 }).notNull(),
  oldValue: text("oldValue"),
  newValue: text("newValue"),
});

export type PatientHistory = typeof patientHistory.$inferSelect;

// ─── Visits ───────────────────────────────────────────────────────────────────
export const visits = mysqlTable("visits", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  visitDate: varchar("visitDate", { length: 20 }).notNull(),
  visitLocation: mysqlEnum("visitLocation", ["Prime Hospital", "Mazher Center"]).notNull(),
  visitType: varchar("visitType", { length: 100 }),
  reasonForVisit: text("reasonForVisit"),
  diagnosis: text("diagnosis"),
  examination: text("examination"),
  ultrasoundFindings: text("ultrasoundFindings"),
  labsImaging: text("labsImaging"),
  pendingResults: text("pendingResults"),
  managementPlan: text("managementPlan"),
  medications: text("medications"),
  advice: text("advice"),
  followUpPlan: text("followUpPlan"),
  status: mysqlEnum("status", ["draft", "ai_pending", "ai_review", "final"]).default("draft").notNull(),
  aiExtractionId: int("aiExtractionId"),
  isDeleted: boolean("isDeleted").default(false).notNull(),
  deletedAt: timestamp("deletedAt"),
  deletedBy: int("deletedBy"),
  createdBy: int("createdBy").notNull(),
  updatedBy: int("updatedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Visit = typeof visits.$inferSelect;
export type InsertVisit = typeof visits.$inferInsert;

// ─── Visit Edit History ───────────────────────────────────────────────────────
export const visitHistory = mysqlTable("visit_history", {
  id: int("id").autoincrement().primaryKey(),
  visitId: int("visitId").notNull(),
  changedBy: int("changedBy").notNull(),
  changedAt: timestamp("changedAt").defaultNow().notNull(),
  snapshot: json("snapshot").notNull(),
});

export type VisitHistory = typeof visitHistory.$inferSelect;

// ─── AI Extractions ───────────────────────────────────────────────────────────
export const aiExtractions = mysqlTable("ai_extractions", {
  id: int("id").autoincrement().primaryKey(),
  visitId: int("visitId"),
  patientId: int("patientId"),
  sourceType: mysqlEnum("sourceType", ["voice", "screenshot", "document", "text"]).notNull(),
  sourceFileKey: varchar("sourceFileKey", { length: 512 }),
  transcript: text("transcript"),
  extractedData: json("extractedData"),
  extractionStatus: mysqlEnum("extractionStatus", ["Clear", "Needs review", "Unclear"]).default("Needs review"),
  riskFlags: json("riskFlags"),
  unclearWords: json("unclearWords"),
  missingDocItems: json("missingDocItems"),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AiExtraction = typeof aiExtractions.$inferSelect;
export type InsertAiExtraction = typeof aiExtractions.$inferInsert;

// ─── Attachments ──────────────────────────────────────────────────────────────
export const attachments = mysqlTable("attachments", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId"),
  visitId: int("visitId"),
  aiExtractionId: int("aiExtractionId"),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 1024 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  fileSize: int("fileSize").notNull(),
  uploadedBy: int("uploadedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = typeof attachments.$inferInsert;

// ─── Reminders ────────────────────────────────────────────────────────────────
export const reminders = mysqlTable("reminders", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  visitId: int("visitId"),
  reminderType: mysqlEnum("reminderType", [
    "call_patient",
    "inform_result",
    "check_lab",
    "check_imaging",
    "follow_up",
    "medication_review",
    "procedure_booking",
    "custom",
  ]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  notes: text("notes"),
  dueDate: varchar("dueDate", { length: 20 }).notNull(),
  dueTime: varchar("dueTime", { length: 10 }),
  status: mysqlEnum("status", ["pending", "done", "cancelled", "postponed", "overdue"]).default("pending").notNull(),
  isRepeating: boolean("isRepeating").default(false).notNull(),
  requiresDoctorReview: boolean("requiresDoctorReview").default(false).notNull(),
  calendarEventId: varchar("calendarEventId", { length: 255 }),
  completedBy: int("completedBy"),
  completedAt: timestamp("completedAt"),
  completionNote: text("completionNote"),
  postponedTo: varchar("postponedTo", { length: 20 }),
  sourceText: text("sourceText"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Reminder = typeof reminders.$inferSelect;
export type InsertReminder = typeof reminders.$inferInsert;

// ─── Exports ──────────────────────────────────────────────────────────────────
export const exports = mysqlTable("exports", {
  id: int("id").autoincrement().primaryKey(),
  exportType: mysqlEnum("exportType", ["excel", "pdf"]).default("excel").notNull(),
  fileKey: varchar("fileKey", { length: 512 }),
  fileUrl: varchar("fileUrl", { length: 1024 }),
  generatedBy: int("generatedBy").notNull(),
  patientCount: int("patientCount").default(0),
  visitCount: int("visitCount").default(0),
  status: mysqlEnum("status", ["pending", "completed", "failed"]).default("pending").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Export = typeof exports.$inferSelect;
export type InsertExport = typeof exports.$inferInsert;

// ─── Audit Events ─────────────────────────────────────────────────────────────
export const auditEvents = mysqlTable("audit_events", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  entityType: varchar("entityType", { length: 64 }),
  entityId: int("entityId"),
  metadata: json("metadata"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = typeof auditEvents.$inferInsert;

// ─── Telegram Alerts ──────────────────────────────────────────────────────────
export const telegramAlerts = mysqlTable("telegram_alerts", {
  id: int("id").autoincrement().primaryKey(),
  alertType: mysqlEnum("alertType", ["instant", "daily_summary"]).notNull(),
  message: text("message").notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  success: boolean("success").default(false).notNull(),
  errorMessage: text("errorMessage"),
});

export type TelegramAlert = typeof telegramAlerts.$inferSelect;
