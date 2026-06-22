import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM, type Message } from "../_core/llm";
import { transcribeAudio } from "../_core/voiceTranscription";
import { storageGetSignedUrl } from "../storage";
import { createReminderCalendarEvent } from "./sync";
import { sendTelegramAlert } from "./telegram";
import {
  approveAiExtraction,
  createAiExtraction,
  createReminder,
  getAiExtractionById,
  getPatientByPhone,
  getPendingExtractions,
  getVisitById,
  logAuditEvent,
  searchPatients,
  updateVisit,
} from "../db";
import type { AiExtractionResult } from "../../shared/types";

// BUGFIX: the AI provider fetches image_url server-to-server, with no
// browser session cookie attached. PR #1 correctly added an auth check to
// the /manus-storage/* proxy route, which means that fetch now fails
// silently -- the model just gets no image and returns an empty/null
// result instead of a hard error. Internal storage URLs need to be
// resolved to a direct, time-limited S3 signed URL instead, which the
// provider can fetch without any cookie at all.
const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heic",
  webp: "image/webp",
  gif: "image/gif",
};

function mimeTypeFromKey(key: string): string {
  const lastDot = key.lastIndexOf(".");
  if (lastDot === -1) return "image/jpeg";
  const ext = key.slice(lastDot + 1).toLowerCase();
  return EXTENSION_TO_MIME[ext] ?? "image/jpeg";
}

const AUDIO_EXTENSION_TO_MIME: Record<string, string> = {
  webm: "audio/webm",
  m4a: "audio/m4a",
  mp4: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  aac: "audio/aac",
};

function audioMimeTypeFromKey(key: string): string {
  const lastDot = key.lastIndexOf(".");
  if (lastDot === -1) return "audio/webm";
  const ext = key.slice(lastDot + 1).toLowerCase();
  return AUDIO_EXTENSION_TO_MIME[ext] ?? "audio/webm";
}

// Same fix as resolveImageUrlForLLM, for the voice transcription path:
// transcribeAudio() fetches audioUrl server-to-server with no session
// cookie, so an internal /manus-storage/ path hits the same auth-gated
// route and fails. Resolve to a direct signed URL instead, and return the
// correct mime type from the file extension rather than trusting the
// storage layer's unreliable Content-Type header on the way back.
async function resolveAudioUrlForTranscription(
  rawUrl: string
): Promise<{ url: string; mimeType: string }> {
  const marker = "/manus-storage/";
  const idx = rawUrl.indexOf(marker);
  if (idx === -1) {
    // Not an internal storage URL -- leave it as-is, no mime override.
    return { url: rawUrl, mimeType: "audio/webm" };
  }
  const key = rawUrl.slice(idx + marker.length);
  const signedUrl = await storageGetSignedUrl(key);
  return { url: signedUrl, mimeType: audioMimeTypeFromKey(key) };
}

