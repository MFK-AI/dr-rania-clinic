# Dr. Rania Patient Intelligence Assistant — Technical Documentation

**Version:** 1.1.0 (Standalone Auth)
**Repository:** [github.com/MFK-AI/dr-rania-clinic](https://github.com/MFK-AI/dr-rania-clinic) (private)
**Target Domain:** drmousa.clinic
**Last Updated:** June 20, 2026

---

## 1. Project Overview

Dr. Rania Patient Intelligence Assistant is a **private, standalone OB-GYN clinic management system** built for Dr. Rania Khalil's practice at Prime Hospital and Mazher Center (Dubai). It is a full-stack web application with no dependency on Manus OAuth or any third-party identity provider — all authentication is handled internally with bcrypt + JWT.

The system provides:
- Complete patient record management with obstetric history
- Structured clinical visit documentation
- AI-powered voice, image, and text extraction of clinical notes (Claude Sonnet 4.5 + Whisper)
- Automated reminder tracking with Google Calendar integration
- Real-time Google Sheets sync for backup and reporting
- Telegram Bot alerts for new patients, reminders, and daily summaries
- Excel export for clinic records
- Role-based access control (doctor / assistant / admin)
- Full audit trail of all system actions

---

## 2. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| **Frontend framework** | React | 19 |
| **Styling** | Tailwind CSS | 4 |
| **UI components** | shadcn/ui + Radix UI | latest |
| **Routing** | Wouter | 3.7.1 |
| **State / data fetching** | tRPC + TanStack Query | tRPC 11 |
| **Type safety** | TypeScript + Zod | 5.x |
| **Backend framework** | Express | 4 |
| **Database ORM** | Drizzle ORM | latest |
| **Database** | MySQL / TiDB | 8.x |
| **Auth** | bcryptjs + jose (JWT HS256) | custom |
| **File storage** | AWS S3 (via Manus built-in) | SDK v3 |
| **AI / LLM** | Claude Sonnet 4.5 (via Manus Forge API) | — |
| **Voice transcription** | Whisper-1 (via Manus Forge API) | — |
| **Notifications** | Telegram Bot API | — |
| **Google integration** | Google Sheets + Calendar (via `gws` CLI) | — |
| **Excel export** | ExcelJS | latest |
| **Build tool** | Vite (frontend) + esbuild (server) | — |
| **Test runner** | Vitest | — |
| **Package manager** | pnpm | — |
| **Deployment** | Railway (backend) + Netlify (frontend) | — |

---

## 3. Repository Structure

```
dr-rania-clinic/
├── client/                        # React frontend (Vite)
│   ├── index.html                 # HTML entry — Google Fonts, PWA manifest
│   ├── public/
│   │   ├── manifest.json          # PWA manifest (standalone, theme #8B3A52)
│   │   └── icon-192.png / icon-512.png
│   └── src/
│       ├── _core/hooks/
│       │   └── useAuth.ts         # Auth hook (trpc.auth.me + logout)
│       ├── components/
│       │   ├── AIAssistPanel.tsx  # Universal AI input panel (voice/image/text)
│       │   ├── DashboardLayout.tsx # Sidebar layout with resizable nav
│       │   ├── DashboardLayoutSkeleton.tsx
│       │   ├── VoiceRecorder.tsx  # MediaRecorder + live waveform + Whisper
│       │   ├── ErrorBoundary.tsx
│       │   └── ui/                # shadcn/ui components (40+ components)
│       ├── contexts/
│       │   └── ThemeContext.tsx   # Light theme provider
│       ├── hooks/
│       │   ├── useMobile.tsx
│       │   └── useComposition.ts
│       ├── lib/
│       │   ├── trpc.ts            # tRPC client binding
│       │   └── utils.ts           # cn() utility
│       ├── pages/
│       │   ├── Login.tsx          # Standalone email/password login
│       │   ├── Dashboard.tsx      # Stats overview + today's visits
│       │   ├── PatientList.tsx    # Patient search + list
│       │   ├── PatientDetail.tsx  # Patient profile + visit history
│       │   ├── PatientForm.tsx    # Create/edit patient (AI-assisted)
│       │   ├── VisitDetail.tsx    # Visit record + AI extraction view
│       │   ├── VisitForm.tsx      # Create/edit visit (AI-assisted, per-field mic)
│       │   ├── Reminders.tsx      # Reminder list with status filters
│       │   ├── AiReview.tsx       # AI extraction queue + voice recorder
│       │   ├── FilesUpload.tsx    # File upload to S3 (linked to patient/visit)
│       │   ├── ExportData.tsx     # Excel export generation
│       │   ├── AdminSettings.tsx  # User management + Telegram config
│       │   └── AuditLog.tsx       # Full system audit trail
│       ├── App.tsx                # Routes + AuthGate + ThemeProvider
│       ├── index.css              # Design tokens + global styles
│       └── main.tsx               # React entry point + tRPC provider
│
├── server/
│   ├── _core/
│   │   ├── index.ts               # Express server entry + scheduled endpoints
│   │   ├── context.ts             # tRPC context (JWT cookie → user)
│   │   ├── trpc.ts                # publicProcedure / protectedProcedure / adminProcedure
│   │   ├── env.ts                 # Typed environment variables
│   │   ├── cookies.ts             # Cookie options helper
│   │   ├── llm.ts                 # Manus Forge LLM wrapper (invokeLLM)
│   │   ├── voiceTranscription.ts  # Whisper-1 transcription wrapper
│   │   ├── storageProxy.ts        # S3 storage proxy
│   │   ├── imageGeneration.ts     # Image generation wrapper
│   │   ├── notification.ts        # Owner notification helper
│   │   ├── oauth.ts               # Legacy OAuth routes (passthrough)
│   │   ├── systemRouter.ts        # System health procedure
│   │   └── vite.ts                # Vite dev middleware bridge
│   ├── routers/
│   │   ├── auth.ts                # login / logout / me / createStaff / changePassword
│   │   ├── patients.ts            # CRUD + search + duplicate check + history
│   │   ├── visits.ts              # CRUD + finalize + today/week queries
│   │   ├── reminders.ts           # CRUD + complete/postpone/cancel + calendar
│   │   ├── ai.ts                  # transcribeAndExtract / extractFromText / approve
│   │   ├── files.ts               # getUploadUrl / confirmUpload / list
│   │   ├── exports.ts             # generateExcel / listExports
│   │   ├── admin.ts               # stats / listUsers / updateRole / auditLog
│   │   ├── telegram.ts            # sendAlert / testConnection / dailySummary
│   │   └── sync.ts                # Google Sheets sync + Calendar event creation
│   ├── routers.ts                 # Root router composition (appRouter)
│   ├── db.ts                      # All Drizzle query helpers (596 lines)
│   ├── storage.ts                 # S3 storagePut / storageGet helpers
│   ├── clinic.test.ts             # Comprehensive test suite (36 tests)
│   └── auth.logout.test.ts        # Auth logout test (1 test)
│
├── drizzle/
│   ├── schema.ts                  # Full database schema (232 lines)
│   ├── relations.ts               # Drizzle relations
│   ├── 0000_rare_silverclaw.sql   # Initial migration (users table)
│   └── meta/                      # Drizzle migration metadata
│
├── shared/
│   ├── types.ts                   # Shared TypeScript types + file validation
│   └── const.ts                   # COOKIE_NAME + shared constants
│
├── references/                    # Integration documentation
├── railway.toml                   # Railway deployment config
├── DEPLOYMENT.md                  # Step-by-step Railway + Netlify guide
├── env.example.txt                # All required environment variables
├── todo.md                        # Feature completion tracker
├── package.json                   # Dependencies + scripts
├── vite.config.ts                 # Vite configuration
├── drizzle.config.ts              # Drizzle Kit configuration
└── vitest.config.ts               # Vitest configuration
```

**Total source lines:** ~11,000 (pages + components + server + db + schema)

---

## 4. Database Schema

The database uses **MySQL / TiDB** with Drizzle ORM. All tables use `int` auto-increment primary keys and UTC timestamps.

### 4.1 `users`

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | Auto-increment |
| `openId` | varchar(64) UNIQUE | Internal identifier (`local_<timestamp>_<random>`) |
| `name` | text | Display name |
| `email` | varchar(320) | Login email |
| `passwordHash` | varchar(255) | bcrypt hash (cost 12) |
| `loginMethod` | varchar(64) | `"password"` |
| `role` | enum | `doctor` \| `assistant` \| `admin` |
| `telegramChatId` | varchar(64) | Personal Telegram Chat ID |
| `isActive` | boolean | Soft-disable accounts |
| `createdAt` | timestamp | — |
| `updatedAt` | timestamp ON UPDATE | — |
| `lastSignedIn` | timestamp | Updated on each login |

**Seeded account:** `dr.raniakhalil83@gmail.com` / `DrRania2026!` / role: `doctor`

### 4.2 `patients`

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | — |
| `name` | varchar(255) NOT NULL | — |
| `phone` | varchar(32) NOT NULL UNIQUE | Duplicate check on create/update |
| `age` | int | — |
| `dateOfBirth` | varchar(20) | ISO date string |
| `maritalStatus` | enum | `single` \| `married` \| `divorced` \| `widowed` |
| `visitLocation` | enum | `Prime Hospital` \| `Mazher Center` |
| `pregnancyStatus` | varchar(100) | Free text (e.g. "Pregnant 28 weeks") |
| `gravida` | int | Obstetric history |
| `para` | int | Obstetric history |
| `allergies` | text | — |
| `importantNotes` | text | Pinned clinical notes |
| `isDeleted` | boolean | Soft delete |
| `deletedAt` / `deletedBy` | timestamp / int | Soft delete metadata |
| `createdBy` / `updatedBy` | int | User ID references |
| `createdAt` / `updatedAt` | timestamp | — |

### 4.3 `patient_history`

Tracks field-level changes to patient records.

| Column | Type |
|---|---|
| `patientId` | int |
| `changedBy` | int |
| `changedAt` | timestamp |
| `fieldName` | varchar(100) |
| `oldValue` / `newValue` | text |

### 4.4 `visits`

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | — |
| `patientId` | int NOT NULL | FK → patients |
| `visitDate` | varchar(20) | ISO date string |
| `visitLocation` | enum | `Prime Hospital` \| `Mazher Center` |
| `visitType` | varchar(100) | `new_patient` \| `follow_up` \| `emergency` \| `procedure` \| `prenatal` \| `postnatal` |
| `reasonForVisit` | text | — |
| `diagnosis` | text | — |
| `examination` | text | Physical examination findings |
| `ultrasoundFindings` | text | — |
| `labsImaging` | text | — |
| `pendingResults` | text | — |
| `managementPlan` | text | — |
| `medications` | text | — |
| `advice` | text | Patient advice |
| `followUpPlan` | text | — |
| `status` | enum | `draft` → `ai_review` → `final` |
| `aiExtractionId` | int | FK → ai_extractions |
| `isDeleted` | boolean | Soft delete |
| `createdBy` / `updatedBy` | int | — |

### 4.5 `visit_history`

JSON snapshot of entire visit record on each edit.

### 4.6 `ai_extractions`

| Column | Type | Notes |
|---|---|---|
| `sourceType` | enum | `voice` \| `screenshot` \| `document` \| `text` |
| `sourceFileKey` | varchar(512) | S3 key of source audio/image |
| `transcript` | text | Whisper output |
| `extractedData` | json | Full `AiExtractionResult` object |
| `approvedBy` | int | User who approved |
| `approvedAt` | timestamp | — |

### 4.7 `attachments`

| Column | Type | Notes |
|---|---|---|
| `patientId` / `visitId` / `aiExtractionId` | int | Optional links |
| `fileName` | varchar(255) | Original filename |
| `fileKey` | varchar(512) | S3 key |
| `fileUrl` | varchar(1024) | S3 URL |
| `mimeType` | varchar(128) | — |
| `fileSize` | int | Bytes |
| `uploadedBy` | int | User ID |

### 4.8 `reminders`

| Column | Type | Notes |
|---|---|---|
| `patientId` | int NOT NULL | — |
| `visitId` | int | Optional link to visit |
| `reminderType` | enum | `call_patient` \| `inform_result` \| `check_lab` \| `check_imaging` \| `follow_up` \| `medication_review` \| `procedure_booking` \| `custom` |
| `title` | varchar(255) | — |
| `notes` | text | — |
| `dueDate` | varchar(20) | ISO date |
| `dueTime` | varchar(10) | Optional time |
| `status` | enum | `pending` \| `done` \| `cancelled` \| `postponed` \| `overdue` |
| `isRepeating` | boolean | — |
| `requiresDoctorReview` | boolean | — |
| `calendarEventId` | varchar(255) | Google Calendar event ID |
| `completedBy` / `completedAt` | int / timestamp | — |
| `completionNote` | text | — |
| `postponedTo` | varchar(20) | New due date after postpone |
| `sourceText` | text | Original AI-extracted text |

### 4.9 `exports`

| Column | Type | Notes |
|---|---|---|
| `exportType` | enum | `excel` \| `pdf` |
| `fileKey` / `fileUrl` | varchar | S3 reference |
| `generatedBy` | int | User ID |
| `patientCount` / `visitCount` | int | — |
| `status` | enum | `pending` \| `completed` \| `failed` |

### 4.10 `audit_events`

| Column | Type |
|---|---|
| `userId` | int |
| `action` | varchar(64) |
| `entityType` / `entityId` | varchar / int |
| `metadata` | json |
| `ipAddress` | varchar(64) |
| `userAgent` | text |

**Tracked actions:** `login`, `logout`, `view_patient`, `create_patient`, `edit_patient`, `delete_patient`, `create_visit`, `edit_visit`, `delete_visit`, `approve_ai_extraction`, `upload_file`, `export_excel`, `create_reminder`, `complete_reminder`, `postpone_reminder`, `cancel_reminder`, `telegram_alert`, `view_audit_log`, `manage_users`

### 4.11 `telegram_alerts`

Log of all Telegram messages sent (instant alerts and daily summaries).

---

## 5. Authentication System

The app uses a **fully standalone email/password authentication** system with no external OAuth dependency.

### 5.1 Flow

```
POST /api/trpc/auth.login
  → Validate email + password against users table (bcrypt.compare)
  → Sign HS256 JWT (1 year expiry, sub = userId)
  → Set HttpOnly cookie: app_session_id
  → Return { success, user }

GET /api/trpc/auth.me
  → Parse app_session_id cookie
  → Verify JWT → extract userId
  → Load user from DB
  → Return User | null

POST /api/trpc/auth.logout
  → Clear app_session_id cookie
  → Return { success }
```

### 5.2 JWT Configuration

| Property | Value |
|---|---|
| Algorithm | HS256 |
| Secret | `JWT_SECRET` env var |
| Expiry | 365 days |
| Cookie name | `app_session_id` |
| Cookie flags | HttpOnly, SameSite=Lax, Secure (production) |

### 5.3 tRPC Procedure Guards

| Procedure type | Guard |
|---|---|
| `publicProcedure` | None — anyone can call |
| `protectedProcedure` | Requires valid session cookie → `ctx.user` is non-null |
| `adminProcedure` | Requires `ctx.user.role === 'admin'` |

Additional role checks within `protectedProcedure`:
- `requireDoctor(role)` — throws FORBIDDEN if role is not `doctor` or `admin`
- `requireDoctorOrAssistant(role)` — throws FORBIDDEN if role is `user`

### 5.4 Staff Account Management

- `auth.createStaff` — Doctor/admin creates new staff accounts (name, email, password, role)
- `auth.changePassword` — Any authenticated user changes their own password (requires current password)
- `admin.updateUserRole` — Doctor/admin changes any user's role
- `admin.listUsers` — Doctor/admin sees all accounts

---

## 6. API Surface (tRPC Procedures)

All procedures are under `/api/trpc`. The full router is composed in `server/routers.ts`.

### 6.1 `auth.*`

| Procedure | Type | Access | Description |
|---|---|---|---|
| `auth.login` | mutation | public | Email + password login, sets cookie |
| `auth.logout` | mutation | public | Clears session cookie |
| `auth.me` | query | public | Returns current user or null |
| `auth.createStaff` | mutation | doctor/admin | Creates new staff account |
| `auth.changePassword` | mutation | protected | Changes own password |

### 6.2 `patients.*`

| Procedure | Type | Access | Description |
|---|---|---|---|
| `patients.list` | query | protected | Paginated patient list |
| `patients.search` | query | protected | Full-text search (name/phone) |
| `patients.getById` | query | protected | Single patient + audit log |
| `patients.checkDuplicate` | query | protected | Check phone/name before create |
| `patients.create` | mutation | doctor/assistant | Create patient, sync to Sheets |
| `patients.update` | mutation | doctor/assistant | Update patient, track history |
| `patients.delete` | mutation | doctor | Soft delete |
| `patients.getHistory` | query | protected | Field-level change history |

### 6.3 `visits.*`

| Procedure | Type | Access | Description |
|---|---|---|---|
| `visits.listByPatient` | query | protected | All visits for a patient |
| `visits.getById` | query | protected | Single visit + attachments |
| `visits.getTodays` | query | protected | Today's visits (Dubai timezone) |
| `visits.getThisWeek` | query | protected | This week's visits |
| `visits.getPendingAiReviews` | query | protected | Visits with `ai_review` status |
| `visits.create` | mutation | doctor/assistant | Create visit, sync to Sheets + Calendar |
| `visits.update` | mutation | doctor/assistant | Update visit, save snapshot |
| `visits.finalize` | mutation | doctor | Set status to `final` |
| `visits.delete` | mutation | doctor | Soft delete |

### 6.4 `reminders.*`

| Procedure | Type | Access | Description |
|---|---|---|---|
| `reminders.listByPatient` | query | protected | Reminders for a patient |
| `reminders.getTodays` | query | protected | Today's reminders |
| `reminders.getOverdue` | query | protected | Overdue reminders |
| `reminders.listAll` | query | protected | All reminders (paginated) |
| `reminders.create` | mutation | doctor/assistant | Create + sync to Sheets + Calendar + Telegram |
| `reminders.complete` | mutation | doctor/assistant | Mark done with optional note |
| `reminders.postpone` | mutation | doctor/assistant | Reschedule to new date |
| `reminders.cancel` | mutation | doctor/assistant | Cancel reminder |

### 6.5 `ai.*`

| Procedure | Type | Access | Description |
|---|---|---|---|
| `ai.transcribeAndExtract` | mutation | doctor/assistant | Upload audio → Whisper → Claude extraction |
| `ai.extractFromText` | mutation | doctor/assistant | Text → Claude extraction |
| `ai.extractPatientFromImage` | mutation | doctor/assistant | Image → Claude vision → patient data |
| `ai.extractPatientFromText` | mutation | doctor/assistant | Text → Claude → patient data |
| `ai.extractVisitFromImage` | mutation | doctor/assistant | Image → Claude vision → visit data |
| `ai.extractRemindersFromVisit` | mutation | doctor/assistant | Visit notes → Claude → reminder suggestions |
| `ai.getById` | query | protected | Get extraction by ID |
| `ai.listPending` | query | protected | Extractions awaiting approval |
| `ai.approve` | mutation | doctor | Approve extraction, apply to visit, create reminders |

### 6.6 `files.*`

| Procedure | Type | Access | Description |
|---|---|---|---|
| `files.getUploadUrl` | mutation | doctor/assistant | Validate file + generate S3 key |
| `files.confirmUpload` | mutation | doctor/assistant | Save attachment metadata after upload |
| `files.listByPatient` | query | doctor/assistant | All attachments for a patient |
| `files.listByVisit` | query | doctor/assistant | All attachments for a visit |

### 6.7 `admin.*`

| Procedure | Type | Access | Description |
|---|---|---|---|
| `admin.getDashboardStats` | query | protected | 7 KPI counters for dashboard |
| `admin.listUsers` | query | doctor | All user accounts |
| `admin.updateUserRole` | mutation | doctor | Change user role |
| `admin.updateTelegram` | mutation | doctor | Save Telegram Chat ID |
| `admin.listAuditEvents` | query | doctor | Paginated audit log |
| `admin.listExports` | query | doctor | Export history |

### 6.8 `exports.*`

| Procedure | Type | Access | Description |
|---|---|---|---|
| `exports.generateExcel` | mutation | doctor | Generate .xlsx with Patients + Visits sheets |
| `exports.listExports` | query | doctor | Export history with download URLs |

### 6.9 `telegram.*`

| Procedure | Type | Access | Description |
|---|---|---|---|
| `telegram.sendAlert` | mutation | doctor/assistant | Send custom alert |
| `telegram.sendReminderAlert` | mutation | doctor/assistant | Send reminder alert |
| `telegram.sendNewPatientAlert` | mutation | doctor/assistant | Send new patient alert |
| `telegram.sendDailySummary` | mutation | doctor | Send daily summary manually |
| `telegram.testConnection` | mutation | doctor | Test bot connection |

### 6.10 `sync.*`

| Procedure | Type | Access | Description |
|---|---|---|---|
| `sync.getSheetUrl` | query | protected | Returns Google Sheets URL |
| `sync.syncPatient` | mutation | doctor | Force sync single patient to Sheets |
| `sync.runFullSync` | mutation | doctor | Sync all patients/visits/reminders |
| `sync.createVisitEvent` | mutation | doctor/assistant | Create Google Calendar event for visit |
| `sync.createReminderEvent` | mutation | doctor/assistant | Create Google Calendar event for reminder |

---

## 7. Frontend Architecture

### 7.1 Routing

All routes are defined in `client/src/App.tsx` using Wouter.

| Path | Component | Access |
|---|---|---|
| `/login` | `Login` | Public |
| `/` | `Dashboard` | Protected |
| `/patients` | `PatientList` | Protected |
| `/patients/new` | `PatientForm` | Protected |
| `/patients/:id` | `PatientDetail` | Protected |
| `/patients/:id/edit` | `PatientForm` | Protected |
| `/visits/new` | `VisitForm` | Protected |
| `/visits/:id` | `VisitDetail` | Protected |
| `/visits/:id/edit` | `VisitForm` | Protected |
| `/reminders` | `Reminders` | Protected |
| `/ai-review` | `AiReview` | Protected |
| `/files` | `FilesUpload` | Protected |
| `/admin` | `AdminSettings` | Protected (doctor/admin) |
| `/audit` | `AuditLog` | Protected (doctor/admin) |
| `/export` | `ExportData` | Protected (doctor/admin) |

The `AuthGate` component wraps all protected routes. It calls `trpc.auth.me.useQuery()` and redirects to `/login` if the user is not authenticated.

### 7.2 Sidebar Navigation

The `DashboardLayout` component provides a **resizable sidebar** (200–400px, persisted in `localStorage`) with two sections:

**Main navigation:**
- Dashboard (`/`)
- Patients (`/patients`)
- Reminders (`/reminders`)
- AI Review (`/ai-review`)
- Files (`/files`)
- Export Data (`/export`)

**Admin section** (doctor/admin only):
- Admin Settings (`/admin`)
- Audit Log (`/audit`)

### 7.3 Key Pages

**Dashboard** — Displays 7 live KPI cards (Today's Visits, Visits This Week, Pending Reminders, Overdue, New Patients This Week, AI Reviews Pending, Exports Generated) plus a live list of today's visits and overdue reminders.

**PatientList** — Infinite-scroll patient list with live search (triggers at 2+ characters, calls `patients.search`). Shows patient name, phone, location, and last visit date.

**PatientDetail** — Shows patient demographics, obstetric history (gravida/para), allergies, important notes, pending reminders alert banner, full visit history timeline, and file attachments.

**PatientForm** — Create/edit patient with AI-assisted input via `AIAssistPanel` (voice/image/text → auto-fill all fields). Per-field inline microphone buttons on every text input.

**VisitForm** — Create/edit visit with two sections:
- **Clinical findings:** Examination, Ultrasound Findings, Labs/Imaging, Pending Results, Diagnosis
- **Management:** Management Plan, Medications, Advice, Follow-up Plan
- Full `AIAssistPanel` at top + per-field `FieldMicButton` on every textarea
- Voice dictation via `VoiceRecorder` component with live waveform

**VisitDetail** — Read-only view of a finalized visit with status badge, all clinical fields, AI extraction link, and file attachments.

**Reminders** — Filterable list by status (all / pending / overdue / done / cancelled / postponed). Shows overdue count badge. Actions: Complete (with note), Postpone (pick new date), Cancel. Create new reminder dialog.

**AiReview** — Queue of pending AI extractions awaiting doctor approval. Each card shows extracted data with risk flags and unclear phrases highlighted. Doctor can edit fields before approving. Includes voice recorder for new extractions.

**FilesUpload** — Upload files linked to a patient and optional visit. Accepts PDF, images (JPG/PNG/HEIC), Word, Excel, CSV, audio (MP3/M4A/WAV/AAC/WebM). Size limits: images 20MB, audio 100MB, documents 50MB.

**ExportData** — Generate `.xlsx` export with Cover sheet, Patients sheet, and Visits sheet. Download link auto-opens after generation. Shows export history.

**AdminSettings** — User management table (change roles via dropdown), Telegram Chat ID configuration.

**AuditLog** — Paginated table of all system actions with timestamp, user, action type, entity, and metadata.

### 7.4 AI Input Components

**`AIAssistPanel`** (`client/src/components/AIAssistPanel.tsx`, 663 lines)

Universal AI-powered input assistant used on `PatientForm` and `VisitForm`. Provides three input modes:

1. **Voice recording** → upload to S3 → Whisper transcription → Claude extraction → preview diff → apply to form
2. **Screenshot/image upload** → upload to S3 → Claude vision OCR → preview diff → apply to form
3. **Free text paste** → Claude extraction → preview diff → apply to form

Supports two modes: `"patient"` (extracts patient demographics) and `"visit"` (extracts clinical data).

**`VoiceRecorder`** (`client/src/components/VoiceRecorder.tsx`, 471 lines)

Standalone voice recorder with:
- Browser `MediaRecorder` API with codec fallback (`webm/opus` → `webm` → `ogg`)
- Live animated waveform (32 bars, Web Audio API `AnalyserNode`)
- Duration timer
- 15MB size guard (Whisper limit is 16MB)
- States: `idle` → `requesting` → `recording` → `stopped` → `uploading` → `processing` → `done` / `error`
- Uploads to `/api/storage/upload` then calls `ai.transcribeAndExtract`

**`FieldMicButton`** (inline in `PatientForm` and `VisitForm`)

Per-field inline microphone button. Records audio, uploads, calls `ai.transcribeAndExtract`, and populates only the specific field it is attached to.

---

## 8. Design System

### 8.1 Color Palette

The design uses a **Medical Feminine Luxury** palette defined in OKLCH color space in `client/src/index.css`.

| Token | OKLCH Value | Usage |
|---|---|---|
| `--color-background` | `oklch(0.985 0.005 300)` | Near-white lavender page background |
| `--color-foreground` | `oklch(0.18 0.02 270)` | Deep navy text |
| `--color-primary` | `oklch(0.52 0.16 0)` | Rose-mauve (buttons, links, active states) |
| `--color-secondary` | `oklch(0.93 0.03 290)` | Soft lavender |
| `--color-accent` | `oklch(0.92 0.04 10)` | Warm blush |
| `--color-destructive` | `oklch(0.55 0.22 25)` | Coral red (errors, delete) |
| `--color-sidebar` | `oklch(0.18 0.025 270)` | Deep navy sidebar background |
| `--color-sidebar-primary` | `oklch(0.72 0.16 0)` | Rose active nav item |
| `--color-success` | `oklch(0.55 0.15 145)` | Green (done status) |
| `--color-warning` | `oklch(0.72 0.16 70)` | Amber (pending status) |
| `--color-info` | `oklch(0.55 0.15 220)` | Blue (postponed status) |

**Theme:** Light only (`ThemeProvider defaultTheme="light"`). Dark mode is not implemented.

**PWA theme color:** `#8B3A52` (deep rose)

### 8.2 Typography

| Font | Usage | Weights |
|---|---|---|
| **Inter** | Body text, UI labels, data | 400, 500, 600, 700 |
| **Playfair Display** | Headings (`h1`, `h2`, `h3`) | 500, 600, 700 |

Both fonts are loaded via Google Fonts CDN in `client/index.html`.

### 8.3 Status Badge Classes

| Class | Color | Usage |
|---|---|---|
| `.status-pending` | Amber | Pending reminders/visits |
| `.status-done` | Green | Completed items |
| `.status-overdue` | Coral red | Overdue reminders |
| `.status-cancelled` | Grey | Cancelled items |
| `.status-postponed` | Blue | Postponed reminders |

### 8.4 Animation Tokens

| Token | Value | Usage |
|---|---|---|
| `--ease-out-snappy` | `cubic-bezier(0.23, 1, 0.32, 1)` | Entering UI elements |
| `--ease-in-out-smooth` | `cubic-bezier(0.77, 0, 0.175, 1)` | Moving/morphing elements |

Button active state: `transform: scale(0.97)` at 160ms ease-out.

### 8.5 Shadows

| Token | Value |
|---|---|
| `--shadow-sm` | `0 1px 3px oklch(0.18 0.02 270 / 0.08)` |
| `--shadow-md` | `0 4px 12px oklch(0.18 0.02 270 / 0.1)` |
| `--shadow-lg` | `0 8px 24px oklch(0.18 0.02 270 / 0.12)` |
| `--shadow-xl` | `0 16px 40px oklch(0.18 0.02 270 / 0.15)` |

---

## 9. AI Integration

### 9.1 LLM Model

**Claude Sonnet 4.5** via Manus Forge API (`BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY`).

### 9.2 Voice Transcription

**Whisper-1** via Manus Forge API. Input: audio file (WebM/MP3/M4A/WAV, max 16MB). Output: transcript text.

The Whisper prompt is: `"OB-GYN clinical notes, mixed Arabic and English medical terminology"` to improve accuracy for bilingual clinical dictation.

### 9.3 Clinical Extraction System Prompt

The main extraction prompt (`EXTRACTION_SYSTEM_PROMPT`) instructs Claude to:
- Act as the AI extraction engine for Dr. Rania Khalil's OB-GYN clinic
- Accept input in Arabic, English, or mixed Arabic-English
- Output structured JSON only (English)
- Never make clinical decisions — only extract and structure what is present
- Flag unclear words, missing documentation items, and risk flags

**Extracted fields:**
`patient_name`, `patient_phone`, `visit_date`, `visit_location`, `reason_for_visit`, `diagnosis`, `examination`, `ultrasound_findings`, `labs_imaging`, `pending_results`, `management_plan`, `advice`, `follow_up_plan`, `reminders[]`, `unclear_words_or_phrases[]`, `missing_documentation_items[]`, `source_language`, `risk_flags[]`, `extraction_status`

**Risk flags:** `patient_identity_unclear`, `date_unclear`, `clinical_plan_unclear`, `pending_result_detected`, `reminder_detected`, `handwriting_unclear`, `mixed_language_input`, `possible_duplicate_patient`, `source_quality_low`

### 9.4 Visit Status Lifecycle

```
draft
  └─→ ai_review   (when AI extraction is linked to visit)
        └─→ final  (when doctor approves extraction or manually finalizes)
```

### 9.5 AI Approval Flow

1. Doctor/assistant submits voice/image/text to `ai.transcribeAndExtract` or `ai.extractFromText`
2. Claude returns structured `AiExtractionResult` JSON
3. Extraction saved to `ai_extractions` table, visit status set to `ai_review`
4. Doctor reviews in AI Review page, edits any fields
5. Doctor calls `ai.approve` with `finalData` + `approvedReminders[]`
6. Visit updated with all clinical fields, status set to `final`
7. Approved reminders created in `reminders` table
8. Google Calendar events created for each reminder

---

## 10. External Integrations

### 10.1 Telegram Bot

**Bot token:** `8428776079:AAEVYptUF4m5JiBCFGShxVPdfNu_tsRAUZI`
**Chat ID:** `1250323159`

**Automatic alerts sent on:**
- New patient registration → `formatNewPatientAlert` (HTML format)
- New reminder created → `formatReminderAlert` (HTML format)
- New visit recorded → `formatVisitAlert` (HTML format)
- Daily 7AM Dubai summary → `formatDailySummary` (Markdown format, triggered by `/api/scheduled/daily-sync`)

**Daily summary includes:** Today's visit count, overdue reminders count, total patient count, today's visit list with patient names.

### 10.2 Google Sheets Sync

**Spreadsheet ID:** `1V9fsOxQwxNXmUn5PrjQhUGKaO48whZYVTIM2cp4ljOo`
**Shared with:** `dr.raniakhalil83@gmail.com`

Uses the `gws` CLI (pre-configured Google OAuth) via `child_process.execFile`.

**Three tabs synced:**

**Patients tab columns:** ID, Name, Phone, Age, Date of Birth, Marital Status, Pregnancy Status, Gravida, Para, Allergies, Important Notes, Location, Visit Count, Last Visit Date, Created, Updated

**Visits tab columns:** Visit ID, Patient ID, Date, Location, Type, Reason, Diagnosis, Management Plan, Medications, Follow-Up Plan, Status

**Reminders tab columns:** Reminder ID, Patient ID, Patient Name, Phone, Type, Title, Due Date, Status, Notes

**Real-time sync:** Every new patient, visit, and reminder is synced to the sheet immediately on creation (fire-and-forget, errors do not block the user).

**Full sync:** `sync.runFullSync` re-syncs all records. Also runs at 7AM Dubai time via the daily cron endpoint.

### 10.3 Google Calendar

**Calendar ID:** `dr.raniakhalil83@gmail.com`

Calendar events are created automatically when:
- A new visit is saved (`createVisitCalendarEvent`)
- A new reminder is saved (`createReminderCalendarEvent`)

Uses the `gws` CLI to create events with title, description, start/end time, and location.

### 10.4 File Storage (S3)

All uploaded files are stored in S3 via the Manus built-in storage API (`storagePut` / `storageGet`). Files are never stored in the database — only the S3 key and URL are persisted in the `attachments` table.

**Upload flow:**
1. Client calls `files.getUploadUrl` (validates file type/size, generates S3 key)
2. Client POSTs raw bytes to `/api/storage/upload?fileKey=<key>`
3. Server calls `storagePut(key, bytes, contentType)` → returns `{ key, url }`
4. Client calls `files.confirmUpload` with the returned URL to save metadata

**Allowed file types:** PDF, JPG, PNG, HEIC, DOCX, XLSX, CSV, MP3, M4A, WAV, AAC, WebM

**Blocked extensions:** `.exe`, `.bat`, `.cmd`, `.js`, `.html`, `.php`, `.zip`, `.rar`, `.7z`, `.apk`, `.sh`, `.py`, `.rb`, `.ps1`, `.vbs`, `.msi`

### 10.5 Excel Export

Generated using **ExcelJS** with three worksheets:

**Cover sheet:** Clinic name, generation date, total patients, total visits.

**Patients sheet columns:** ID, Full Name, Phone, Age, Location, Marital Status, Gravida/Para, Allergies, Important Notes, Created

**Visits sheet columns:** Visit ID, Patient ID, Date, Location, Type, Reason, Diagnosis, Management Plan, Medications, Follow-Up Plan, Status

The `.xlsx` file is uploaded to S3 and a download URL is returned. The frontend auto-opens the download link.

---

## 11. Scheduled Tasks

The server exposes a POST endpoint at `/api/scheduled/daily-sync` that:
1. Runs `runFullDailySync()` — syncs all patients, visits, and reminders to Google Sheets
2. Calls `formatDailySummary()` — builds a Telegram message with today's stats
3. Sends the summary to the configured Telegram chat

This endpoint is designed to be triggered by an external cron service (Railway cron, Upstash, or similar) at **7:00 AM Dubai time (UTC+4)**.

---

## 12. Role-Based Access Control

| Feature | `doctor` | `assistant` | `admin` |
|---|---|---|---|
| View dashboard | ✓ | ✓ | ✓ |
| View/search patients | ✓ | ✓ | ✓ |
| Create/edit patients | ✓ | ✓ | ✓ |
| Delete patients | ✓ | — | ✓ |
| Create/edit visits | ✓ | ✓ | ✓ |
| Finalize/delete visits | ✓ | — | ✓ |
| Create/manage reminders | ✓ | ✓ | ✓ |
| AI extraction + approval | ✓ | extract only | ✓ |
| Upload files | ✓ | ✓ | ✓ |
| Generate Excel export | ✓ | — | ✓ |
| Admin settings | ✓ | — | ✓ |
| Audit log | ✓ | — | ✓ |
| Manage user roles | ✓ | — | ✓ |
| Create staff accounts | ✓ | — | ✓ |

---

## 13. Test Coverage

**Test runner:** Vitest
**Total tests:** 37 (36 in `clinic.test.ts` + 1 in `auth.logout.test.ts`)
**Status:** All passing, 0 TypeScript errors

| Suite | Tests | Coverage |
|---|---|---|
| `auth` | 3 | me (unauthenticated), me (authenticated), logout |
| `patients` | 5 | list, list (blocked), getById, create (doctor), create (blocked), update |
| `visits` | 5 | getById, create (doctor), create (blocked), finalize, getPendingAiReviews |
| `reminders` | 4 | listAll, create, complete, cancel |
| `ai` | 3 | listPending, extractFromText, extractFromText (blocked) |
| `files` | 4 | getUploadUrl, reject oversized, reject disallowed MIME, listByPatient |
| `admin` | 6 | getDashboardStats, getDashboardStats (blocked), listUsers (blocked), listUsers (admin), updateUserRole, listAuditEvents |
| `exports` | 2 | listExports (doctor), listExports (blocked) |
| `telegram` | 2 | testConnection, sendAlert (blocked) |
| `RBAC boundaries` | 3 | Multiple operations blocked for unauthenticated users |

---

## 14. Build and Deployment

### 14.1 Scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `NODE_ENV=development tsx watch server/_core/index.ts` | Development server with hot reload |
| `build` | `vite build && esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist` | Production build |
| `start` | `NODE_ENV=production node dist/index.js` | Start production server |
| `test` | `vitest run` | Run all tests |
| `drizzle-kit generate` | — | Generate migration SQL from schema changes |

### 14.2 Railway Configuration (`railway.toml`)

```toml
[build]
builder = "nixpacks"
buildCommand = "pnpm install --frozen-lockfile && pnpm run build"

[deploy]
startCommand = "node dist/index.js"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3

[environments.production.deploy]
numReplicas = 1
```

**Important:** The esbuild output is a single flat file at `dist/index.js` (not `dist/server/_core/index.js`).

### 14.3 Required Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | MySQL connection string (`mysql://user:pass@host:3306/db`) |
| `JWT_SECRET` | 32+ character random string for JWT signing |
| `NODE_ENV` | `production` |
| `BUILT_IN_FORGE_API_URL` | Manus Forge API base URL |
| `BUILT_IN_FORGE_API_KEY` | Server-side Forge API key |
| `VITE_FRONTEND_FORGE_API_URL` | Manus Forge API URL (frontend) |
| `VITE_FRONTEND_FORGE_API_KEY` | Frontend Forge API key |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token |
| `TELEGRAM_CHAT_ID` | Telegram chat ID for alerts |

### 14.4 Database Migration

After first deploy, run in Railway shell:
```bash
pnpm drizzle-kit push
```

Then seed Dr. Rania's account:
```sql
INSERT INTO users (openId, name, email, passwordHash, loginMethod, role, isActive)
VALUES (
  'local_dr_rania_001',
  'Dr. Rania Khalil',
  'dr.raniakhalil83@gmail.com',
  '$2b$12$<bcrypt_hash_of_DrRania2026!>',
  'password',
  'doctor',
  true
);
```

### 14.5 Netlify Frontend Deployment

Build command: `pnpm run build`
Publish directory: `dist/client`

Required `netlify.toml`:
```toml
[[redirects]]
  from = "/api/*"
  to = "https://<railway-url>/api/:splat"
  status = 200
  force = true

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

## 15. Git History

| Commit | Description |
|---|---|
| `cb0c880` | Initial project bootstrap |
| `8f5968d` | Complete Dr. Rania Patient Intelligence Assistant — v1.0.0 |
| `93ae2e5` | VoiceRecorder component with MediaRecorder API, live waveform, Whisper pipeline |
| `178b8b6` | Universal AI-assisted input: AIAssistPanel (voice + screenshot + text) on PatientForm and VisitForm |
| `7f176c1` | Full integration build: Telegram Bot, Google Sheets sync, Google Calendar, AI reminder extraction |
| `f07d7c9` | Branding update: Dr. Rania Khalil / drmousa.clinic across all surfaces |
| `21217d1` | Standalone Auth Migration v1.1.0 — replaced Manus OAuth with bcrypt + JWT |
| `9112753` | Fix: Login race condition resolved (auth.me refetch before navigate) |
| `e967c23` | Docs: DEPLOYMENT.md + env.example.txt |
| `353e5f6` | Railway deployment config (railway.toml) |
| `d4bc919` | Fix: correct Railway start command to `node dist/index.js` |

---

## 16. Initial Login Credentials

| Field | Value |
|---|---|
| URL | `https://drmousa.clinic/login` (after deployment) |
| Email | `dr.raniakhalil83@gmail.com` |
| Password | `DrRania2026!` |
| Role | `doctor` |

**Change the password after first login** using Admin Settings → Change Password.

---

*End of Technical Documentation*
