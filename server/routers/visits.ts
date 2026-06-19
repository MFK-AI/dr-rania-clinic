import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createVisit,
  getAttachmentsByVisit,
  getPendingAiReviews,
  getTodaysVisits,
  getVisitById,
  getVisitsByPatient,
  getVisitsThisWeek,
  getPatientById,
  logAuditEvent,
  softDeleteVisit,
  updateVisit,
} from "../db";
import { syncVisitToSheet, createVisitCalendarEvent } from "./sync";

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

const visitInput = z.object({
  patientId: z.number(),
  visitDate: z.string(),
  visitLocation: z.enum(["Prime Hospital", "Mazher Center"]),
  visitType: z.string().optional(),
  reasonForVisit: z.string().optional(),
  diagnosis: z.string().optional(),
  examination: z.string().optional(),
  ultrasoundFindings: z.string().optional(),
  labsImaging: z.string().optional(),
  pendingResults: z.string().optional(),
  managementPlan: z.string().optional(),
  medications: z.string().optional(),
  advice: z.string().optional(),
  followUpPlan: z.string().optional(),
});

export const visitsRouter = router({
  listByPatient: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      return getVisitsByPatient(input.patientId);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      const visit = await getVisitById(input.id);
      if (!visit) throw new TRPCError({ code: "NOT_FOUND", message: "Visit not found." });
      const attachments = await getAttachmentsByVisit(input.id);
      return { visit, attachments };
    }),

  getTodays: protectedProcedure.query(async ({ ctx }) => {
    requireDoctorOrAssistant(ctx.user.role);
    return getTodaysVisits();
  }),

  getThisWeek: protectedProcedure.query(async ({ ctx }) => {
    requireDoctorOrAssistant(ctx.user.role);
    return getVisitsThisWeek();
  }),

  getPendingAiReviews: protectedProcedure.query(async ({ ctx }) => {
    requireDoctorOrAssistant(ctx.user.role);
    return getPendingAiReviews();
  }),

  create: protectedProcedure
    .input(visitInput)
    .mutation(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      const id = await createVisit({ ...input, status: "draft", createdBy: ctx.user.id });
      await logAuditEvent({
        userId: ctx.user.id,
        action: "create_visit",
        entityType: "visit",
        entityId: id,
        metadata: { patientId: input.patientId, visitDate: input.visitDate },
      });
      // Real-time sync to Google Sheets + Calendar (non-blocking)
      getPatientById(input.patientId).then((p) => {
        if (!p) return;
        getVisitById(id).then((v) => {
          if (v) syncVisitToSheet(v, p.name, p.phone).catch(() => {});
        }).catch(() => {});
        createVisitCalendarEvent({
          patientName: p.name,
          patientPhone: p.phone,
          visitType: input.visitType ?? "Consultation",
          chiefComplaint: input.reasonForVisit,
          location: input.visitLocation,
          visitDate: new Date(input.visitDate),
        }).catch(() => {});
      }).catch(() => {});
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), data: visitInput.partial() }))
    .mutation(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      const visit = await getVisitById(input.id);
      if (!visit) throw new TRPCError({ code: "NOT_FOUND", message: "Visit not found." });
      await updateVisit(input.id, input.data, ctx.user.id);
      await logAuditEvent({
        userId: ctx.user.id,
        action: "edit_visit",
        entityType: "visit",
        entityId: input.id,
        metadata: { fields: Object.keys(input.data) },
      });
      return { success: true };
    }),

  finalize: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireDoctor(ctx.user.role);
      const visit = await getVisitById(input.id);
      if (!visit) throw new TRPCError({ code: "NOT_FOUND", message: "Visit not found." });
      await updateVisit(input.id, { status: "final" }, ctx.user.id);
      await logAuditEvent({
        userId: ctx.user.id,
        action: "edit_visit",
        entityType: "visit",
        entityId: input.id,
        metadata: { action: "finalized" },
      });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireDoctor(ctx.user.role);
      const visit = await getVisitById(input.id);
      if (!visit) throw new TRPCError({ code: "NOT_FOUND", message: "Visit not found." });
      await softDeleteVisit(input.id, ctx.user.id);
      await logAuditEvent({
        userId: ctx.user.id,
        action: "delete_visit",
        entityType: "visit",
        entityId: input.id,
      });
      return { success: true };
    }),
});
