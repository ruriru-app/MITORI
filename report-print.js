(function initMitoriReportPrint(root, factory) {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MitoriReportPrint = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMitoriReportPrintApi(root) {
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function selectedStudents(report, selectedKeys) {
    const keys = selectedKeys instanceof Set ? selectedKeys : new Set(selectedKeys || []);
    return (Array.isArray(report?.students) ? report.students : []).filter(student => keys.has(student.key));
  }

  function optionalRow(label, value) {
    if (!String(value || '').trim()) return '';
    return `<div class="reportPrintField"><span>${escapeHtml(label)}</span><div>${escapeHtml(value)}</div></div>`;
  }

  function recordHtml(record) {
    const kind = record.type === 'good' ? '👍' : '✏';
    return `<article class="reportPrintRecord ${record.type === 'good' ? 'good' : 'bad'}">`
      + `<div class="reportPrintRecordHead"><b>${kind} ${escapeHtml(record.observation || '見取り記録')}</b><time>${escapeHtml(record.date)}</time></div>`
      + optionalRow('単元名', record.lessonUnitName)
      + optionalRow('授業内容', record.lessonContent)
      + optionalRow('メモ', record.memo)
      + '</article>';
  }

  function studentHtml(student, context, periodLabel, shouldBreak) {
    const records = Array.isArray(student.records) ? student.records : [];
    return `<section class="reportPrintStudent${shouldBreak ? ' reportPrintBreak' : ''}"${shouldBreak ? ' style="break-after:page;page-break-after:always"' : ''}>`
      + '<header class="reportPrintHeader">'
      + '<div><div class="reportPrintContext">'
      + [context.school, context.className, context.subject].filter(Boolean).map(escapeHtml).join('　')
      + `</div><h1>${escapeHtml(student.no)}番　${escapeHtml(student.name)}</h1></div>`
      + `<div class="reportPrintPeriod">${escapeHtml(periodLabel)}</div>`
      + '</header>'
      + `<div class="reportPrintCounts"><span>👍 ${Number(student.goodCount || 0)}件</span><span>✏ ${Number(student.badCount || 0)}件</span></div>`
      + `<div class="reportPrintRecords">${records.length ? records.map(recordHtml).join('') : '<p class="reportPrintEmpty">対象期間の見取り記録はありません。</p>'}</div>`
      + '</section>';
  }

  function buildPrintDocument(options) {
    const source = options && typeof options === 'object' ? options : {};
    const report = source.report || {};
    const context = source.context || {};
    const students = selectedStudents(report, source.selectedKeys);
    if (!students.length) throw new Error('印刷する児童生徒が選択されていません');
    const individual = source.format === 'individual';
    const periodLabel = context.periodLabel || report.period?.label || '全期間';
    const sections = students.map((student, index) => studentHtml(
      student,
      context,
      periodLabel,
      individual && index < students.length - 1,
    )).join('');
    return '<!doctype html><html lang="ja"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>MITORI 見取りレポート</title><style>'
      + '@page{size:A4 portrait;margin:12mm 10mm 12mm 14mm}'
      + '*{box-sizing:border-box}body{margin:0;color:#514944;font-family:"Yu Gothic","Hiragino Kaku Gothic ProN",sans-serif;font-size:10.5pt;line-height:1.55}'
      + '.reportPrintStudent{width:100%;padding:0 0 5mm}.reportPrintHeader{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #73c9bf;padding-bottom:3mm;margin-bottom:3mm}'
      + '.reportPrintContext{color:#796d65;font-size:9.5pt}.reportPrintHeader h1{font-size:16pt;margin:1mm 0 0}.reportPrintPeriod{font-size:10pt;white-space:nowrap}'
      + '.reportPrintCounts{display:flex;gap:4mm;margin:0 0 3mm}.reportPrintCounts span{border:1px solid #dacfc8;border-radius:8px;padding:1.5mm 4mm;background:#fffdfa}'
      + '.reportPrintRecord{border:1px solid #ddd3cc;border-left:4px solid #9a8f86;border-radius:8px;padding:2.5mm 3mm;margin-bottom:2.5mm;break-inside:avoid;page-break-inside:avoid}'
      + '.reportPrintRecord.good{border-left-color:#64bcb1}.reportPrintRecord.bad{border-left-color:#e8a178}.reportPrintRecordHead{display:flex;justify-content:space-between;gap:4mm;margin-bottom:1mm}.reportPrintRecordHead time{white-space:nowrap;color:#796d65}'
      + '.reportPrintField{display:grid;grid-template-columns:18mm 1fr;gap:2mm;border-top:1px solid #eee5df;padding-top:1mm;margin-top:1mm}.reportPrintField span{color:#796d65}.reportPrintField div{white-space:pre-wrap;overflow-wrap:anywhere}'
      + '.reportPrintEmpty{color:#8f837b;text-align:center;border:1px dashed #ddd3cc;border-radius:8px;padding:8mm}.reportPrintRecords{min-width:0}'
      + '</style></head><body>' + sections + '</body></html>';
  }

  function openPrintWindow(documentHtml, adapters = {}) {
    const openWindow = adapters.openWindow || (() => root.open('', '_blank'));
    const schedule = adapters.schedule || (callback => root.setTimeout(callback, 250));
    const printWindow = openWindow();
    if (!printWindow?.document) throw new Error('印刷画面を開けませんでした');
    printWindow.document.open();
    printWindow.document.write(documentHtml);
    printWindow.document.close();
    schedule(() => {
      printWindow.focus?.();
      printWindow.print?.();
    });
    return printWindow;
  }

  return Object.freeze({ buildPrintDocument, openPrintWindow });
});
