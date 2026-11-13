import { SanctionsRecord } from '../models/sanctions.models';

export interface ExcelExportOptions {
  categoryOrReport: string;
  uploadedFileName?: string | null;
}

/**
 * Exports screening records to a Microsoft Excel (.xlsx) file,
 * naming the file based on the uploaded Excel file and the report category.
 */
export async function exportRecordsToExcel(
  records: SanctionsRecord[],
  options: ExcelExportOptions
): Promise<string> {
  const XLSX = await import('xlsx');

  // Derive target file name: <UploadedExcelBaseName>_<Category>.xlsx
  const rawBase = options.uploadedFileName
    ? options.uploadedFileName.replace(/\.[^.]+$/, '')
    : (records[0]?.sourceFileName ? records[0].sourceFileName.replace(/\.[^.]+$/, '') : 'Sanctions_Intelligence');
  const cleanCategory = options.categoryOrReport.replace(/\s+/g, '');
  const fileName = `${rawBase}_${cleanCategory}.xlsx`;

  // Format rows using the rich uploaded Excel schema
  const rows = records.map((r) => ({
    Document_Id: r.documentId,
    Manuscript_Id: r.manuscriptId || '',
    Status: r.status.toUpperCase(),
    Decision_Date: r.decisionDate,
    Journal_Name: r.journalName || r.documentTitle,
    Document_Source: r.source,
    Reason: r.matchedTerms?.join('|') || r.category || 'PAL',
    Author_Name: r.authorName,
    Email: r.authorEmail || '',
    Author_Id: r.authorId.replace(/^(AUTH-|ORCID-|EMAIL-)/, ''),
    Pal_Id: r.palId || '',
    Country: r.country,
    Affiliations:
      r.affiliationsRaw ||
      (r.organization
        ? `[City : ${r.city}, Country : ${r.country}, Organisation Name : ${r.organization}]`
        : ''),
    Co_Authors: r.coAuthors.join('; '),
    Co_Author_Count: r.coAuthorCount,
    Risk_Score: `${r.riskScore}/100`,
    Matched_Watchlist: r.matchedWatchlist,
    Notes: r.notes,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Auto-fit column widths for clear presentation
  if (rows.length > 0) {
    const colKeys = Object.keys(rows[0]);
    worksheet['!cols'] = colKeys.map((key) => {
      const maxLen = Math.max(
        key.length,
        ...rows
          .slice(0, 100)
          .map((row) => String((row as Record<string, unknown>)[key] ?? '').length)
      );
      return { wch: Math.min(50, Math.max(12, maxLen + 2)) };
    });
  }

  const workbook = XLSX.utils.book_new();
  const safeSheetName = cleanCategory.slice(0, 31) || 'ScreenedData';
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);

  XLSX.writeFile(workbook, fileName);
  return fileName;
}
