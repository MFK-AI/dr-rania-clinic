import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createAttachment,
  getAttachmentsByPatient,
  getAttachmentsByVisit,
  logAuditEvent,
} from "../db";
import { storagePut } from "../storage";
import { validateFileUpload } from "../../shared/types";

function requireDoctorOrAssistant(role: string) {
  if (role !== "doctor" && role !== "assistant" && role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });
  }
}

export const filesRouter = router({
  // Get upload URL for a file — client uploads directly then calls confirmUpload
  getUploadUrl: protectedProcedure
    .input(
      z.object({
        fileName: z.string(),
        mimeType: z.string(),
        fileSize: z.number(),
        patientId: z.number().optional(),
        visitId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);

      const validation = validateFileUpload(input.fileName, input.mimeType, input.fileSize);
      if (!validation.valid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: validation.error });
      }

      // Generate a unique storage key
      const timestamp = Date.now();
      const sanitizedName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const prefix = input.patientId ? `patients/${input.patientId}` : "uploads";
      const fileKey = `${prefix}/${timestamp}_${sanitizedName}`;

      return { fileKey, uploadReady: true };
    }),

  // After client uploads bytes to storage, confirm and save metadata
  confirmUpload: protectedProcedure
    .input(
      z.object({
        fileKey: z.string(),
        fileUrl: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        fileSize: z.number(),
        patientId: z.number().optional(),
        visitId: z.number().optional(),
        aiExtractionId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);

      const validation = validateFileUpload(input.fileName, input.mimeType, input.fileSize);
      if (!validation.valid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: validation.error });
      }

      const id = await createAttachment({
        patientId: input.patientId,
        visitId: input.visitId,
        aiExtractionId: input.aiExtractionId,
        fileName: input.fileName,
        fileKey: input.fileKey,
        fileUrl: input.fileUrl,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        uploadedBy: ctx.user.id,
      });

      await logAuditEvent({
        userId: ctx.user.id,
        action: "upload_file",
        entityType: "attachment",
        entityId: id,
        metadata: {
          fileName: input.fileName,
          mimeType: input.mimeType,
          patientId: input.patientId,
          visitId: input.visitId,
        },
      });

      return { id };
    }),

  listByPatient: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      return getAttachmentsByPatient(input.patientId);
    }),

  listByVisit: protectedProcedure
    .input(z.object({ visitId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      return getAttachmentsByVisit(input.visitId);
    }),
});