async function resolveImageUrlForLLM(rawUrl: string): Promise<string> {
  const marker = "/manus-storage/";
  const idx = rawUrl.indexOf(marker);
  if (idx === -1) return rawUrl; // not an internal storage URL, leave as-is
  const key = rawUrl.slice(idx + marker.length);
  const signedUrl = await storageGetSignedUrl(key);

  // CONFIRMED VIA LOGS: the response Content-Type header from Forge's
  // storage layer comes back as "multipart/form-data" regardless of what
  // was actually uploaded -- not trustworthy. Determine the real image
  // type from the file extension instead, which we control directly.
  const resp = await fetch(signedUrl);
  if (!resp.ok) {
    throw new Error(`Failed to fetch image bytes from storage (${resp.status})`);
  }
  const contentType = mimeTypeFromKey(key);
  const declaredLength = resp.headers.get("content-length");
  const buffer = Buffer.from(await resp.arrayBuffer());
  const base64 = buffer.toString("base64");

  // DIAGNOSTIC: confirm the bytes we fetched are actually intact and look
  // like a real image, before blaming Forge's relay/Gemini translation.
  const magicBytesHex = buffer.subarray(0, 12).toString("hex");
  console.log(
    "[resolveImageUrlForLLM] declared content-length:", declaredLength,
    "actual buffer bytes:", buffer.length,
    "magic bytes:", magicBytesHex,
    "mime type used:", contentType
  );

  return `data:${contentType};base64,${base64}`;
}

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
const EXTRACTION_SYSTEM_PROMPT = `You are the AI extraction and clinical documentation engine for Dr. Rania Khalil's private OB-GYN clinic at drmousa.clinic.

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
        const { url: resolvedAudioUrl, mimeType } = await resolveAudioUrlForTranscription(input.audioUrl);
        const transcriptionResult = await transcribeAudio({
          audioUrl: resolvedAudioUrl,
          mimeType,
          prompt: "OB-GYN clinical notes, mixed Arabic and English medical terminology",
        });
        if ('error' in transcriptionResult) {
          throw new Error(transcriptionResult.error);
        }
        transcript = transcriptionResult.text;
      } catch (err) {
        console.error("[ai.transcribeAndExtract] transcription failed:", err);
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
        // Optional — voice notes recorded standalone (not within a visit form)
        // have no visitId. Approval still saves reminders + fires Calendar/Telegram.
        visitId: z.number().optional(),
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

      // If a visitId is provided, update the visit with the final clinical data.
      // Voice notes recorded standalone (outside a visit form) have no visitId --
      // in that case we skip the visit update and still save reminders.
      let visit = null;
      if (input.visitId) {
        visit = await getVisitById(input.visitId);
        if (!visit) throw new TRPCError({ code: "NOT_FOUND", message: "Visit not found." });
        await updateVisit(
          input.visitId,
          { ...input.finalData, status: "final" },
          ctx.user.id
        );
      }

      // Mark extraction as approved
      await approveAiExtraction(input.extractionId, ctx.user.id);

      // Resolve the patient for reminder linking.
      // Priority order: visit.patientId → extracted phone → extracted name → override
      let resolvedPatientId: number | null = visit?.patientId ?? null;
      if (!resolvedPatientId) {
        const extraction = await getAiExtractionById(input.extractionId);
        const extracted = extraction?.extractedData as Record<string, unknown> | null;
        const extractedPhone = extracted?.patient_phone as string | null;
        const extractedName = extracted?.patient_name as string | null;

        if (extractedPhone) {
          const matched = await getPatientByPhone(extractedPhone.trim());
          if (matched) resolvedPatientId = matched.id;
        }
        if (!resolvedPatientId && extractedName) {
          const results = await searchPatients(extractedName.trim(), 1);
          if (results[0]) resolvedPatientId = results[0].id;
        }
      }

      // Create approved reminders and fire Calendar + Telegram for each one
      for (const r of input.approvedReminders) {
        // Use the reminder's own patientId if explicitly set (doctor confirmed
        // it in the UI); otherwise fall back to the auto-resolved patient.
        const finalPatientId = r.patientId > 0 ? r.patientId : (resolvedPatientId ?? 0);
        if (!finalPatientId) {
          console.warn(
            "[ai.approve] Skipping reminder — could not resolve patient:",
            r.title
          );
          continue;
        }

        await createReminder({
          patientId: finalPatientId,
          visitId: input.visitId ?? null,
          reminderType: r.reminderType,
          title: r.title,
          dueDate: r.dueDate,
          dueTime: r.dueTime,
          notes: r.notes,
          createdBy: ctx.user.id,
        });

        // Fire Calendar and Telegram non-blocking after doctor approval.
        // Calendar title is intentionally safe (no patient name/clinical detail)
        // per the project safety spec -- full detail is in the app only.
        createReminderCalendarEvent({
          title: r.title,
          dueDate: r.dueDate,
          dueTime: r.dueTime,
        }).then((eventId) => {
          console.log("[ai.approve] Calendar event created. ID:", eventId, "Reminder:", r.title, "Date:", r.dueDate);
        }).catch((err) => {
          const msg = err instanceof Error ? err.message : JSON.stringify(err);
          console.error("[ai.approve] CALENDAR EVENT FAILED for reminder:", r.title, "Error:", msg);
        });

        sendTelegramAlert(
          `🔔 *Reminder Approved*\n` +
          `📋 ${r.title}\n` +
          `📅 Due: ${r.dueDate}${r.dueTime ? " at " + r.dueTime : ""}\n` +
          `🏷️ Type: ${r.reminderType.replace(/_/g, " ")}\n` +
          `✅ Approved by Dr. Rania — open the clinic app to view full details.`
        ).catch((err) => console.error("[ai.approve] Telegram alert failed:", err));
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

  // ── Extract PATIENT data from a screenshot / image ─────────────────────────
  extractPatientFromImage: protectedProcedure
    .input(z.object({ imageUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      const systemPrompt = `You are a medical data extraction assistant for an OB-GYN clinic.
