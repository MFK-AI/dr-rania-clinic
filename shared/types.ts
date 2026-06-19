// ─── Shared Types ─────────────────────────────────────────────────────────────

export type UserRole = "doctor" | "assistant" | "admin";

export type VisitLocation = "Prime Hospital" | "Mazher Center";
export const VISIT_LOCATIONS: VisitLocation[] = ["Prime Hospital", "Mazher Center"];

export type VisitStatus = "draft" | "ai_pending" | "ai_review" | "final";

export type ReminderType =
  | "call_patient"
  | "inform_result"
  | "check_lab"
  | "check_imaging"
  | "follow_up"
  | "medication_review"
  | "procedure_booking"
  | "custom";

export const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  call_patient: "Call Patient",
  inform_result: "Inform Patient of Result",
  check_lab: "Check Lab Result",
  check_imaging: "Check Imaging Result",
  follow_up: "Follow-up Appointment",
  medication_review: "Medication Review",
  procedure_booking: "Procedure Booking",
  custom: "Custom Reminder",
};

export type ReminderStatus = "pending" | "done" | "cancelled" | "postponed" | "overdue";

export type ExtractionStatus = "Clear" | "Needs review" | "Unclear";

export type AuditAction =
  | "login"
  | "logout"
  | "view_patient"
  | "create_patient"
  | "edit_patient"
  | "delete_patient"
  | "create_visit"
  | "edit_visit"
  | "delete_visit"
  | "approve_ai_extraction"
  | "upload_file"
  | "export_excel"
  | "create_reminder"
  | "complete_reminder"
  | "postpone_reminder"
  | "cancel_reminder"
  | "telegram_alert"
  | "view_audit_log"
  | "manage_users";

// Allowed MIME types for file upload
export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "audio/webm",
  "video/webm",
]);

// Allowed file extensions (secondary check)
export const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".jpg", ".jpeg", ".png", ".heic", ".heif",
  ".docx", ".xlsx", ".csv",
  ".mp3", ".m4a", ".wav", ".aac", ".webm",
]);

// Blocked extensions (explicit denylist)
export const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".js", ".html", ".htm",
  ".php", ".zip", ".rar", ".7z", ".apk", ".sh",
  ".py", ".rb", ".pl", ".ps1", ".vbs", ".msi",
]);

// File size limits in bytes
export const FILE_SIZE_LIMITS = {
  image: 20 * 1024 * 1024,      // 20 MB
  document: 50 * 1024 * 1024,   // 50 MB
  audio: 100 * 1024 * 1024,     // 100 MB
};

export function getFileSizeLimit(mimeType: string): number {
  if (mimeType.startsWith("image/")) return FILE_SIZE_LIMITS.image;
  if (mimeType.startsWith("audio/") || mimeType.startsWith("video/")) return FILE_SIZE_LIMITS.audio;
  return FILE_SIZE_LIMITS.document;
}

export function validateFileUpload(
  fileName: string,
  mimeType: string,
  fileSize: number
): { valid: boolean; error?: string } {
  const ext = "." + fileName.split(".").pop()?.toLowerCase();

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { valid: false, error: `File type ${ext} is not allowed for security reasons.` };
  }
  if (!ALLOWED_EXTENSIONS.has(ext) && !ALLOWED_MIME_TYPES.has(mimeType)) {
    return { valid: false, error: `Unknown file type. Only medical documents, images, and audio files are accepted.` };
  }

  const limit = getFileSizeLimit(mimeType);
  if (fileSize > limit) {
    const limitMB = Math.round(limit / (1024 * 1024));
    return { valid: false, error: `File size exceeds the ${limitMB}MB limit for this file type.` };
  }

  return { valid: true };
}

// AI extraction JSON schema type
export interface AiExtractionResult {
  patient_name: string | null;
  patient_phone: string | null;
  visit_date: string | null;
  visit_location: string | null;
  reason_for_visit: string | null;
  diagnosis: string | null;
  examination: string | null;
  ultrasound_findings: string | null;
  labs_imaging: string | null;
  pending_results: string | null;
  management_plan: string | null;
  advice: string | null;
  follow_up_plan: string | null;
  reminders: AiReminderSuggestion[];
  unclear_words_or_phrases: string[];
  missing_documentation_items: string[];
  source_language: string;
  risk_flags: string[];
  extraction_status: ExtractionStatus;
}

export interface AiReminderSuggestion {
  reminder_type: ReminderType;
  reminder_title: string;
  patient_name: string | null;
  patient_phone: string | null;
  due_date: string | null;
  due_time: string | null;
  action_required: string;
  source_text: string;
  requires_doctor_confirmation: boolean;
  sensitivity_level: "low" | "medium" | "high";
}
