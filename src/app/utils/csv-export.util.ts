import { SanctionsRecord } from '../models/sanctions.models';

function escapeCsvField(value: string | number): string {
  const stringValue = String(value ?? '');
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export function exportRecordsToCsv(records: SanctionsRecord[], filenamePrefix = 'sanctions-red-records'): void {
  const headers = [
    'Record ID',
    'Document ID',
    'Document Title',
    'Source',
    'Flagged Author',
    'Author ID',
    'Co-Author Count',
    'Co-Authors',
    'Country',
    'City',
    'Category',
    'Reason',
    'Status',
    'Risk Score',
    'Decision Date',
    'Matched Watchlist',
    'Notes',
  ];

  const rows = records.map((record) => [
    record.id,
    record.documentId,
    record.documentTitle,
    record.source,
    record.authorName,
    record.authorId,
    record.coAuthorCount,
    record.coAuthors.join('; '),
    record.country,
    record.city,
    record.category,
    record.reason,
    record.status,
    record.riskScore,
    record.decisionDate,
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

  const today = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${filenamePrefix}-${today}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
