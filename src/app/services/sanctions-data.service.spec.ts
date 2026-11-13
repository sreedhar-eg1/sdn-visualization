import { TestBed } from '@angular/core/testing';
import * as XLSX from 'xlsx';
import { SanctionsDataService } from './sanctions-data.service';

const SECOND_FILE_CSV = `Id,authorfirstname,authorlastname,authormiddlename,authorfullname,authoremailaddress,affiliations,matchedterm,palscore,pclscore,sdnscore,status,comments,curationcomments,curationstatus,release,authororcidid,authorrole,recordid,authorrecordid,documentsource,documenttitle,documenttype,documentid,manuscriptid,startdate,enddate,authorid,authorfulladdress,authorsalutation,alreadyloadedprojects,palId,sdnid
101,Ali,Rezaei,,Ali Rezaei,ali.rezaei@sharif.edu,"[{""city"":""Tehran"",""country"":""Iran"",""organisationName"":""Sharif University of Technology""}]",PCL,,,"",RED,[],,,,0000-0001-9999-0001,Author,999001,1,PAPERCEPT,Autonomous Maritime Radar Control,Conference Paper,9991001,,2026-05-01,2026-05-01,888001,,,,,
102,Wei,Chen,,Wei Chen,wei.chen@imu.edu.cn,"[{""city"":""Hohhot"",""country"":""China"",""organisationName"":""Inner Mongolia University""}]",PAL,"[{""id"":""PAL9001"",""name"":""Wei Chen"",""score"":""4.2""}]",,,RED,[],,,,0000-0001-9999-0002,Author,999002,3,IDAMS,Controllability of Lexicographic Product Networks,IEEE Transaction article,20288959,,2026-04-17,2026-04-17,888002,,,,9001,`;

