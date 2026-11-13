import { SanctionsRecord } from '../models/sanctions.models';
import { exportRecordsToExcel, type ExcelExportOptions } from './excel-export.util';

export { exportRecordsToExcel };
export type { ExcelExportOptions };

function escapeCsvField(value: string | number): string {
  const stringValue = String(value ?? '');
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export function exportRecordsToCsv(
  records: SanctionsRecord[],
  filenamePrefix = 'sanctions-red-records'
): void {
  const headers = [
    'Document_Id',
    'Manuscript_Id',
    'Status',
    'Decision_Date',
    'Journal_Name',
    'Document_Source',
    'Reason',
    'Author_Name',
    'Email',
    'Author_Id',
    'Pal_Id',
    'Country',
    'Affiliations',
    'Co_Authors',
    'Risk_Score',
    'Matched_Watchlist',
    'Notes',
  ];

  const rows = records.map((record) => [
    record.documentId,
    record.manuscriptId || '',
    record.status.toUpperCase(),
    record.decisionDate,
    record.journalName || record.documentTitle,
    record.source,
    record.matchedTerms?.join('|') || record.category || 'PAL',
    record.authorName,
    record.authorEmail || '',
    record.authorId.replace(/^(AUTH-|ORCID-|EMAIL-)/, ''),
    record.palId || '',
    record.country,
    record.affiliationsRaw || (record.organization ? `[Organisation Name : ${record.organization}]` : ''),
    record.coAuthors.join('; '),
    `${record.riskScore}/100`,
    record.matchedWatchlist,
    record.notes,
  ]);

  const csvLines = [
    headers.map(escapeCsvField).join(','),
    ...rows.map((row) => row.map(escapeCsvField).join(',')),
  ];

  const csvContent = '\uFEFF' + csvLines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const cleanPrefix = filenamePrefix.endsWith('.csv') ? filenamePrefix : `${filenamePrefix}.csv`;
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', cleanPrefix);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
