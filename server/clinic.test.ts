/**
 * Dr. Rania Patient Intelligence Assistant — Comprehensive Test Suite
 * Covers: Auth, Patients, Visits, Reminders, AI, Files, Admin, Exports, Telegram
 */
import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// ─── Mock database module ──────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
  // Patient mocks
  createPatient: vi.fn().mockResolvedValue(1),
  updatePatient: vi.fn().mockResolvedValue(undefined),
  softDeletePatient: vi.fn().mockResolvedValue(undefined),
  getPatientById: vi.fn().mockResolvedValue({
    id: 1, name: "Fatima Al-Rashid", phone: "0501234567",
    visitLocation: "Prime Hospital", isDeleted: false,
    createdAt: new Date(), updatedAt: new Date(),
  }),
  getPatientByPhone: vi.fn().mockResolvedValue(undefined),
  getPatientHistory: vi.fn().mockResolvedValue({ patient: null, visits: [], reminders: [], attachments: [] }),
  listPatients: vi.fn().mockResolvedValue([
    { id: 1, name: "Fatima Al-Rashid", phone: "0501234567", visitLocation: "Prime Hospital", isDeleted: false, createdAt: new Date(), updatedAt: new Date() },
  ]),
  searchPatients: vi.fn().mockResolvedValue([]),
  // Visit mocks
  createVisit: vi.fn().mockResolvedValue(1),
  updateVisit: vi.fn().mockResolvedValue(undefined),
  softDeleteVisit: vi.fn().mockResolvedValue(undefined),
  getVisitById: vi.fn().mockResolvedValue({
    id: 1, patientId: 1, visitDate: "2025-01-15",
    visitLocation: "Prime Hospital", status: "draft",
    isDeleted: false, createdAt: new Date(), updatedAt: new Date(),
  }),
  getVisitsByPatient: vi.fn().mockResolvedValue([]),
  getTodaysVisits: vi.fn().mockResolvedValue([]),
  getVisitsThisWeek: vi.fn().mockResolvedValue([]),
  getPendingAiReviews: vi.fn().mockResolvedValue([]),
  // Reminder mocks
  createReminder: vi.fn().mockResolvedValue(1),
  updateReminderStatus: vi.fn().mockResolvedValue(undefined),
  getReminderById: vi.fn().mockResolvedValue({
    id: 1, patientId: 1, status: "pending", title: "Follow-up",
    dueDate: "2025-02-01", reminderType: "follow_up",
    createdAt: new Date(), updatedAt: new Date(),
  }),
  getRemindersByPatient: vi.fn().mockResolvedValue([]),
  getTodaysReminders: vi.fn().mockResolvedValue([]),
  getOverdueReminders: vi.fn().mockResolvedValue([]),
  markOverdueReminders: vi.fn().mockResolvedValue(undefined),
  // AI mocks
  createAiExtraction: vi.fn().mockResolvedValue(1),
  getAiExtractionById: vi.fn().mockResolvedValue(null),
  approveAiExtraction: vi.fn().mockResolvedValue(undefined),
  getPendingExtractions: vi.fn().mockResolvedValue([]),
  // File mocks
  createAttachment: vi.fn().mockResolvedValue(1),
  getAttachmentsByPatient: vi.fn().mockResolvedValue([]),
  getAttachmentsByVisit: vi.fn().mockResolvedValue([]),
  // Admin mocks
  getAllUsers: vi.fn().mockResolvedValue([]),
  updateUserRole: vi.fn().mockResolvedValue(undefined),
  updateUserTelegram: vi.fn().mockResolvedValue(undefined),
  getDashboardStats: vi.fn().mockResolvedValue({
    todayVisits: 3, totalPatients: 42, pendingReminders: 5,
    overdueReminders: 1, pendingAiReviews: 2, newPatientsThisMonth: 8,
    exportsGenerated: 1,
  }),
  listAuditEvents: vi.fn().mockResolvedValue([]),
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
  // Export mocks
  createExportRecord: vi.fn().mockResolvedValue(1),
  updateExportRecord: vi.fn().mockResolvedValue(undefined),
  listExports: vi.fn().mockResolvedValue([]),
  listPatientsByLocation: vi.fn().mockResolvedValue([]),
  // Telegram mocks
  logTelegramAlert: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock storage module ───────────────────────────────────────────────────────
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "test/file.pdf", url: "/manus-storage/test/file.pdf" }),
  storageGet: vi.fn().mockResolvedValue({ key: "test/file.pdf", url: "/manus-storage/test/file.pdf" }),
}));

// ─── Mock LLM / voice modules ─────────────────────────────────────────────────
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          patient_name: "Fatima Al-Rashid",
          diagnosis: "Gestational hypertension",
          management_plan: "Monitor BP daily, low-sodium diet",
          medications: "Methyldopa 250mg twice daily",
          follow_up_plan: "Return in 2 weeks",
          reminders: [],
          unclear_words_or_phrases: [],
          missing_documentation_items: [],
          risk_flags: [],
          extraction_status: "Clear",
        }),
      },
    }],
  }),
}));

