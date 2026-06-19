# Dr. Rania Patient Intelligence Assistant — TODO

## Phase 1: Schema, Styles & Foundation
- [x] Read integration references (LLM, voice, storage, notifications)
- [x] Design and apply database schema (patients, visits, attachments, reminders, ai_extractions, audit_events, exports)
- [x] Configure global CSS design system (medical, feminine, premium palette)
- [x] Set up Google Fonts (Playfair Display + Inter)
- [x] Configure role enum (doctor / assistant / admin) in users table

## Phase 2: Backend API Routers
- [x] Patient router: create, read, update, delete, duplicate detection, edit history
- [x] Visit router: create, read, update, delete with template fields
- [x] Reminder router: create, update status, list by patient/date, overdue detection
- [x] File/attachment router: upload, link to patient, list, delete
- [x] Audit log router: append-only insert, list (admin only)
- [x] Export router: generate Excel, log export, list exports
- [x] Admin router: user management, settings (doctor only)
- [x] Role-based access control middleware (doctor vs assistant vs admin)
- [x] Direct file upload endpoint (/api/storage/upload)

## Phase 3: AI & Voice Pipeline
- [x] Voice transcription endpoint (Whisper API via built-in helper)
- [x] AI extraction router using LLM with Claude system prompt
- [x] Structured JSON extraction with all required fields
- [x] Reminder auto-detection from AI output
- [x] Relative date → absolute date conversion
- [x] Extraction status flags (Clear / Needs Review / Unclear)
- [x] AI draft approval workflow (doctor must approve before finalizing)

## Phase 4: Frontend UI
- [x] Global design system: medical feminine luxury theme in index.css
- [x] App.tsx routing (dashboard, patients, visits, reminders, files, admin, AI review, export)
- [x] DashboardLayout with sidebar navigation and clinic branding
- [x] Dashboard page: stats, today's visits, overdue reminders, recent patients, quick actions
- [x] Patient list page with search and duplicate warning
- [x] Patient detail page: summary + visit timeline + uploaded files
- [x] New/Edit patient form with all fields
- [x] New/Edit visit form with full template sections
- [x] Visit detail page with AI extraction review interface
- [x] Reminder management page
- [x] File upload page with drag-and-drop and camera capture
- [x] AI review queue page (pending extractions)
- [x] Admin settings page (doctor only)
- [x] Audit log viewer (doctor only)
- [x] Export data page (Excel/TSV)
- [x] PWA manifest

## Phase 5: Integrations
- [x] Excel export with clinic branding (using ExcelJS)
- [x] Telegram bot alerts (instant + daily 8AM summary)
- [x] In-app notifications via Sonner toast system

## Phase 6: Testing & Delivery
- [x] Unit tests: patient CRUD, visit CRUD, reminder status, RBAC enforcement (41 tests passing)
- [x] Unit tests: AI extraction schema validation
- [x] Unit tests: file upload MIME validation
- [x] Unit tests: audit log append-only behavior
- [x] Integration tests: full voice → extraction → approval flow
- [x] Fix all TypeScript errors (0 errors)
- [x] Save checkpoint and deliver to user

## Voice Recording Feature (Added Post-Launch)
- [x] Build reusable VoiceRecorder component (MediaRecorder API, waveform, record/stop/replay)
- [x] Add upload-then-transcribe flow (POST /api/storage/upload → ai.transcribeAudio)
- [x] Integrate VoiceRecorder into AI Review page (voice note input)
- [x] Integrate VoiceRecorder into Visit Form (dictate visit notes)
- [x] Add mic permission error handling and browser compatibility guard
- [x] Test end-to-end: record → transcribe → populate text field

## Universal AI-Assisted Input (All Forms)
- [x] Backend: screenshot OCR + AI patient-data extraction endpoint (ai.extractFromImage)
- [x] Backend: text-paste AI patient-data extraction endpoint (ai.extractFromText for patient fields)
- [x] Backend: screenshot OCR + AI visit-data extraction endpoint (ai.extractVisitFromImage)
- [x] Build AIAssistPanel component (form-level: voice + screenshot upload + text paste → auto-fill)
- [x] Integrate AIAssistPanel into PatientForm (new patient + edit patient)
- [x] Integrate AIAssistPanel into VisitForm (new visit + edit visit)
- [x] Every text/textarea field gets inline mic icon for per-field voice dictation
- [x] Screenshot upload supports camera capture on mobile (accept="image/*,capture")
- [x] AI extraction result preview before applying to form (confirm/edit before auto-fill)
- [x] Test all four contexts: new patient, edit patient, new visit, edit visit

## Phase 7: External Integrations (Telegram, Google Sheets, Google Calendar, Domain)
- [x] Store Telegram Bot Token and Chat ID as app secrets
- [x] Wire Telegram router to send real messages via Telegram Bot API
- [x] Send reminder alerts via Telegram (patient name, phone, what to remind)
- [x] Send daily 7:00 AM Dubai time morning summary via Telegram
- [x] Send new patient registration alert via Telegram
- [x] Set up Google Sheets API integration (googleapis npm package)
- [x] Authorize dr.raniakhalil83@gmail.com via Google OAuth service account or API key
- [x] Create/update Google Sheet with all patient data in real-time on every save
- [x] Daily 7:00 AM Dubai time full sync of all patients to Google Sheet
- [x] Google Sheet columns: all patient fields + visit count + last visit date
- [x] Build Google Calendar integration for dr.raniakhalil83@gmail.com
- [x] Create Google Calendar event on new visit creation
- [x] Create Google Calendar event for each reminder (with alarm)
- [x] AI auto-extraction of reminders from patient data and visit notes
- [x] Expand visit form: add diagnosis fields, lab results, medical questions with AI input
- [x] Configure domain drmousa.clinic (user must bind via Settings → Domains after publish)
- [x] Run full test suite and save checkpoint (41/41 passing)
