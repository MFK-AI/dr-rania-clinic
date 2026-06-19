import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createExportRecord,
  getDb,
  listExports,
  listPatients,
  logAuditEvent,
  updateExportRecord,
} from "../db";
import { storagePut } from "../storage";
import { visits } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

function requireDoctor(role: string) {
  if (role !== "doctor" && role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the doctor can export data." });
  }
}

// ─── Branding constants ───────────────────────────────────────────────────────
const MAUVE_ARGB = "FFB8A9C9";
const PLUM_ARGB  = "FF4A3F5C";
const WHITE_ARGB = "FFFDF8FF";

async function buildExcelBuffer(
  patientList: Awaited<ReturnType<typeof listPatients>>,
  allVisits: Record<string, unknown>[],
  includePatients: boolean,
  includeVisits: boolean
): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Dr. Rania Khalil Clinic — drmousa.clinic";
  workbook.created = new Date();
  workbook.modified = new Date();

  // ── Cover sheet ───────────────────────────────────────────────────────────
  const cover = workbook.addWorksheet("Cover");
  cover.mergeCells("A1:F1");
  const titleCell = cover.getCell("A1");
  titleCell.value = "Dr. Rania Khalil Clinic — Patient Records Export";
  titleCell.font = { bold: true, size: 18, color: { argb: PLUM_ARGB }, name: "Calibri" };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MAUVE_ARGB } };
  cover.getRow(1).height = 50;

  cover.getCell("A3").value = "Generated:";
  cover.getCell("A3").font = { bold: true };
  cover.getCell("B3").value = new Date().toLocaleString("en-SA");
  cover.getCell("A4").value = "Total Patients:";
  cover.getCell("A4").font = { bold: true };
  cover.getCell("B4").value = patientList.length;
  cover.getCell("A5").value = "Total Visits:";
  cover.getCell("A5").font = { bold: true };
  cover.getCell("B5").value = allVisits.length;
  cover.getCell("A7").value = "CONFIDENTIAL — For clinical use only";
  cover.getCell("A7").font = { italic: true, color: { argb: "FFAA0000" }, size: 10 };
  cover.columns = [{ width: 22 }, { width: 40 }];

  // ── Helper: style a header row ────────────────────────────────────────────
  function styleHeader(ws: InstanceType<typeof ExcelJS.Workbook>["worksheets"][0], colCount: number) {
    const row = ws.getRow(1);
    row.height = 28;
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MAUVE_ARGB } };
      cell.font = { bold: true, color: { argb: PLUM_ARGB }, size: 11, name: "Calibri" };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = { bottom: { style: "medium", color: { argb: PLUM_ARGB } } };
    }
  }

  // ── Helper: style a data row ──────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function styleDataRow(row: any, colCount: number, isEven: boolean) {
    row.height = 20;
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      if (isEven) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE_ARGB } };
      }
      cell.font = { size: 10, name: "Calibri" };
      cell.alignment = { vertical: "middle" };
    }
  }

  // ── Patients sheet ────────────────────────────────────────────────────────
  if (includePatients && patientList.length > 0) {
    const pSheet = workbook.addWorksheet("Patients");
    pSheet.columns = [
      { header: "ID",               key: "id",             width: 8  },
      { header: "Full Name",        key: "name",           width: 28 },
      { header: "Phone",            key: "phone",          width: 16 },
      { header: "Age",              key: "age",            width: 8  },
      { header: "Location",         key: "visitLocation",  width: 18 },
      { header: "Marital Status",   key: "maritalStatus",  width: 16 },
      { header: "Gravida / Para",   key: "gravidaPara",    width: 16 },
      { header: "Allergies",        key: "allergies",      width: 24 },
      { header: "Important Notes",  key: "importantNotes", width: 36 },
      { header: "Created",          key: "createdAt",      width: 16 },
    ];
    styleHeader(pSheet, 10);

    patientList.forEach((p, idx) => {
      const row = pSheet.addRow({
        id:             p.id,
        name:           p.name,
        phone:          p.phone ?? "",
        age:            p.age ?? "",
        visitLocation:  p.visitLocation ?? "",
        maritalStatus:  p.maritalStatus ?? "",
        gravidaPara:    [p.gravida != null ? `G${p.gravida}` : "", p.para != null ? `P${p.para}` : ""].filter(Boolean).join(" "),
        allergies:      p.allergies ?? "",
        importantNotes: p.importantNotes ?? "",
        createdAt:      new Date(p.createdAt).toLocaleDateString("en-SA"),
      });
      styleDataRow(row, 10, idx % 2 === 1);
    });

    pSheet.autoFilter = { from: "A1", to: "J1" };
    pSheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  // ── Visits sheet ──────────────────────────────────────────────────────────
  if (includeVisits && allVisits.length > 0) {
    const vSheet = workbook.addWorksheet("Visits");
    vSheet.columns = [
      { header: "Visit ID",        key: "id",             width: 10 },
      { header: "Patient ID",      key: "patientId",      width: 12 },
      { header: "Date",            key: "visitDate",      width: 14 },
      { header: "Location",        key: "visitLocation",  width: 18 },
      { header: "Type",            key: "visitType",      width: 14 },
      { header: "Reason",          key: "reasonForVisit", width: 28 },
      { header: "Diagnosis",       key: "diagnosis",      width: 32 },
      { header: "Management Plan", key: "managementPlan", width: 36 },
      { header: "Medications",     key: "medications",    width: 32 },
      { header: "Follow-Up Plan",  key: "followUpPlan",   width: 28 },
      { header: "Status",          key: "status",         width: 14 },
    ];
    styleHeader(vSheet, 11);

    allVisits.forEach((v, idx) => {
      const row = vSheet.addRow({
        id:             v["id"],
        patientId:      v["patientId"],
        visitDate:      v["visitDate"],
        visitLocation:  v["visitLocation"],
        visitType:      v["visitType"] ?? "",
        reasonForVisit: v["reasonForVisit"] ?? "",
        diagnosis:      v["diagnosis"] ?? "",
        managementPlan: v["managementPlan"] ?? "",
        medications:    v["medications"] ?? "",
        followUpPlan:   v["followUpPlan"] ?? "",
        status:         v["status"],
      });
      styleDataRow(row, 11, idx % 2 === 1);
    });

    vSheet.autoFilter = { from: "A1", to: "K1" };
    vSheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}

export const exportsRouter = router({
  generateExcel: protectedProcedure
    .input(
      z.object({
        includePatients: z.boolean().default(true),
        includeVisits:   z.boolean().default(true),
        patientIds:      z.array(z.number()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireDoctor(ctx.user.role);

      const exportId = await createExportRecord({
        exportType: "excel",
        generatedBy: ctx.user.id,
        status: "pending",
      });

      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const patientList = await listPatients(1000, 0);
        const filteredPatients = input.patientIds
          ? patientList.filter((p) => input.patientIds!.includes(p.id))
          : patientList;

        const allVisits: Record<string, unknown>[] = [];
        if (input.includeVisits) {
          for (const patient of filteredPatients) {
            const pVisits = await db
              .select()
              .from(visits)
              .where(and(eq(visits.patientId, patient.id), eq(visits.isDeleted, false)));
            allVisits.push(...(pVisits as Record<string, unknown>[]));
          }
        }

        const buffer = await buildExcelBuffer(
          filteredPatients,
          allVisits,
          input.includePatients,
          input.includeVisits
        );

        const fileName = `dr-rania-export-${new Date().toISOString().split("T")[0]}.xlsx`;
        const fileKey  = `exports/${Date.now()}_${fileName}`;
        const { key, url } = await storagePut(
          fileKey,
          buffer,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        await updateExportRecord(exportId, {
          status:       "completed",
          fileKey:      key,
          fileUrl:      url,
          patientCount: filteredPatients.length,
          visitCount:   allVisits.length,
        });

        await logAuditEvent({
          userId:     ctx.user.id,
          action:     "export_excel",
          entityType: "export",
          entityId:   exportId,
          metadata:   { patientCount: filteredPatients.length, visitCount: allVisits.length },
        });

        return {
          exportId,
          fileUrl:      url,
          patientCount: filteredPatients.length,
          visitCount:   allVisits.length,
        };
      } catch (err) {
        await updateExportRecord(exportId, {
          status:       "failed",
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        });
        throw new TRPCError({
          code:    "INTERNAL_SERVER_ERROR",
          message: "Export failed. Please try again.",
        });
      }
    }),

  listExports: protectedProcedure.query(async ({ ctx }) => {
    requireDoctor(ctx.user.role);
    return listExports();
  }),
});