Extract ALL patient demographic and medical history information from the provided image.
The image may be a handwritten form, printed form, screenshot, or any clinical document.
Return ONLY a valid JSON object with these exact keys (use null for missing fields, no extra keys):
{
  "name": null,
  "phone": null,
  "dateOfBirth": null,
  "age": null,
  "maritalStatus": null,
  "pregnancyStatus": null,
  "gravida": null,
  "para": null,
  "abortions": null,
  "bloodType": null,
  "allergies": null,
  "chronicConditions": null,
  "currentMedications": null,
  "surgicalHistory": null,
  "familyHistory": null,
  "notes": null
}
For maritalStatus use one of: single, married, divorced, widowed, or null.
For pregnancyStatus use one of: not_pregnant, pregnant, postpartum, or null.
Do not include markdown, code fences, or any text outside the JSON object.`;
      try {
        const resolvedImageUrl = await resolveImageUrlForLLM(input.imageUrl);
        console.log("[ai.extractPatientFromImage] resolved image: data URI, length:", resolvedImageUrl.length);
        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: resolvedImageUrl, detail: "high" } },
              { type: "text", text: "Extract all patient information from this image." },
            ],
          },
        ];
        const response = await invokeLLM({ messages });
        if (!response?.choices?.[0]) {
          console.error(
            "[ai.extractPatientFromImage] unexpected LLM response shape:",
            JSON.stringify(response).slice(0, 800)
          );
          throw new Error("LLM response did not include a choices array");
        }
        const raw = response.choices[0]?.message?.content;
        const content = typeof raw === "string" ? raw : JSON.stringify(raw ?? "{}");
        // DIAGNOSTIC: length + truncated preview only -- avoids writing full
        // extracted patient data into infrastructure logs.
        console.log(
          "[ai.extractPatientFromImage] raw response length:",
          content.length,
          "preview:",
          content.slice(0, 80)
        );
        const cleaned = content.replace(/```json\n?|```/g, "").trim();
        const extractedData = JSON.parse(cleaned) as Record<string, unknown>;
        return { extractedData };
      } catch (err) {
        console.error("[ai.extractPatientFromImage] failed:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not extract patient data from image. Please try a clearer image or enter data manually.",
        });
      }
    }),

  // ── Extract PATIENT data from pasted text / voice transcript ───────────────
  extractPatientFromText: protectedProcedure
    .input(z.object({ text: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      const systemPrompt = `You are a medical data extraction assistant for an OB-GYN clinic.
Extract ALL patient demographic and medical history information from the provided text.
The text may be a voice transcript, typed notes, or copied text from any source in Arabic or English.
Return ONLY a valid JSON object with these exact keys (use null for missing fields, no extra keys):
{
  "name": null,
  "phone": null,
  "dateOfBirth": null,
  "age": null,
  "maritalStatus": null,
  "pregnancyStatus": null,
  "gravida": null,
  "para": null,
  "abortions": null,
  "bloodType": null,
  "allergies": null,
  "chronicConditions": null,
  "currentMedications": null,
  "surgicalHistory": null,
  "familyHistory": null,
  "notes": null
}
For maritalStatus use one of: single, married, divorced, widowed, or null.
For pregnancyStatus use one of: not_pregnant, pregnant, postpartum, or null.
Do not include markdown, code fences, or any text outside the JSON object.`;
      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.text },
          ],
        });
        const raw = response.choices[0]?.message?.content;
        const content = typeof raw === "string" ? raw : JSON.stringify(raw ?? "{}");
        const cleaned = content.replace(/```json\n?|```/g, "").trim();
        const extractedData = JSON.parse(cleaned) as Record<string, unknown>;
        return { extractedData };
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not extract patient data from text. Please try again or enter data manually.",
        });
      }
    }),

  // ── AI Reminder Auto-Extraction from Visit Notes ────────────────────────────
  extractRemindersFromVisit: protectedProcedure
    .input(z.object({
      visitId: z.number(),
      patientId: z.number(),
      visitDate: z.string(),
      diagnosis: z.string().optional(),
      examination: z.string().optional(),
      labsImaging: z.string().optional(),
      pendingResults: z.string().optional(),
      managementPlan: z.string().optional(),
      medications: z.string().optional(),
      advice: z.string().optional(),
      followUpPlan: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      const visitText = [
        input.diagnosis ? `Diagnosis: ${input.diagnosis}` : "",
        input.examination ? `Examination: ${input.examination}` : "",
        input.labsImaging ? `Labs/Imaging: ${input.labsImaging}` : "",
        input.pendingResults ? `Pending Results: ${input.pendingResults}` : "",
        input.managementPlan ? `Management Plan: ${input.managementPlan}` : "",
        input.medications ? `Medications: ${input.medications}` : "",
        input.advice ? `Advice: ${input.advice}` : "",
        input.followUpPlan ? `Follow-up Plan: ${input.followUpPlan}` : "",
      ].filter(Boolean).join("\n");
      if (!visitText.trim()) return { reminders: [] };
      const today = new Date().toISOString().split("T")[0];
      const systemPrompt = `You are a medical assistant AI for a gynaecology and obstetrics clinic in Dubai.
