import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM, type Message } from "../_core/llm";
import { transcribeAudio } from "../_core/voiceTranscription";
import {
  approveAiExtraction,
  createAiExtraction,
  createReminder,
  getAiExtractionById,
  getPendingExtractions,
  getVisitById,
  logAuditEvent,
  updateVisit,
} from "../db";
import type { AiExtractionResult } from "../../shared/types";

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

// The Claude system prompt for clinical documentation extraction
const EXTRACTION_SYSTEM_PROMPT = `You are the AI extraction and clinical documentation engine for Dr. Rania Mousa's private OB-GYN clinic workflow app.

Your role: Convert doctor-provided voice transcripts, screenshots, OCR text, uploaded files, and handwritten-note extractions into structured English doctor documentation.

Strict boundaries:
- You are NOT a diagnostic engine.
- You must NOT create new clinical decisions.
- You must NOT prescribe treatment.
- You must NOT order investigations.
- You must NOT invent missing data.
- You must extract and organize what is provided.
- You may flag missing documentation items.
- You may clean and structure messy notes into professional English.
- You may detect reminders and convert specific time frames into exact dates.

Input language: Arabic, English, or Mixed Arabic-English
Output language: English only
Output type: Doctor documentation only, not patient-friendly instructions.

FORBIDDEN suggestions (never output these):
- Start medication / Stop medication
- Order test
- Diagnosis likely X
- Patient should undergo procedure
- Patient needs admission
- This is suspicious for malignancy
- This confirms pregnancy complication

If clinical reasoning is needed, write: "Clinical decision required by doctor."

Return ONLY valid JSON matching this exact schema. No explanation outside JSON. No markdown.`;

function buildExtractionUserPrompt(
  text: string,
  visitDate: string,
  visitLocation?: string
): string {
  return `Visit date: ${visitDate}
Visit location: ${visitLocation ?? "not specified"}

Input text to extract:
${text}

Return a JSON object with these exact fields:
{
  "patient_name": string | null,
  "patient_phone": string | null,
  "visit_date": string | null,
  "visit_location": string | null,
  "reason_for_visit": string | null,
  "diagnosis": string | null,
  "examination": string | null,
  "ultrasound_findings": string | null,
  "labs_imaging": string | null,
  "pending_results": string | null,
  "management_plan": string | null,
  "advice": string | null,
  "follow_up_plan": string | null,
  "reminders": [
    {
      "reminder_type": "call_patient"|"inform_result"|"check_lab"|"check_imaging"|"follow_up"|"medication_review"|"procedure_booking"|"custom",
      "reminder_title": string,
      "patient_name": string | null,
      "patient_phone": string | null,
      "due_date": string | null,
      "due_time": string | null,
      "action_required": string,
      "source_text": string,
      "requires_doctor_confirmation": true,
      "sensitivity_level": "low"|"medium"|"high"
    }
  ],
  "unclear_words_or_phrases": string[],
  "missing_documentation_items": string[],
  "source_language": string,
  "risk_flags": string[],
  "extraction_status": "Clear"|"Needs review"|"Unclear"
}

Time conversion rule: Convert relative time expressions (tomorrow, after 2 days, next week) to exact dates using the visit date provided above.
Risk flags to use when applicable: patient_identity_unclear, date_unclear, clinical_plan_unclear, pending_result_detected, reminder_detected, handwriting_unclear, mixed_language_input, possible_duplicate_patient, source_quality_low`;
}

