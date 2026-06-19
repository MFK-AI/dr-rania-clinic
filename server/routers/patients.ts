import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createPatient,
  getPatientById,
  getPatientByPhone,
  getPatientHistory,
  listPatients,
  searchPatients,
  softDeletePatient,
  updatePatient,
} from "../db";
import { logAuditEvent } from "../db";

// Role guard helpers
function requireDoctorOrAssistant(role: string) {
  if (role !== "doctor" && role !== "assistant" && role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });
  }
}
function requireDoctor(role: string) {
  if (role !== "doctor" && role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the doctor can perform this action." });
  }
}

const patientInput = z.object({
  name: z.string().min(1, "Patient name is required"),
  phone: z.string().min(5, "Phone number is required"),
  age: z.number().int().min(0).max(120).optional(),
  dateOfBirth: z.string().optional(),
  maritalStatus: z.enum(["single", "married", "divorced", "widowed"]).optional(),
  visitLocation: z.enum(["Prime Hospital", "Mazher Center"]).optional(),
  pregnancyStatus: z.string().optional(),
  gravida: z.number().int().min(0).optional(),
  para: z.number().int().min(0).optional(),
  allergies: z.string().optional(),
  importantNotes: z.string().optional(),
});

export const patientsRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      return listPatients(input.limit, input.offset);
    }),

  search: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      return searchPatients(input.query);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      const patient = await getPatientById(input.id);
      if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "Patient not found." });
      await logAuditEvent({
        userId: ctx.user.id,
        action: "view_patient",
        entityType: "patient",
        entityId: input.id,
        ipAddress: ctx.req.headers["x-forwarded-for"] as string | undefined,
      });
      return patient;
    }),

  checkDuplicate: protectedProcedure
    .input(z.object({ phone: z.string(), name: z.string() }))
    .query(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      const byPhone = await getPatientByPhone(input.phone);
      const byName = await searchPatients(input.name, 5);
      return {
        duplicatePhone: byPhone ?? null,
        similarNames: byName.filter((p) => p.name.toLowerCase().includes(input.name.toLowerCase())),
      };
    }),

  create: protectedProcedure
    .input(patientInput)
    .mutation(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      // Block duplicate phone
      const existing = await getPatientByPhone(input.phone);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A patient with phone ${input.phone} already exists (${existing.name}).`,
        });
      }
      const id = await createPatient({ ...input, createdBy: ctx.user.id });
      await logAuditEvent({
        userId: ctx.user.id,
        action: "create_patient",
        entityType: "patient",
        entityId: id,
        metadata: { name: input.name, phone: input.phone },
      });
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), data: patientInput.partial() }))
    .mutation(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      const patient = await getPatientById(input.id);
      if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "Patient not found." });
      // If phone changed, check for duplicates
      if (input.data.phone && input.data.phone !== patient.phone) {
        const existing = await getPatientByPhone(input.data.phone);
        if (existing && existing.id !== input.id) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Phone ${input.data.phone} is already used by patient ${existing.name}.`,
          });
        }
      }
      await updatePatient(input.id, input.data, ctx.user.id);
      await logAuditEvent({
        userId: ctx.user.id,
        action: "edit_patient",
        entityType: "patient",
        entityId: input.id,
        metadata: { fields: Object.keys(input.data) },
      });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireDoctor(ctx.user.role);
      const patient = await getPatientById(input.id);
      if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "Patient not found." });
      await softDeletePatient(input.id, ctx.user.id);
      await logAuditEvent({
        userId: ctx.user.id,
        action: "delete_patient",
        entityType: "patient",
        entityId: input.id,
        metadata: { name: patient.name },
      });
      return { success: true };
    }),

  getHistory: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      return getPatientHistory(input.patientId);
    }),
});