Analyse the following clinical visit notes and extract ALL actionable reminders that the doctor or staff should follow up on.
For each reminder, determine:
- title: short action title (e.g. "Call patient for lab results", "Book ultrasound", "Medication review")
- reminderType: one of: call_patient | inform_result | check_lab | check_imaging | follow_up | medication_review | procedure_booking | custom
- dueDate: ISO date string (YYYY-MM-DD) relative to visit date ${input.visitDate}. If the text says "in 2 weeks" calculate from visit date.
- notes: any extra context
- priority: low | medium | high
Return ONLY a valid JSON array of reminder objects. No explanation. No markdown. Example:
[{"title":"Call for HbA1c result","reminderType":"inform_result","dueDate":"${today}","notes":"Check if result is back","priority":"high"}]`;
      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: visitText },
          ],
        });
        const raw = response.choices[0]?.message?.content;
        const content = typeof raw === "string" ? raw : JSON.stringify(raw ?? "[]");
        const cleaned = content.replace(/```json\n?|```/g, "").trim();
        const parsed = JSON.parse(cleaned) as Array<{
          title: string;
          reminderType: string;
          dueDate: string;
          notes?: string;
          priority?: string;
        }>;
        // Persist extracted reminders to the database
        const validTypes = [
          "call_patient", "inform_result", "check_lab", "check_imaging",
          "follow_up", "medication_review", "procedure_booking", "custom",
        ] as const;
        type ReminderType = typeof validTypes[number];
        const savedIds: number[] = [];
        for (const r of parsed) {
          const rType: ReminderType = validTypes.includes(r.reminderType as ReminderType)
            ? (r.reminderType as ReminderType)
            : "custom";
          try {
            const reminderId = await createReminder({
              patientId: input.patientId,
              visitId: input.visitId,
              reminderType: rType,
              title: r.title,
              notes: r.notes ?? null,
              dueDate: r.dueDate,
              status: "pending",
              createdBy: ctx.user.id,
              sourceText: `AI-extracted from visit ${input.visitId}`,
            });
            savedIds.push(reminderId);
          } catch (err) {
            console.error("[AI] Failed to save reminder:", err);
          }
        }
        return { reminders: parsed, savedCount: savedIds.length };
      } catch {
        return { reminders: [], savedCount: 0 };
      }
    }),

  // ── Extract VISIT / CLINICAL data from a screenshot / image ────────────────
  extractVisitFromImage: protectedProcedure
    .input(
      z.object({
        imageUrl: z.string().url(),
        visitDate: z.string().optional(),
        visitLocation: z.enum(["Prime Hospital", "Mazher Center"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireDoctorOrAssistant(ctx.user.role);
      const systemPrompt = `You are an expert OB-GYN clinical data extraction assistant.
Extract ALL clinical visit information from the provided image.
The image may be handwritten notes, a printed form, a prescription, or any clinical document.
Return ONLY a valid JSON object with these exact keys (use null for missing fields, no extra keys):
{
  "reason_for_visit": null,
  "examination": null,
  "ultrasound_findings": null,
  "labs_imaging": null,
  "pending_results": null,
  "diagnosis": null,
  "management_plan": null,
  "medications": null,
  "advice": null,
  "follow_up_plan": null,
  "visit_type": null,
  "risk_flags": [],
  "unclear_words_or_phrases": [],
  "extraction_status": "Needs Review"
}
For visit_type use one of: new_patient, follow_up, emergency, procedure, prenatal, postnatal, or null.
For extraction_status use: Clear, Needs Review, or Unclear.
Do not include markdown, code fences, or any text outside the JSON object.`;
      try {
        const resolvedImageUrl = await resolveImageUrlForLLM(input.imageUrl);
        console.log("[ai.extractVisitFromImage] resolved image: data URI, length:", resolvedImageUrl.length);
        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: resolvedImageUrl, detail: "high" } },
              { type: "text", text: "Extract all clinical visit information from this image." },
            ],
          },
        ];
        const response = await invokeLLM({ messages });
        if (!response?.choices?.[0]) {
          console.error(
            "[ai.extractVisitFromImage] unexpected LLM response shape:",
            JSON.stringify(response).slice(0, 800)
          );
          throw new Error("LLM response did not include a choices array");
        }
        const raw = response.choices[0]?.message?.content;
        const content = typeof raw === "string" ? raw : JSON.stringify(raw ?? "{}");
        console.log(
          "[ai.extractVisitFromImage] raw response length:",
          content.length,
          "preview:",
          content.slice(0, 80)
        );
        const cleaned = content.replace(/```json\n?|```/g, "").trim();
        const extractedData = JSON.parse(cleaned) as Record<string, unknown>;
        return { extractedData };
      } catch (err) {
        console.error("[ai.extractVisitFromImage] failed:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not extract visit data from image. Please try a clearer image or enter data manually.",
        });
      }
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
