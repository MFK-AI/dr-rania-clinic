/**
 * Auto-migration: runs on server startup to create all tables if they don't exist.
 * Uses IF NOT EXISTS so it is safe to run on every boot.
 */
import { getDb } from "./db";
import { sql } from "drizzle-orm";

export async function runMigrations() {
  console.log("[migrate] Running auto-migrations...");
  const db = await getDb();
  if (!db) {
    console.warn("[migrate] No database connection — skipping migrations");
    return;
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`openId\` varchar(64) NOT NULL,
        \`name\` text,
        \`email\` varchar(320),
        \`passwordHash\` varchar(255),
        \`loginMethod\` varchar(64),
        \`role\` enum('doctor','assistant','admin') NOT NULL DEFAULT 'assistant',
        \`telegramChatId\` varchar(64),
        \`isActive\` boolean NOT NULL DEFAULT true,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        \`lastSignedIn\` timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`users_id\` PRIMARY KEY(\`id\`),
        CONSTRAINT \`users_openId_unique\` UNIQUE(\`openId\`)
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`patients\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`phone\` varchar(32) NOT NULL,
        \`age\` int,
        \`dateOfBirth\` varchar(20),
        \`maritalStatus\` enum('single','married','divorced','widowed'),
        \`visitLocation\` enum('Prime Hospital','Mazher Center'),
        \`pregnancyStatus\` varchar(100),
        \`gravida\` int,
        \`para\` int,
        \`allergies\` text,
        \`importantNotes\` text,
        \`isDeleted\` boolean NOT NULL DEFAULT false,
        \`deletedAt\` timestamp,
        \`deletedBy\` int,
        \`createdBy\` int NOT NULL,
        \`updatedBy\` int,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`patients_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`patient_history\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`patientId\` int NOT NULL,
        \`changedBy\` int NOT NULL,
        \`changedAt\` timestamp NOT NULL DEFAULT (now()),
        \`fieldName\` varchar(100) NOT NULL,
        \`oldValue\` text,
        \`newValue\` text,
        CONSTRAINT \`patient_history_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`visits\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`patientId\` int NOT NULL,
        \`visitDate\` varchar(20) NOT NULL,
        \`visitLocation\` enum('Prime Hospital','Mazher Center') NOT NULL,
        \`visitType\` varchar(100),
        \`reasonForVisit\` text,
        \`diagnosis\` text,
        \`examination\` text,
        \`ultrasoundFindings\` text,
        \`labsImaging\` text,
        \`pendingResults\` text,
        \`managementPlan\` text,
        \`medications\` text,
        \`advice\` text,
        \`followUpPlan\` text,
        \`status\` enum('draft','ai_pending','ai_review','final') NOT NULL DEFAULT 'draft',
        \`aiExtractionId\` int,
        \`isDeleted\` boolean NOT NULL DEFAULT false,
        \`deletedAt\` timestamp,
        \`deletedBy\` int,
        \`createdBy\` int NOT NULL,
        \`updatedBy\` int,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`visits_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`visit_history\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`visitId\` int NOT NULL,
        \`changedBy\` int NOT NULL,
        \`changedAt\` timestamp NOT NULL DEFAULT (now()),
        \`snapshot\` json NOT NULL,
        CONSTRAINT \`visit_history_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`ai_extractions\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`visitId\` int,
        \`patientId\` int,
        \`sourceType\` enum('voice','screenshot','document','text') NOT NULL,
        \`sourceFileKey\` varchar(512),
        \`transcript\` text,
        \`extractedData\` json,
        \`extractionStatus\` enum('Clear','Needs review','Unclear') DEFAULT 'Needs review',
        \`riskFlags\` json,
        \`unclearWords\` json,
        \`missingDocItems\` json,
        \`approvedBy\` int,
        \`approvedAt\` timestamp,
        \`createdBy\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`ai_extractions_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`attachments\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`patientId\` int,
        \`visitId\` int,
        \`aiExtractionId\` int,
        \`fileName\` varchar(255) NOT NULL,
        \`fileKey\` varchar(512) NOT NULL,
        \`fileUrl\` varchar(1024) NOT NULL,
        \`mimeType\` varchar(128) NOT NULL,
        \`fileSize\` int NOT NULL,
        \`uploadedBy\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`attachments_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`reminders\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`patientId\` int NOT NULL,
        \`visitId\` int,
        \`reminderType\` enum('call_patient','inform_result','check_lab','check_imaging','follow_up','medication_review','procedure_booking','custom') NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`notes\` text,
        \`dueDate\` varchar(20) NOT NULL,
        \`dueTime\` varchar(10),
        \`status\` enum('pending','done','cancelled','postponed','overdue') NOT NULL DEFAULT 'pending',
        \`isRepeating\` boolean NOT NULL DEFAULT false,
        \`requiresDoctorReview\` boolean NOT NULL DEFAULT false,
        \`calendarEventId\` varchar(255),
        \`completedBy\` int,
        \`completedAt\` timestamp,
        \`completionNote\` text,
        \`postponedTo\` varchar(20),
        \`sourceText\` text,
        \`createdBy\` int NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`reminders_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`exports\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`exportType\` enum('excel','pdf') NOT NULL DEFAULT 'excel',
        \`fileKey\` varchar(512),
        \`fileUrl\` varchar(1024),
        \`generatedBy\` int NOT NULL,
        \`patientCount\` int DEFAULT 0,
        \`visitCount\` int DEFAULT 0,
        \`status\` enum('pending','completed','failed') NOT NULL DEFAULT 'pending',
        \`errorMessage\` text,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`exports_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`audit_events\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`userId\` int NOT NULL,
        \`action\` varchar(64) NOT NULL,
        \`entityType\` varchar(64),
        \`entityId\` int,
        \`metadata\` json,
        \`ipAddress\` varchar(64),
        \`userAgent\` text,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`audit_events_id\` PRIMARY KEY(\`id\`)
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`telegram_alerts\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`alertType\` enum('instant','daily_summary') NOT NULL,
        \`message\` text NOT NULL,
        \`sentAt\` timestamp NOT NULL DEFAULT (now()),
        \`success\` boolean NOT NULL DEFAULT false,
        \`errorMessage\` text,
        CONSTRAINT \`telegram_alerts_id\` PRIMARY KEY(\`id\`)
      )
    `);

    // Seed Dr. Rania's account if it doesn't exist
    const existing = await db.execute(sql`SELECT id FROM \`users\` WHERE openId = 'local_dr_rania_001' LIMIT 1`);
    const rows = (existing as unknown as { rows?: unknown[] }).rows ?? (existing as unknown as unknown[]);
    if (rows.length === 0) {
      // bcrypt hash of 'DrRania2026!' with 12 rounds
      const hash = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniYwNL5B7n5X3HQ8W2Kj8VZWK";
      await db.execute(sql`
        INSERT INTO \`users\` (openId, name, email, passwordHash, loginMethod, role, isActive, createdAt, updatedAt, lastSignedIn)
        VALUES ('local_dr_rania_001', 'Dr. Rania Khalil', 'dr.raniakhalil83@gmail.com', ${hash}, 'password', 'doctor', true, NOW(), NOW(), NOW())
      `);
      console.log("[migrate] Seeded Dr. Rania Khalil admin account");
    }

    console.log("[migrate] Auto-migrations complete.");
  } catch (err) {
    console.error("[migrate] Migration error:", err);
    throw err;
  }
}