describe('SanctionsDataService', () => {
  let service: SanctionsDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SanctionsDataService);
  });

  it('should hold mock JSON records off by default and start with 0 active records until uploaded', () => {
    expect(service.mockRecords().length).toBe(246);
    expect(service.datasetMode()).toBe('UPLOADED_ONLY');
    expect(service.uploadedExcelRecords().length).toBe(0);
    expect(service.records().length).toBe(0);
  });

  it('should merge multiple uploaded CSV files sequentially, deduplicate duplicates, and link co-authors across files', () => {
    const first = service.loadBuiltInSampleCsv();
    expect(first.added).toBe(23);
    expect(service.records().length).toBe(23);
    expect(service.uploadedFiles().length).toBe(1);

    // Re-uploading the exact same file should skip all 23 duplicate rows
    const dup = service.loadBuiltInSampleCsv();
    expect(dup.added).toBe(0);
    expect(dup.skippedDuplicates).toBe(23);
    expect(service.records().length).toBe(23);

    // Uploading a second distinct file should merge with the first (23 + 2 = 25)
    const second = service.importUploadedCsv(SECOND_FILE_CSV, 'batch-2.csv');
    expect(second.added).toBe(2);
    expect(service.records().length).toBe(25);
    expect(service.uploadedFiles().length).toBe(2);

    // Row 102 shares documentid 20288959 with Qiang Zhang from file 1 -> co-authors recomputed!
    const qiangZhang = service.records().find((r) => r.authorName === 'Qiang Zhang');
    expect(qiangZhang?.coAuthorCount).toBe(1);
    expect(qiangZhang?.coAuthors).toEqual(['Wei Chen']);

    // Removing the second file restores 23 records and updates co-authors
    const secondBatchId = service.uploadedFiles()[1].id;
    service.removeUploadedFile(secondBatchId);
    expect(service.records().length).toBe(23);
    expect(service.records().find((r) => r.authorName === 'Qiang Zhang')?.coAuthorCount).toBe(0);
  });

  it('should still allow switching to COMBINED and MOCK_ONLY modes when requested', () => {
    service.loadBuiltInSampleCsv();

    service.datasetMode.set('COMBINED');
    expect(service.records().length).toBe(269);

    service.datasetMode.set('MOCK_ONLY');
    expect(service.records().length).toBe(246);
  });

  it('should toggle watchlist sources cleanly', () => {
    const first = service.watchlistSources()[0];
    const initialEnabled = first.enabled;
    service.toggleWatchlistSource(first.id);
    expect(service.watchlistSources()[0].enabled).toBe(!initialEnabled);
  });

  it('should add a restricted location and sync a mock screening event', () => {
    const initialLocs = service.restrictedLocations().length;
    const initialMock = service.mockRecords().length;

    service.addRestrictedLocation({
      country: 'Belarus',
      isoCode: 'BY',
      city: 'Minsk',
      riskLevel: 'High',
      listSource: 'PCL',
    });

    expect(service.restrictedLocations().length).toBe(initialLocs + 1);
    expect(service.mockRecords().length).toBe(initialMock + 1);
  });

  it('should add a manual PAL entry and sync a mock screening event', () => {
    const initialPal = service.palEntries().length;
    const initialMock = service.mockRecords().length;

    service.addPalEntry({
      fullName: 'Dr. Test Author',
      authorId: 'ORCID-0009-9999',
      affiliation: 'Test Institute',
      country: 'Iran',
      listSource: 'In-House PAL',
      severity: 'Red',
      notes: 'Unit test entry',
      importMethod: 'Manual',
    });

    expect(service.palEntries().length).toBe(initialPal + 1);
    expect(service.mockRecords().length).toBe(initialMock + 1);
  });

  it('should reject raw binary payloads accidentally passed to CSV parser', () => {
    const fakeZipPayload = 'PK\x03\x04\x14\x00\x00\x00\x08\x00[Content_Types].xml\nfoo,bar';
    const result = service.importUploadedCsv(fakeZipPayload, 'MQ601.xlsx');
    expect(result.parsed).toBe(0);
    expect(result.added).toBe(0);
    expect(service.records().length).toBe(0);
  });

  it('should parse real .xlsx workbooks, normalize NBSP countries, and merge sequentially with CSV', async () => {
    const headers = [
      'Id',
      'authorfirstname',
      'authorlastname',
      'authorfullname',
      'authoremailaddress',
      'affiliations',
      'matchedterm',
      'palscore',
      'pclscore',
      'sdnscore',
      'status',
      'authororcidid',
      'documentsource',
      'documenttitle',
      'documenttype',
      'documentid',
      'startdate',
      'authorid',
    ];
    const sheetData = [
      headers,
      [
        8,
        'Licheng',
        'Jiao',
        'Licheng Jiao',
        'lchjiao@mail.xidian.edu.cn',
        '[{"city":"Xi\'an","country":"China","organisationName":"Xidian University"}]',
        'PAL',
        '[{"id":"PAL101","name":"Licheng Jiao","score":"5.2"}]',
        '',
        '',
        'RED',
        '0000-0003-2111-1111',
        'IDAMS',
        'Paper One',
        'IEEE Transaction article',
        '10980230',
        '2025-10-02',
        '1001',
      ],
      [
        1,
        'Dong',
        'Wang',
        'Dong Wang',
        'dwang@mail.edu',
        '[{"city":"Kuala Lumpur\u00a0","country":"\u00a0Malaysia","organisationName":"APU"}]',
        'PAL',
        '[{"id":"PAL102","name":"Dong Wang","score":"3.4"}]',
        '',
        '',
        'GREEN',
        '0000-0002-1111-2222',
        'IDAMS',
        'Paper Two',
        'Conference Paper',
        '11197574',
        '2025-10-08',
        '1002',
      ],
      [
        4,
        'I.',
        'Babushkin',
        'I. Babushkin',
        'ib@uni-hannover.de',
        '[{"city":"Hannover","country":"Germany","organisationName":"Leibniz University Hannover"}]',
        'SDN',
        '',
        '',
        '[{"sdnId":"SDN99","name":"Babushkin","score":"6.0"}]',
        'RED',
        '',
        'IDAMS',
        'Laser Physics Study',
        'IEEE Journal article',
        '11191446',
        '2025-05-04',
        '1003',
      ],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet0');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer | Uint8Array;
    const bytes = out instanceof ArrayBuffer ? new Uint8Array(out) : new Uint8Array(out);
    const buffer = bytes.slice().buffer;

    const xlsxResult = await service.importUploadedExcel(buffer, 'MQ601_test.xlsx');
    expect(xlsxResult.parsed).toBe(3);
    expect(xlsxResult.added).toBe(3);
    expect(service.records().length).toBe(3);

    const dong = service.records().find((r) => r.authorName === 'Dong Wang');
    expect(dong?.status).toBe('Green');
    expect(dong?.country).toBe('Malaysia');
    expect(dong?.city).toBe('Kuala Lumpur');

    const babushkin = service.records().find((r) => r.authorName === 'I. Babushkin');
    expect(babushkin?.category).toBe('SDN');
    expect(babushkin?.status).toBe('Red');

    // Merge sequentially with a CSV file
    const csvResult = service.importUploadedCsv(SECOND_FILE_CSV, 'batch-2.csv');
    expect(csvResult.added).toBe(2);
    expect(service.records().length).toBe(5);
    expect(service.uploadedFiles().length).toBe(2);
  });

  it('should parse SanctionedReport schema with continuation rows and bracketed affiliations', async () => {
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
    ];
    const sheetData = [
      headers,
      [
        '65127624',
        'TDSC-2026-05-1900',
        'RED',
        'Tue May 12 18:34:41 IST 2026',
        'Transactions on Dependable and Secure Computing',
        'S1M',
        'PCL',
        'Lee, Dr. Chien-Ding',
        'cdlee227@mail.nou.edu.tw',
        '143694903',
        '',
        '[Venezuela]',
        '[City : Caracas, Country : Venezuela, Bolivarian Republic of, Country Code : VE, Organisation Name : National Open University, Postal Code : 1010]',
      ],
      [
        '65089637',
        '26-TIE-2675',
        'RED',
        'Tue May 12 18:34:39 IST 2026',
        'Transactions on Industrial Electronics',
        'S1M',
        'PAL',
        'Xie, Prof. Hui',
        '0909031059@nue.edu.cn',
        '149533402',
        '[4043]',
        '',
        '[City : Wuhan, Country : China, Organisation Name : Naval University of Engineering]',
      ],
      ['', '', '', '', '', '', '', 'Co-Authors', '', '', '', '', ''],
      [
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'Deng, Dr. Bo',
        'm200770375@alumni.hust.edu.cn',
        '149533401',
        '',
        '',
        '[City : Wuhan, Country : China, Organisation Name : Wuhan University]',
      ],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, 'S1M');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer | Uint8Array;
    const bytes = out instanceof ArrayBuffer ? new Uint8Array(out) : new Uint8Array(out);
    const buffer = bytes.slice().buffer;

    const result = await service.importUploadedExcel(
      buffer,
      'SanctionedReport_S1M_IDAMS_PAPERCEPT_12May2026.xlsx'
    );
    expect(result.parsed).toBe(3); // 2 primary + 1 co-author (Co-Authors header skipped)
    expect(result.added).toBe(3);

    const xie = service.records().find((r) => r.authorName === 'Xie, Prof. Hui');
    expect(xie?.documentId).toBe('65089637');
    expect(xie?.palId).toBe('4043');
    expect(xie?.category).toBe('PAL');
    expect(xie?.status).toBe('Red');
    expect(xie?.coAuthors).toContain('Deng, Dr. Bo');

    const deng = service.records().find((r) => r.authorName === 'Deng, Dr. Bo');
    expect(deng?.documentId).toBe('65089637');
    expect(deng?.status).toBe('Green');
    expect(deng?.coAuthors).toContain('Xie, Prof. Hui');

    const lee = service.records().find((r) => r.authorName === 'Lee, Dr. Chien-Ding');
    expect(lee?.category).toBe('PCL');
    expect(lee?.country).toBe('Venezuela');
    expect(lee?.city).toBe('Caracas');
    expect(lee?.decisionDate).toBe('2026-05-12');
  });
});