export const aiRouter = router({
  // Transcribe audio file and extract clinical data
  transcribeAndExtract: protectedProcedure
    .input(
      z.object({
        audioUrl: z.string().url(),
        visitDate: z.string(),
        visitLocation: z.enum(["Prime Hospital", "Mazher Center"]).optional(),
        patientId: z.number().optional(),
        visitId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);

      // Step 1: Transcribe audio
      let transcript = "";
      try {
      const transcriptionResult = await transcribeAudio({
        audioUrl: input.audioUrl,
        prompt: "OB-GYN clinical notes, mixed Arabic and English medical terminology",
      });
      if ('error' in transcriptionResult) {
        throw new Error(transcriptionResult.error);
      }
      transcript = transcriptionResult.text;
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Audio transcription failed. Please try again or upload a clearer recording.",
        });
      }

      // Step 2: AI extraction
      const extractedData = await runAiExtraction(
        transcript,
        input.visitDate,
        input.visitLocation
      );

      // Step 3: Determine extraction status
      const hasUnclear = extractedData.unclear_words_or_phrases.length > 0;
      const hasMissing = extractedData.missing_documentation_items.length > 0;
      const status = extractedData.extraction_status;

      // Step 4: Save extraction record
      const extractionId = await createAiExtraction({
        visitId: input.visitId,
        patientId: input.patientId,
        sourceType: "voice",
        transcript,
        extractedData: extractedData as unknown as Record<string, unknown>,
        extractionStatus: status,
        riskFlags: extractedData.risk_flags as unknown as Record<string, unknown>,
        unclearWords: extractedData.unclear_words_or_phrases as unknown as Record<string, unknown>,
        missingDocItems: extractedData.missing_documentation_items as unknown as Record<string, unknown>,
        createdBy: ctx.user.id,
      });

      // Step 5: Update visit status to ai_review if linked
      if (input.visitId) {
        await updateVisit(input.visitId, { status: "ai_review", aiExtractionId: extractionId }, ctx.user.id);
      }

      return {
        extractionId,
        transcript,
        extractedData,
        status,
        hasUnclear,
        hasMissing,
      };
    }),

  // Extract from text/screenshot OCR content
  extractFromText: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1),
        sourceType: z.enum(["screenshot", "document", "text"]),
        visitDate: z.string(),
        visitLocation: z.enum(["Prime Hospital", "Mazher Center"]).optional(),
        patientId: z.number().optional(),
        visitId: z.number().optional(),
        sourceFileKey: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);

      const extractedData = await runAiExtraction(
        input.text,
        input.visitDate,
        input.visitLocation
      );

      const extractionId = await createAiExtraction({
        visitId: input.visitId,
        patientId: input.patientId,
        sourceType: input.sourceType,
        sourceFileKey: input.sourceFileKey,
        transcript: input.text,
        extractedData: extractedData as unknown as Record<string, unknown>,
        extractionStatus: extractedData.extraction_status,
        riskFlags: extractedData.risk_flags as unknown as Record<string, unknown>,
        unclearWords: extractedData.unclear_words_or_phrases as unknown as Record<string, unknown>,
        missingDocItems: extractedData.missing_documentation_items as unknown as Record<string, unknown>,
        createdBy: ctx.user.id,
      });

      if (input.visitId) {
        await updateVisit(input.visitId, { status: "ai_review", aiExtractionId: extractionId }, ctx.user.id);
      }

      return { extractionId, extractedData };
    }),

  // Get extraction details
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      const extraction = await getAiExtractionById(input.id);
      if (!extraction) throw new TRPCError({ code: "NOT_FOUND", message: "Extraction not found." });
      return extraction;
    }),

  // List pending extractions
  listPending: protectedProcedure.query(async ({ ctx }) => {
    requireDoctorOrAssistant(ctx.user.role);
    return getPendingExtractions();
  }),

  // Doctor approves extraction and applies it to visit
  approve: protectedProcedure
    .input(
      z.object({
        extractionId: z.number(),
        visitId: z.number(),
        // Doctor-reviewed final data (may differ from AI draft)
        finalData: z.object({
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
        }),
        // Reminders to create from AI suggestions
        approvedReminders: z
          .array(
            z.object({
              reminderType: z.enum([
                "call_patient",
                "inform_result",
                "check_lab",
                "check_imaging",
                "follow_up",
                "medication_review",
                "procedure_booking",
                "custom",
              ]),
              title: z.string(),
              dueDate: z.string(),
              dueTime: z.string().optional(),
              notes: z.string().optional(),
              patientId: z.number(),
            })
          )
          .default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireDoctor(ctx.user.role);

      const visit = await getVisitById(input.visitId);
      if (!visit) throw new TRPCError({ code: "NOT_FOUND", message: "Visit not found." });

      // Apply final data to visit and mark as final
      await updateVisit(
        input.visitId,
        { ...input.finalData, status: "final" },
        ctx.user.id
      );

      // Mark extraction as approved
      await approveAiExtraction(input.extractionId, ctx.user.id);

      // Create approved reminders
      for (const r of input.approvedReminders) {
        await createReminder({
          patientId: r.patientId,
          visitId: input.visitId,
          reminderType: r.reminderType,
          title: r.title,
          dueDate: r.dueDate,
          dueTime: r.dueTime,
          notes: r.notes,
          createdBy: ctx.user.id,
        });
      }

      await logAuditEvent({
        userId: ctx.user.id,
        action: "approve_ai_extraction",
        entityType: "ai_extraction",
        entityId: input.extractionId,
        metadata: { visitId: input.visitId, remindersCreated: input.approvedReminders.length },
      });

      return { success: true };
    }),
});

// ─── Internal AI extraction helper ───────────────────────────────────────────

async function runAiExtraction(
  text: string,
  visitDate: string,
  visitLocation?: string
): Promise<AiExtractionResult> {
  try {
    const response = await invokeLLM({
      model: "claude-sonnet-4-5",
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildExtractionUserPrompt(text, visitDate, visitLocation),
        } as Message,
      ],
      response_format: { type: "json_object" },
      max_tokens: 4096,
    });

        const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) throw new Error("Empty AI response");
    const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
    const parsed = JSON.parse(content) as AiExtractionResult;

    // Sanitize: ensure arrays exist
    parsed.reminders = parsed.reminders ?? [];
    parsed.unclear_words_or_phrases = parsed.unclear_words_or_phrases ?? [];
    parsed.missing_documentation_items = parsed.missing_documentation_items ?? [];
    parsed.risk_flags = parsed.risk_flags ?? [];
    parsed.extraction_status = parsed.extraction_status ?? "Needs review";

    return parsed;
  } catch (err) {
    console.error("[AI Extraction] Error:", err);
    // Return a safe fallback extraction with Unclear status
    return {
      patient_name: null,
      patient_phone: null,
      visit_date: visitDate,
      visit_location: visitLocation ?? null,
      reason_for_visit: null,
      diagnosis: null,
      examination: null,
      ultrasound_findings: null,
      labs_imaging: null,
      pending_results: null,
      management_plan: null,
      advice: null,
      follow_up_plan: null,
      reminders: [],
      unclear_words_or_phrases: ["AI extraction failed — please enter data manually"],
      missing_documentation_items: [],
      source_language: "unknown",
      risk_flags: ["source_quality_low"],
      extraction_status: "Unclear",
    };
  }
}