vi.mock("./_core/voiceTranscription", () => ({
  transcribeAudio: vi.fn().mockResolvedValue({
    text: "Patient has gestational hypertension, started on methyldopa.",
  }),
}));

// ─── Context Helpers ──────────────────────────────────────────────────────────
type CookieCall = { name: string; options: Record<string, unknown> };

function createContext(role: "admin" | "doctor" | "assistant" | "user" = "doctor"): {
  ctx: TrpcContext;
  clearedCookies: CookieCall[];
} {
  const clearedCookies: CookieCall[] = [];
  const ctx: TrpcContext = {
    user: {
      id: 1,
      openId: "test-user-openid",
      email: "doctor@clinic.com",
      name: "Dr. Rania",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Auth Tests ───────────────────────────────────────────────────────────────
describe("auth", () => {
  it("auth.me returns null for unauthenticated user", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("auth.me returns user for authenticated user", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Dr. Rania");
    expect(result?.role).toBe("doctor");
  });

  it("auth.logout clears session cookie and returns success", async () => {
    const { ctx, clearedCookies } = createContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({ maxAge: -1, httpOnly: true });
  });
});

// ─── Patient Tests ────────────────────────────────────────────────────────────
describe("patients", () => {
  it("patients.list returns patient array for doctor", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.patients.list({ limit: 20, offset: 0 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("patients.list is blocked for unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.patients.list({ limit: 20, offset: 0 })).rejects.toThrow();
  });

  it("patients.getById returns patient object", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.patients.getById({ id: 1 });
    expect(result.id).toBe(1);
    expect(result.name).toBe("Fatima Al-Rashid");
  });

  it("patients.create succeeds for doctor role", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.patients.create({
      name: "Sara Al-Mutairi",
      phone: "0509876543",
      visitLocation: "Prime Hospital",
    });
    expect(result.id).toBe(1);
  });

  it("patients.create is blocked for user role", async () => {
    const { ctx } = createContext("user");
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.patients.create({ name: "Test", phone: "0500000000", visitLocation: "Prime Hospital" })
    ).rejects.toThrow();
  });

  it("patients.update succeeds for doctor role", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.patients.update({
      id: 1,
      data: { name: "Fatima Al-Rashid Updated" },
    });
    expect(result.success).toBe(true);
  });
});

// ─── Visit Tests ──────────────────────────────────────────────────────────────
describe("visits", () => {
  it("visits.getById returns visit with attachments", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.visits.getById({ id: 1 });
    expect(result.visit.id).toBe(1);
    expect(Array.isArray(result.attachments)).toBe(true);
  });

  it("visits.create succeeds for doctor role", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.visits.create({
      patientId: 1,
      visitDate: "2025-01-15",
      visitLocation: "Prime Hospital",
    });
    expect(result.id).toBe(1);
  });

  it("visits.create is blocked for user role", async () => {
    const { ctx } = createContext("user");
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.visits.create({ patientId: 1, visitDate: "2025-01-15", visitLocation: "Prime Hospital" })
    ).rejects.toThrow();
  });

  it("visits.finalize changes status to final", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.visits.finalize({ id: 1 });
    expect(result.success).toBe(true);
  });

  it("visits.getPendingAiReviews returns array", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.visits.getPendingAiReviews();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Reminder Tests ───────────────────────────────────────────────────────────
describe("reminders", () => {
  it("reminders.listAll returns array for doctor", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.reminders.listAll({ limit: 50 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("reminders.create succeeds with valid input", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.reminders.create({
      patientId: 1,
      reminderType: "follow_up",
      title: "Follow-up appointment",
      dueDate: "2025-02-01",
    });
    expect(result.id).toBe(1);
  });

  it("reminders.complete marks reminder as done", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.reminders.complete({ id: 1 });
    expect(result.success).toBe(true);
  });

  it("reminders.cancel marks reminder as cancelled", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.reminders.cancel({ id: 1 });
    expect(result.success).toBe(true);
  });
});

// ─── AI Extraction Tests ──────────────────────────────────────────────────────
describe("ai", () => {
  it("ai.listPending returns array for doctor", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.ai.listPending();
    expect(Array.isArray(result)).toBe(true);
  });

  it("ai.extractFromText triggers AI extraction", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.ai.extractFromText({
      text: "Patient has gestational hypertension, started on methyldopa.",
      visitDate: "2025-01-15",
      visitLocation: "Prime Hospital",
      patientId: 1,
      sourceType: "text",
    });
    expect(result.extractionId).toBeDefined();
    expect(result.extractedData).toBeDefined();
  });

  it("ai.extractFromText is blocked for user role", async () => {
    const { ctx } = createContext("user");
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.ai.extractFromText({
        text: "Test text",
        visitDate: "2025-01-15",
        visitLocation: "Prime Hospital",
        sourceType: "text",
      })
    ).rejects.toThrow();
  });
});

