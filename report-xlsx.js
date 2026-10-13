(function initMitoriReportXlsx(root, factory) {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MitoriReportXlsx = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMitoriReportXlsxApi(root) {
  const encoder = new TextEncoder();
  const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const SHEETS = [
    { name: '児童別まとめ', key: 'summaryTable' },
    { name: '記録一覧', key: 'detailTable' },
  ];

  function escapeXml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    })[character]);
  }

  function columnName(index) {
    let value = index + 1;
    let result = '';
    while (value > 0) {
      value -= 1;
      result = String.fromCharCode(65 + (value % 26)) + result;
      value = Math.floor(value / 26);
    }
    return result;
  }

  function valueCell(reference, value, style) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `<c r="${reference}" t="n" s="${style}"><v>${value}</v></c>`;
    }
    return `<c r="${reference}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  }

  function worksheetXml(table) {
    const rows = Array.isArray(table) && table.length ? table : [[]];
    const width = Math.max(1, ...rows.map(row => (Array.isArray(row) ? row.length : 0)));
    const xmlRows = rows.map((row, rowIndex) => {
      const cells = (Array.isArray(row) ? row : []).map((value, columnIndex) => (
        valueCell(`${columnName(columnIndex)}${rowIndex + 1}`, value, rowIndex === 0 ? 1 : 2)
      )).join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join('');
    const columns = Array.from({ length: width }, (_, index) => {
      const longColumn = index >= Math.max(0, width - 4);
      const columnWidth = longColumn ? 28 : (index === 4 ? 20 : 14);
      return `<col min="${index + 1}" max="${index + 1}" width="${columnWidth}" customWidth="1"/>`;
    }).join('');
    const lastColumn = columnName(width - 1);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      + `<cols>${columns}</cols><sheetData>${xmlRows}</sheetData>`
      + `<autoFilter ref="A1:${lastColumn}1"/></worksheet>`;
  }

  function contentTypes() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '</Types>';
  }

  const ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>';

  const WORKBOOK = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheets><sheet name="児童別まとめ" sheetId="1" r:id="rId1"/><sheet name="記録一覧" sheetId="2" r:id="rId2"/></sheets>'
    + '</workbook>';

  const WORKBOOK_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
    + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>';

  const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="2"><font><sz val="10"/><name val="Yu Gothic"/></font><font><b/><sz val="10"/><name val="Yu Gothic"/></font></fonts>'
    + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDFF3EF"/><bgColor indexed="64"/></patternFill></fill></fills>'
    + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>'
    + '</cellXfs></styleSheet>';

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function concat(parts) {
    const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    parts.forEach(part => {
      result.set(part, offset);
      offset += part.length;
    });
    return result;
  }

  function zipStore(files) {
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    files.forEach(([name, text]) => {
      const nameBytes = encoder.encode(name);
      const data = typeof text === 'string' ? encoder.encode(text) : text;
      const checksum = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, 0, true);
      localView.setUint16(12, 33, true);
      localView.setUint32(14, checksum, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30);
      localParts.push(local, data);

      const central = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(central.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, 0, true);
      centralView.setUint16(14, 33, true);
      centralView.setUint32(16, checksum, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint32(42, localOffset, true);
      central.set(nameBytes, 46);
      centralParts.push(central);
      localOffset += local.length + data.length;
    });
    const central = concat(centralParts);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, central.length, true);
    endView.setUint32(16, localOffset, true);
    return concat([...localParts, central, end]);
  }

  function createWorkbook(bundle) {
    if (!Array.isArray(bundle?.summaryTable) || !Array.isArray(bundle?.detailTable)) {
      throw new Error('Excelへ出力するレポートがありません');
    }
    return zipStore([
      ['[Content_Types].xml', contentTypes()],
      ['_rels/.rels', ROOT_RELS],
      ['xl/workbook.xml', WORKBOOK],
      ['xl/_rels/workbook.xml.rels', WORKBOOK_RELS],
      ['xl/styles.xml', STYLES],
      ...SHEETS.map((sheet, index) => [
        `xl/worksheets/sheet${index + 1}.xml`,
        worksheetXml(bundle[sheet.key]),
      ]),
    ]);
  }

  function stamp(now) {
    const date = now instanceof Date ? now : new Date(now || Date.now());
    if (Number.isNaN(date.valueOf())) throw new Error('出力日時が不正です');
    const part = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}${part(date.getMonth() + 1)}${part(date.getDate())}-${part(date.getHours())}${part(date.getMinutes())}`;
  }

  function safePart(value) {
    return String(value || '').replace(/[<>:"/\\|?*：\u0000-\u001f]/g, '_').replace(/[ .]+$/g, '').trim();
  }

  function filename(context, now = new Date()) {
    const parts = [context?.school, context?.className, context?.subject].map(safePart).filter(Boolean);
    return `MITORI-${parts.join('-') || '見取りレポート'}-${stamp(now)}.xlsx`;
  }

  function download(bundle, options = {}) {
    const documentRef = options.documentRef || root.document;
    const urlApi = options.urlApi || root.URL;
    const BlobCtor = options.BlobCtor || root.Blob;
    if (!documentRef?.createElement || !urlApi?.createObjectURL || typeof BlobCtor !== 'function') {
      throw new Error('この端末ではExcelを保存できません');
    }
    const name = filename(options.context || {}, options.now || new Date());
    const blob = new BlobCtor([createWorkbook(bundle)], { type: XLSX_TYPE });
    const url = urlApi.createObjectURL(blob);
    const anchor = documentRef.createElement('a');
    try {
      anchor.href = url;
      anchor.download = name;
      anchor.hidden = true;
      documentRef.body?.append?.(anchor);
      anchor.click();
    } finally {
      anchor.remove?.();
      urlApi.revokeObjectURL?.(url);
    }
    return name;
  }

  return Object.freeze({ createWorkbook, filename, download });
});
