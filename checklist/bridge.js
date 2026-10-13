(function initMitoriChecklistBridge(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MitoriChecklistBridge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createBridge() {
  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function normalizedText(value) {
    return String(value || '').trim().replace(/\s+/g, '');
  }

  function identityKey(student) {
    const name = normalizedText(student?.name ?? student?.kanji);
    const kana = normalizedText(student?.kana);
    return name ? `${name}\u0000${kana}` : '';
  }

  function normalizedNumber(value) {
    const text = String(value ?? '').trim();
    return /^\d+$/.test(text) ? String(Number(text)) : text;
  }

  function rosterRows(roster) {
    return Object.entries(roster && typeof roster === 'object' ? roster : {})
      .map(([number, person]) => ({
        number: normalizedNumber(number),
        name: String(person?.kanji || ''),
        kana: String(person?.kana || ''),
      }))
      .filter(student => student.number)
      .sort((left, right) => {
        const leftNumber = Number(left.number);
        const rightNumber = Number(right.number);
        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
        return left.number.localeCompare(right.number, 'ja');
      });
  }

  function timetableWeekdays(mitoriState, sharedClassId) {
    const dayNumbers = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
    const tileIds = new Set((Array.isArray(mitoriState?.classes) ? mitoriState.classes : [])
      .filter(tile => String(tile?.sharedClassId || tile?.id || '') === sharedClassId)
      .map(tile => String(tile.id)));
    if (!tileIds.size) return [];
    return Object.entries(dayNumbers)
      .filter(([day]) => Object.values(mitoriState?.timetable?.[day] || {}).some(tileId => tileIds.has(String(tileId))))
      .map(([, dayNumber]) => dayNumber);
  }

  function lessonBoardDates(mitoriState, sharedClassId) {
    const tileIds = new Set((Array.isArray(mitoriState?.classes) ? mitoriState.classes : [])
      .filter(tile => String(tile?.sharedClassId || tile?.id || '') === sharedClassId)
      .map(tile => String(tile.id)));
    const entries = Object.entries(mitoriState?.board && typeof mitoriState.board === 'object' ? mitoriState.board : {})
      .filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      .sort(([left], [right]) => left.localeCompare(right));
    return {
      boardDates: entries.map(([date]) => date),
      lessonDates: entries
        .filter(([, board]) => Object.values(board && typeof board === 'object' ? board : {}).some(tileId => tileIds.has(String(tileId))))
        .map(([date]) => date),
    };
  }

  function syncCatalog(checklistState, mitoriState, now = new Date().toISOString()) {
    const nextState = clone(checklistState && typeof checklistState === 'object' ? checklistState : {}) || {};
    nextState.classRefs = nextState.classRefs && typeof nextState.classRefs === 'object' && !Array.isArray(nextState.classRefs)
      ? nextState.classRefs
      : {};
    let sequence = Math.max(1, Number(nextState.nextStudentSequence) || 1);
    const warnings = [];
    const grades = Array.isArray(mitoriState?.grades)
      ? mitoriState.grades.filter(grade => grade?.id).map(grade => ({ id: String(grade.id), name: String(grade.name || '') }))
      : [];
    const classes = [];
    const currentClassIds = new Set();

    for (const sourceClass of Array.isArray(mitoriState?.sharedClasses) ? mitoriState.sharedClasses : []) {
      if (!sourceClass?.id) continue;
      const classId = String(sourceClass.id);
      currentClassIds.add(classId);
      const prior = nextState.classRefs[classId] && typeof nextState.classRefs[classId] === 'object'
        ? nextState.classRefs[classId]
        : {};
      const previousByNumber = prior.studentsByNumber && typeof prior.studentsByNumber === 'object'
        ? prior.studentsByNumber
        : {};
      const previousActive = Object.values(previousByNumber).filter(student => student?.id).map(clone);
      const previousArchived = Array.isArray(prior.archivedStudents)
        ? prior.archivedStudents.filter(student => student?.id).map(clone)
        : [];
      const candidatesById = new Map([...previousActive, ...previousArchived].map(student => [String(student.id), student]));
      const usedIds = new Set();
      const studentsByNumber = {};
      const students = [];
      const sourceRoster = mitoriState?.sharedClassData?.[classId]?.roster;

      for (const row of rosterRows(sourceRoster)) {
        const key = identityKey(row);
        const sameNumber = previousByNumber[row.number];
        let chosen = null;
        if (sameNumber?.id && identityKey(sameNumber) === key) chosen = sameNumber;
        if (!chosen && key) {
          const matches = [...candidatesById.values()].filter(candidate => !usedIds.has(String(candidate.id)) && identityKey(candidate) === key);
          if (matches.length === 1) chosen = matches[0];
          if (matches.length > 1) warnings.push({ code: 'ambiguous-student-match', classId, number: row.number, name: row.name, kana: row.kana });
        }
        if (!chosen) {
          if (sameNumber?.id && identityKey(sameNumber) !== key) {
            warnings.push({ code: 'attendance-number-reassigned', classId, number: row.number, previousStudentId: String(sameNumber.id) });
          }
          chosen = { id: `mc_student_${sequence++}` };
        }
        const student = { id: String(chosen.id), number: row.number, name: row.name, kana: row.kana };
        usedIds.add(student.id);
        studentsByNumber[row.number] = student;
        students.push(student);
      }

      const archivedStudents = [...candidatesById.values()]
        .filter(student => !usedIds.has(String(student.id)))
        .map(student => ({ ...student, archivedAt: student.archivedAt || now }));
      nextState.classRefs[classId] = {
        studentsByNumber,
        archivedStudents,
        lastKnown: {
          school: String(sourceClass.school || ''),
          name: String(sourceClass.name || ''),
          gradeId: String(sourceClass.gradeId || ''),
        },
        syncedAt: now,
      };
      const boardSchedule = lessonBoardDates(mitoriState, classId);
      classes.push({
        id: classId,
        school: String(sourceClass.school || ''),
        name: String(sourceClass.name || ''),
        gradeId: String(sourceClass.gradeId || ''),
        count: Math.max(0, Number(sourceClass.count) || 0),
        weekdays: timetableWeekdays(mitoriState, classId),
        lessonDates: boardSchedule.lessonDates,
        boardDates: boardSchedule.boardDates,
        students,
      });
    }

    for (const [classId, reference] of Object.entries(nextState.classRefs)) {
      if (currentClassIds.has(classId)) continue;
      reference.missing = true;
      warnings.push({ code: 'missing-class-reference', classId });
    }
    nextState.nextStudentSequence = sequence;
    return { catalog: { grades, classes }, nextState, warnings };
  }

  return { syncCatalog };
});