// ─── Files Tests ──────────────────────────────────────────────────────────────
describe("files", () => {
  it("files.getUploadUrl returns fileKey for doctor", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.files.getUploadUrl({
      fileName: "test-lab.pdf",
      mimeType: "application/pdf",
      fileSize: 1024 * 100, // 100KB
      patientId: 1,
    });
    expect(result.fileKey).toBeDefined();
    expect(result.uploadReady).toBe(true);
  });

  it("files.getUploadUrl rejects oversized files", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.files.getUploadUrl({
        fileName: "huge-file.pdf",
        mimeType: "application/pdf",
        fileSize: 100 * 1024 * 1024, // 100MB — exceeds 50MB limit
        patientId: 1,
      })
    ).rejects.toThrow();
  });

  it("files.getUploadUrl rejects disallowed MIME types", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.files.getUploadUrl({
        fileName: "script.exe",
        mimeType: "application/x-msdownload",
        fileSize: 1024,
        patientId: 1,
      })
    ).rejects.toThrow();
  });

  it("files.listByPatient returns array for doctor", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.files.listByPatient({ patientId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Admin Tests ──────────────────────────────────────────────────────────────
describe("admin", () => {
  it("admin.getDashboardStats returns stats for doctor", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.getDashboardStats();
    expect(result).not.toBeNull();
    expect(typeof result?.todayVisits).toBe("number");
    expect(typeof result?.totalPatients).toBe("number");
    expect(typeof result?.pendingReminders).toBe("number");
  });

  it("admin.getDashboardStats is blocked for user role", async () => {
    const { ctx } = createContext("user");
    const caller = appRouter.createCaller(ctx);
    await expect(caller.admin.getDashboardStats()).rejects.toThrow();
  });

  it("admin.listUsers is blocked for user role", async () => {
    const { ctx } = createContext("user");
    const caller = appRouter.createCaller(ctx);
    await expect(caller.admin.listUsers()).rejects.toThrow();
  });

  it("admin.listUsers succeeds for admin role", async () => {
    const { ctx } = createContext("admin");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.listUsers();
    expect(Array.isArray(result)).toBe(true);
  });

  it("admin.updateUserRole succeeds for admin", async () => {
    const { ctx } = createContext("admin");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.updateUserRole({ userId: 2, role: "doctor" });
    expect(result.success).toBe(true);
  });

  it("admin.listAuditEvents returns array for doctor", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.listAuditEvents({ limit: 50, offset: 0 });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Export Tests ─────────────────────────────────────────────────────────────
describe("exports", () => {
  it("exports.listExports returns array for doctor", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.exports.listExports();
    expect(Array.isArray(result)).toBe(true);
  });

  it("exports.listExports is blocked for user role", async () => {
    const { ctx } = createContext("user");
    const caller = appRouter.createCaller(ctx);
    await expect(caller.exports.listExports()).rejects.toThrow();
  });
});

// ─── Telegram Tests ───────────────────────────────────────────────────────────
describe("telegram", () => {
  it("telegram.testConnection returns configured status", async () => {
    const { ctx } = createContext("doctor");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.telegram.testConnection();
    expect(result).toHaveProperty("configured");
  });

  it("telegram.sendAlert is blocked for user role", async () => {
    const { ctx } = createContext("user");
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.telegram.sendAlert({ message: "Test alert" })
    ).rejects.toThrow();
  });
});

// ─── RBAC Boundary Tests ──────────────────────────────────────────────────────
describe("RBAC boundaries", () => {
  const sensitiveOperations = [
    { name: "patients.create", fn: (caller: ReturnType<typeof appRouter.createCaller>) =>
      caller.patients.create({ name: "Test", phone: "0500000000", visitLocation: "Prime Hospital" }) },
    { name: "visits.create", fn: (caller: ReturnType<typeof appRouter.createCaller>) =>
      caller.visits.create({ patientId: 1, visitDate: "2025-01-15", visitLocation: "Prime Hospital" }) },
    { name: "reminders.create", fn: (caller: ReturnType<typeof appRouter.createCaller>) =>
      caller.reminders.create({ patientId: 1, reminderType: "follow_up", title: "Test", dueDate: "2025-02-01" }) },
    { name: "exports.listExports", fn: (caller: ReturnType<typeof appRouter.createCaller>) =>
      caller.exports.listExports() },
    { name: "ai.extractFromText", fn: (caller: ReturnType<typeof appRouter.createCaller>) =>
      caller.ai.extractFromText({ text: "test", visitDate: "2025-01-15", visitLocation: "Prime Hospital", sourceType: "text" }) },
  ];

  for (const op of sensitiveOperations) {
    it(`${op.name} is blocked for unauthenticated users`, async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(op.fn(caller)).rejects.toThrow();
    });
  }
});
