(function initMitoriReportExport(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MitoriReportExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMitoriReportExportApi() {
  const SUMMARY_HEADER = ['学校', 'クラス', '教科', '番号', '氏名', '👍件数', '✏件数', '👍内容まとめ', '✏内容まとめ'];
  const DETAIL_HEADER = ['学校', 'クラス', '教科', '日付', '番号', '氏名', '👍/✏', '見取り内容', '単元名', '授業内容', 'メモ'];

  function selectedStudents(report, selectedKeys) {
    const selected = selectedKeys instanceof Set ? selectedKeys : new Set(selectedKeys || []);
    return (Array.isArray(report?.students) ? report.students : [])
      .filter(student => selected.has(student.key));
  }

  function clean(value) {
    return value == null ? '' : String(value);
  }

  function summaryText(records, type) {
    return records
      .filter(record => record.type === type)
      .slice()
      .sort((left, right) => String(left.date).localeCompare(String(right.date)))
      .map(record => {
        const first = [record.date, type === 'good' ? '👍' : '✏', record.observation]
          .filter(Boolean).join(' ');
        return record.memo ? `${first}\n${record.memo}` : first;
      })
      .join('\n\n');
  }

  function buildSummaryTable(report, selectedKeys, context) {
    const meta = context && typeof context === 'object' ? context : {};
    return [SUMMARY_HEADER.slice(), ...selectedStudents(report, selectedKeys).map(student => [
      clean(meta.school),
      clean(meta.className),
      clean(meta.subject),
      student.no,
      clean(student.name),
      student.goodCount,
      student.badCount,
      summaryText(student.records || [], 'good'),
      summaryText(student.records || [], 'bad'),
    ])];
  }

  function buildDetailTable(report, selectedKeys, context) {
    const meta = context && typeof context === 'object' ? context : {};
    const rows = [];
    selectedStudents(report, selectedKeys).forEach(student => {
      (Array.isArray(student.records) ? student.records : [])
        .slice()
        .sort((left, right) => String(left.date).localeCompare(String(right.date))
          || String(left.time || '').localeCompare(String(right.time || '')))
        .forEach(record => rows.push([
          clean(meta.school),
          clean(meta.className),
          clean(meta.subject),
          clean(record.date),
          student.no,
          clean(student.name),
          record.type === 'good' ? '👍' : '✏',
          clean(record.observation),
          clean(record.lessonUnitName),
          clean(record.lessonContent),
          clean(record.memo),
        ]));
    });
    rows.sort((left, right) => Number(left[4]) - Number(right[4])
      || String(left[3]).localeCompare(String(right[3])));
    return [DETAIL_HEADER.slice(), ...rows];
  }

  function tsvCell(value) {
    const text = clean(value).replace(/\r\n?/g, '\n').replace(/\t/g, ' ');
    if (!/[\n"]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function tableToTsv(table) {
    return (Array.isArray(table) ? table : [])
      .map(row => (Array.isArray(row) ? row : []).map(tsvCell).join('\t'))
      .join('\n');
  }

  return { buildSummaryTable, buildDetailTable, tableToTsv };
});
