(function initMitoriReportModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MitoriReportModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMitoriReportModelApi() {
  const ALL_PERIOD = Object.freeze({
    mode: 'all', label: '全期間', start: null, end: null, termId: '',
  });

  function activeTerms(settings) {
    const source = settings && typeof settings === 'object' ? settings : {};
    const key = source.system === 'semester' ? 'semester' : 'trimester';
    return Array.isArray(source[key]) ? source[key] : [];
  }

  function normalizeTerm(term) {
    return {
      mode: 'term',
      label: String(term?.name || '学期'),
      start: String(term?.start || '') || null,
      end: String(term?.end || '') || null,
      termId: String(term?.id || ''),
    };
  }

  function resolveDefaultPeriod(termSettings, anchorDate) {
    const date = String(anchorDate || '');
    const matches = activeTerms(termSettings)
      .filter(term => term?.start && term?.end && term.start <= date && date <= term.end)
      .sort((left, right) => String(right.start).localeCompare(String(left.start)));
    return matches.length ? normalizeTerm(matches[0]) : { ...ALL_PERIOD };
  }

  function dateLabel(value) {
    return String(value || '').replaceAll('-', '/');
  }

  function resolvePeriod(termSettings, request, anchorDate) {
    const source = request && typeof request === 'object' ? request : {};
    if (source.mode === 'custom') {
      const start = String(source.start || '');
      const end = String(source.end || '');
      if (start && end && start > end) throw new Error('開始日は終了日以前の日付にしてください');
      return {
        mode: 'custom',
        label: `${dateLabel(start)}～${dateLabel(end)}`,
        start: start || null,
        end: end || null,
        termId: '',
      };
    }
    if (source.mode === 'term') {
      const term = activeTerms(termSettings).find(item => String(item?.id || '') === String(source.termId || ''));
      return term ? normalizeTerm(term) : resolveDefaultPeriod(termSettings, anchorDate);
    }
    if (source.mode === 'all') return { ...ALL_PERIOD };
    return resolveDefaultPeriod(termSettings, anchorDate);
  }

  function reportTileLayout(classes, archivedTiles, classLayout) {
    const activeIds = new Set((Array.isArray(classes) ? classes : [])
      .map(tile => String(tile?.id || ''))
      .filter(Boolean));
    const activeSlots = (Array.isArray(classLayout) ? classLayout : [])
      .map(id => (id && activeIds.has(String(id)) ? String(id) : null));
    const archived = (Array.isArray(archivedTiles) ? archivedTiles : []).map(entry => {
      const tile = entry?.tile && typeof entry.tile === 'object' ? entry.tile : entry || {};
      const label = String(tile.name || tile.className || tile.preservedLabel || '').trim()
        || '保管済み授業';
      return { ...entry, tile, label };
    });
    return { activeSlots, archivedTiles: archived };
  }

  function rosterEntries(roster) {
    const source = roster && typeof roster === 'object' ? roster : {};
    const entries = Array.isArray(source)
      ? source.map((student, index) => [student?.num ?? index + 1, student])
      : Object.entries(source);
    return entries
      .map(([rawNo, student]) => ({
        no: Number(rawNo),
        kanji: String(student?.kanji || student?.name || '').trim(),
        kana: String(student?.kana || '').trim(),
      }))
      .filter(student => Number.isInteger(student.no) && student.no > 0 && student.no <= 40)
      .sort((left, right) => left.no - right.no);
  }

  function normalizeType(value) {
    const text = String(value || '').trim();
    if (text === 'good' || text === '👍') return 'good';
    if (text === 'bad' || text === '✏' || text === '✏️') return 'bad';
    return '';
  }

  function normalizeRecord(record) {
    const tags = Array.isArray(record?.tags)
      ? record.tags.map(value => String(value || '').trim()).filter(Boolean)
      : (String(record?.tag || '').trim() ? [String(record.tag).trim()] : []);
    return {
      date: String(record?.date || ''),
      time: String(record?.time || ''),
      classId: String(record?.classId || ''),
      no: Number(record?.num),
      type: normalizeType(record?.type),
      tags,
      observation: tags.join('・'),
      memo: String(record?.memo || ''),
      lessonUnitId: String(record?.lessonUnitId || ''),
      lessonUnitName: String(record?.lessonUnitName || record?.unitName || ''),
      lessonContent: String(record?.lessonContent || record?.content || ''),
      observationId: String(record?.observationId || ''),
      studentName: String(record?.studentName || '').trim(),
      studentNameKana: String(record?.studentNameKana || '').trim(),
    };
  }

  function newestFirst(left, right) {
    return String(right.date).localeCompare(String(left.date))
      || String(right.time).localeCompare(String(left.time));
  }

  function recordMatchesPeriod(record, period) {
    if (!record.date) return period?.mode === 'all';
    if (period?.start && record.date < period.start) return false;
    if (period?.end && record.date > period.end) return false;
    return true;
  }

  function displayName(student, nameDisplay) {
    const preferred = nameDisplay === 'kana' ? student.kana : student.kanji;
    const alternate = nameDisplay === 'kana' ? student.kanji : student.kana;
    return preferred || alternate || `${student.no}番（名前未登録）`;
  }

  function snapshotMatchesCurrent(record, student) {
    if (!record.studentName && !record.studentNameKana) return true;
    const rosterNames = new Set([student.kanji, student.kana].filter(Boolean));
    return [record.studentName, record.studentNameKana].filter(Boolean)
      .some(name => rosterNames.has(name));
  }

  function legacyKey(record) {
    const names = `${record.studentName}\u0000${record.studentNameKana}`;
    return names === '\u0000' ? `outside:${record.no}` : `legacy:${record.no}:${names}`;
  }

  function legacyName(record, nameDisplay) {
    const preferred = nameDisplay === 'kana' ? record.studentNameKana : record.studentName;
    const alternate = nameDisplay === 'kana' ? record.studentName : record.studentNameKana;
    return preferred || alternate || `${record.no}番（名簿外）`;
  }

  function buildReport(options) {
    const source = options && typeof options === 'object' ? options : {};
    const tile = source.tile && typeof source.tile === 'object' ? source.tile : {};
    const nameDisplay = source.nameDisplay === 'kana' ? 'kana' : 'kanji';
    const current = rosterEntries(source.roster);
    const currentByNo = new Map();
    const studentsByKey = new Map();
    current.forEach(student => {
      const key = `current:${student.no}`;
      const output = {
        key,
        no: student.no,
        name: displayName(student, nameDisplay),
        kanji: student.kanji,
        kana: student.kana,
        legacy: false,
        row: ((student.no - 1) % 5) + 1,
        column: Math.floor((student.no - 1) / 5) + 1,
        goodCount: 0,
        badCount: 0,
        records: [],
      };
      currentByNo.set(student.no, { ...student, key });
      studentsByKey.set(key, output);
    });

    const normalizedRecords = (Array.isArray(source.records) ? source.records : [])
      .map(normalizeRecord)
      .filter(record => record.classId === String(tile.id || ''))
      .filter(record => Number.isInteger(record.no) && record.no > 0)
      .filter(record => record.type)
      .filter(record => recordMatchesPeriod(record, source.period));

    normalizedRecords.forEach(record => {
      const rosterStudent = currentByNo.get(record.no);
      const key = rosterStudent && snapshotMatchesCurrent(record, rosterStudent)
        ? rosterStudent.key
        : legacyKey(record);
      if (!studentsByKey.has(key)) {
        studentsByKey.set(key, {
          key,
          no: record.no,
          name: legacyName(record, nameDisplay),
          kanji: record.studentName,
          kana: record.studentNameKana,
          legacy: true,
          row: null,
          column: null,
          goodCount: 0,
          badCount: 0,
          records: [],
        });
      }
      studentsByKey.get(key).records.push(record);
    });

    const students = Array.from(studentsByKey.values())
      .sort((left, right) => Number(left.legacy) - Number(right.legacy)
        || left.no - right.no || left.name.localeCompare(right.name, 'ja'));
    students.forEach(student => {
      student.records.sort(newestFirst);
      student.goodCount = student.records.filter(record => record.type === 'good').length;
      student.badCount = student.records.filter(record => record.type === 'bad').length;
    });

    return {
      tileId: String(tile.id || ''),
      tile,
      context: { ...(source.context || {}) },
      period: source.period || { ...ALL_PERIOD },
      columns: current.length > 35 ? 8 : 7,
      students,
      recordCount: normalizedRecords.length,
    };
  }

  function recordsForStudent(report, studentKey, kind) {
    const student = (Array.isArray(report?.students) ? report.students : [])
      .find(item => item.key === studentKey);
    if (!student) return [];
    const requested = kind === 'good' || kind === 'bad' ? kind : 'all';
    return student.records
      .filter(record => requested === 'all' || record.type === requested)
      .slice()
      .sort(newestFirst);
  }

  function groupStudentRecords(records, mode) {
    const ordered = (Array.isArray(records) ? records : []).slice().sort(newestFirst);
    if (mode !== 'tag') return [{ key: 'all', label: '', records: ordered }];
    const groups = [];
    const byLabel = new Map();
    (Array.isArray(records) ? records : []).forEach(record => {
      const label = String(record?.observation
        || (Array.isArray(record?.tags) ? record.tags.join('・') : record?.tag)
        || '見取り内容未設定');
      if (!byLabel.has(label)) {
        const group = { key: label, label, records: [] };
        byLabel.set(label, group);
        groups.push(group);
      }
      byLabel.get(label).records.push(record);
    });
    groups.forEach(group => group.records.sort(newestFirst));
    return groups;
  }

  return {
    resolveDefaultPeriod,
    resolvePeriod,
    reportTileLayout,
    buildReport,
    groupStudentRecords,
    recordsForStudent,
  };
});
