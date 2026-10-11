(function initMitoriChecklistApp(root) {
  const Model = root.MitoriChecklistModel;
  const Workspace = root.MitoriChecklistWorkspace;
  const Palette = root.MitoriChecklistPalette;
  const Domain = root.MitoriChecklistDomain;
  const Interactions = root.MitoriChecklistInteractions;
  const Bridge = root.MitoriChecklistBridge;
  const Storage = root.MitoriChecklistStorage;
  const PaletteEditor = root.MitoriChecklistPaletteSettings;
  const Settings = root.MitoriChecklistSettings;
  const Backup = root.MitoriChecklistBackup;
  const ExportModel = root.MitoriChecklistExportModel;
  const CsvExport = root.MitoriChecklistCsv;
  const XlsxExport = root.MitoriChecklistXlsx;
  const PrintExport = root.MitoriChecklistPrint;

  function clone(value) { return structuredClone(value); }
  function unique(values) { return [...new Set(values.filter(Boolean))]; }
  function id(prefix) {
    const suffix = root.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${suffix}`;
  }
  function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }
  function dateText(value) {
    if (!value || Number.isNaN(Date.parse(value))) return '未保存';
    return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }

  async function init(options = {}) {
    if (!Model || !Workspace || !Palette || !Domain || !Interactions || !Bridge || !Storage || !PaletteEditor || !Settings || !Backup || !ExportModel || !CsvExport || !XlsxExport || !PrintExport) throw new Error('チェック表の起動に必要なファイルを読み込めません');
    const document = options.root || root.document;
    const getMitoriState = options.getMitoriState || (() => ({}));
    const notify = options.notify || (message => root.alert(message));
    const ask = options.confirm || (message => root.confirm(message));
    const openMainSettings = options.openMainSettings || (() => {});
    const storage = await Storage.openChecklistStorage({ indexedDB: options.indexedDB || root.indexedDB });
    const saveStatusModel = Interactions.createSaveStatusModel({ locale: 'ja-JP' });
    const headerTouchActivation = Interactions.createDoubleActivation({ maxDelayMs: 500, maxDistancePx: 16 });
    storage.subscribeStatus(status => {
      const view = saveStatusModel.update(status.status, { savedAt: status.savedAt, error: status.error });
      const box = document.getElementById('checklistSaveStatus');
      if (!box) return;
      box.querySelector('b').textContent = view.label;
      box.querySelector('small').textContent = view.savedAtText;
      box.title = view.error || '';
    });
    let workspace;
    let catalog = { grades: [], classes: [] };
    let warnings = [];
    let screen = 'list';
    let editingSheetId = null;
    let activeSheetId = null;
    let activeTarget = null;
    let selectedCell = null;
    let columnDraft = null;
    let settingsSection = 'palette';
    let selectedPaletteId = null;
    let paletteDraft = null;
    let editingGroupId = null;
    let pendingRestoreInspection = null;
    let filters = { school: '', grade: '' };

    const byId = target => document.getElementById(target);
    const listScreen = byId('checklistListScreen');
    const editorScreen = byId('checklistEditorScreen');
    const targetScreen = byId('checklistTargetScreen');
    const recordScreen = byId('checklistRecordScreen');
    const settingsScreen = byId('checklistSettingsScreen');

    function classIdsForSheet(sheet) {
      if (sheet.scope.type === 'class') return [sheet.scope.classId];
      return workspace.groups.find(group => group.id === sheet.scope.groupId)?.classIds || [];
    }

    function sheetClasses(sheet) {
      const ids = new Set(classIdsForSheet(sheet));
      return workspace.classes.filter(item => ids.has(item.id));
    }

    function hideChecklistScreens() {
      [listScreen, editorScreen, targetScreen, recordScreen, settingsScreen].forEach(item => item.classList.remove('active'));
    }

    function currentSheet() {
      return workspace.sheetDefinitions.find(item => item.id === activeSheetId) || null;
    }

    function targetParts(value = activeTarget) {
      const [kind, targetId] = String(value || '').split(':');
      return { kind, targetId };
    }

    function targetClassIds(value = activeTarget) {
      const { kind, targetId } = targetParts(value);
      if (kind === 'class') return [targetId];
      return workspace.groups.find(group => group.id === targetId)?.classIds || [];
    }

    function sheetSupportsTarget(sheet, value = activeTarget) {
      if (!sheet) return false;
      const ids = classIdsForSheet(sheet);
      const targetIds = targetClassIds(value);
      return targetIds.length > 0 && targetIds.every(classId => ids.includes(classId));
    }

    function recordedStudentIds(classId) {
      const result = new Set();
      const previous = workspace?.classes?.find(item => item.id === classId);
      for (const student of previous?.students || []) {
        const suffix = `:${student.id}`;
        const used = Object.values(workspace.classRecords?.[classId] || {}).some(bucket => (
          [...Object.keys(bucket.values || {}), ...Object.keys(bucket.meta || {})].some(key => key.endsWith(suffix))
        ));
        if (used) result.add(student.id);
      }
      return result;
    }

    function synchronizeCatalog() {
      const synced = Bridge.syncCatalog(workspace, getMitoriState());
      catalog = synced.catalog;
      warnings = synced.warnings;
      const gradeNames = new Map(catalog.grades.map(grade => [grade.id, grade.name]));
      const previousClasses = new Map((workspace.classes || []).map(item => [item.id, item]));
      const nextClasses = [];
      for (const source of catalog.classes) {
        const previous = previousClasses.get(source.id);
        const currentStudents = source.students.map(student => ({
          id: student.id,
          no: student.number,
          name: student.name || `（未登録 ${student.number}番）`,
          kana: student.kana || ''
        }));
        const usedIds = new Set(currentStudents.map(student => student.id));
        const usedNumbers = new Set(currentStudents.map(student => student.no));
        const keepIds = recordedStudentIds(source.id);
        let archiveNumber = 900001;
        for (const oldStudent of previous?.students || []) {
          if (usedIds.has(oldStudent.id) || !keepIds.has(oldStudent.id)) continue;
          while (usedNumbers.has(String(archiveNumber))) archiveNumber += 1;
          currentStudents.push({ ...oldStudent, no: String(archiveNumber++), archived: true });
        }
        if (!currentStudents.length && !previous) continue;
        nextClasses.push({
          id: source.id,
          school: source.school,
          name: source.name,
          year: gradeNames.get(source.gradeId) || source.gradeId || previous?.year || '',
          gradeId: source.gradeId,
          count: currentStudents.length,
          weekdays: previous?.weekdays || [],
          exceptions: previous?.exceptions || {},
          students: currentStudents.length ? currentStudents : previous.students
        });
        previousClasses.delete(source.id);
      }
      const referenced = new Set();
      for (const sheet of workspace.sheetDefinitions || []) {
        if (sheet.scope.type === 'class') referenced.add(sheet.scope.classId);
      }
      for (const group of workspace.groups || []) group.classIds.forEach(classId => referenced.add(classId));
      previousClasses.forEach((previous, classId) => { if (referenced.has(classId)) nextClasses.push(previous); });
      workspace = synced.nextState;
      workspace.classes = nextClasses;
      workspace.classRecords = workspace.classRecords || {};
      nextClasses.forEach(item => { workspace.classRecords[item.id] = workspace.classRecords[item.id] || {}; });
      workspace = Workspace.migrateWorkspace(workspace);
    }

    async function persist() {
      workspace.savedAt = new Date().toISOString();
      storage.save(workspace);
      await storage.flush();
    }

    function paletteOptions(selectedId = '') {
      return workspace.preferences.palettes.map(palette => (
        `<option value="${escapeText(palette.id)}"${palette.id === selectedId ? ' selected' : ''}>${escapeText(palette.name)}</option>`
      )).join('');
    }

    function filterPills(target, entries, activeValue, attribute) {
      target.innerHTML = entries.map(([value, label]) => `<button type="button" class="checklistFilterPill${value === activeValue ? ' active' : ''}" ${attribute}="${escapeText(value)}">${escapeText(label)}</button>`).join('');
    }

    function renderFilters() {
      const schools = unique(workspace.classes.map(item => item.school)).sort((a, b) => a.localeCompare(b, 'ja'));
      if (filters.school && !schools.includes(filters.school)) filters.school = '';
      if (filters.grade && filters.grade !== 'unassigned' && !catalog.grades.some(grade => grade.id === filters.grade)) filters.grade = '';
      const gradeEntries = [['', 'すべて'], ...catalog.grades.map(grade => [grade.id, grade.name])];
      if (workspace.classes.some(item => !item.gradeId)) gradeEntries.push(['unassigned', '学年未設定']);
      filterPills(byId('checklistSchoolFilter'), [['', 'すべて'], ...schools.map(name => [name, name])], filters.school, 'data-checklist-school-filter');
      filterPills(byId('checklistGradeFilter'), gradeEntries, filters.grade, 'data-checklist-grade-filter');
    }

    function cardMenu(sheet) {
      return `<details class="checklistCardMenu"><summary aria-label="${escapeText(sheet.name)}のメニュー">•••</summary><div>
        <button type="button" data-action="edit" data-sheet-id="${sheet.id}">編集</button>
        <button type="button" data-action="duplicate" data-sheet-id="${sheet.id}">複製</button>
        <button type="button" data-action="classes" data-sheet-id="${sheet.id}">使用クラス変更</button>
        <button type="button" data-action="archive" data-sheet-id="${sheet.id}">保管</button>
        <button type="button" class="dangerText" data-action="delete" data-sheet-id="${sheet.id}">削除</button>
      </div></details>`;
    }

    function renderList() {
      renderFilters();
      const grid = byId('checklistSheetGrid');
      let sheets = workspace.sheetDefinitions.filter(sheet => !sheet.archivedAt);
      sheets = sheets.filter(sheet => {
        const classes = sheetClasses(sheet);
        return (!filters.school || classes.some(item => item.school === filters.school))
          && (!filters.grade || classes.some(item => filters.grade === 'unassigned' ? !item.gradeId : item.gradeId === filters.grade));
      });
      sheets.sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
      if (!sheets.length) {
        grid.innerHTML = `<div class="checklistEmpty">${workspace.sheetDefinitions.some(sheet => !sheet.archivedAt) ? '条件に合うチェック表はありません。' : '作成済みチェック表はありません。「＋ チェック表を作成」から始められます。'}</div>`;
        return;
      }
      grid.innerHTML = sheets.map(sheet => {
        const classes = sheetClasses(sheet);
        const schools = unique(classes.map(item => item.school || '学校名未設定'));
        const grades = unique(classes.map(item => catalog.grades.find(grade => grade.id === item.gradeId)?.name || item.year || '学年未設定'));
        return `<article class="checklistSheetCard" data-sheet-id="${sheet.id}" tabindex="0">
          <div class="checklistCardTop"><div><div class="checklistCardType">${sheet.type === 'submission' ? '提出物' : sheet.type === 'evaluation' ? '活動評価' : '点数記録'}</div><h3>${escapeText(sheet.name)}</h3></div>${cardMenu(sheet)}</div>
          <div class="checklistCardMeta"><span>${escapeText(schools.join('・'))}</span><span>${escapeText(grades.join('・'))}</span><span>${sheet.columns.length}列</span></div>
          <div class="checklistCardClasses">${classes.map(item => `<span>${escapeText(item.name)}</span>`).join('')}</div>
          <div class="checklistCardUpdated">最終更新 ${dateText(sheet.updatedAt || workspace.savedAt)}</div>
        </article>`;
      }).join('');
    }

    function renderClassChoices(selectedIds = []) {
      const selected = new Set(selectedIds);
      const gradeNames = new Map(catalog.grades.map(grade => [grade.id, grade.name]));
      const groups = new Map();
      for (const source of catalog.classes) {
        const key = `${source.school || '学校名未設定'}\u0000${source.gradeId || ''}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(source);
      }
      const html = [...groups.entries()].map(([key, classes]) => {
        const [school, gradeId] = key.split('\u0000');
        const usable = new Set(workspace.classes.map(item => item.id));
        return `<section class="checklistClassGroup" data-school="${escapeText(school)}" data-grade-id="${escapeText(gradeId)}">
          <div class="checklistClassGroupHeader"><div><strong>${escapeText(school)}</strong><span>${escapeText(gradeNames.get(gradeId) || '学年未設定')}</span></div><button type="button" data-select-group="${escapeText(key)}">このまとまりをすべて選択</button></div>
          <div class="checklistClassOptions">${classes.map(item => `<label class="checklistClassOption${usable.has(item.id) ? '' : ' disabled'}"><input type="checkbox" data-checklist-class-id="${item.id}" value="${item.id}"${selected.has(item.id) ? ' checked' : ''}${usable.has(item.id) ? '' : ' disabled'}><span><b>${escapeText(item.name)}</b><small>${item.students.length ? `${item.students.length}名` : '名簿未登録'}</small></span></label>`).join('')}</div>
        </section>`;
      }).join('');
      byId('checklistClassChoices').innerHTML = html || '<div class="checklistEmpty">先に各種設定の「クラス設定」でクラスと名簿を登録してください。</div>';
    }

    function showEditor(sheetId = null) {
      editingSheetId = sheetId;
      const sheet = sheetId ? workspace.sheetDefinitions.find(item => item.id === sheetId) : null;
      screen = 'editor';
      hideChecklistScreens();
      editorScreen.classList.add('active');
      byId('checklistEditorTitle').textContent = sheet ? 'チェック表を編集' : 'チェック表を作成';
      byId('checklistNameInput').value = sheet?.name || '';
      byId('checklistTypeInput').value = sheet?.type || 'submission';
      const defaultPaletteId = workspace.preferences.defaultPaletteIds[sheet?.type === 'evaluation' ? 'activity' : sheet?.type === 'number' ? 'numeric' : 'submission'];
      byId('checklistPaletteInput').innerHTML = paletteOptions(sheet?.columns?.[0]?.paletteSnapshot?.paletteId || defaultPaletteId);
      renderClassChoices(sheet ? classIdsForSheet(sheet) : []);
      byId('checklistEditorError').textContent = '';
    }

    function openList() {
      screen = 'list';
      editingSheetId = null;
      activeSheetId = null;
      activeTarget = null;
      selectedCell = null;
      byId('checklistInputPalette').hidden = true;
      hideChecklistScreens();
      listScreen.classList.add('active');
      renderList();
    }

    function defaultColumn(type, paletteId) {
      const palette = workspace.preferences.palettes.find(item => item.id === paletteId);
      return {
        title: type === 'submission' ? '提出物1' : type === 'evaluation' ? '活動1' : '得点1',
        due: '', base: 5, interval: 3, penalty: 1, basis: type === 'submission' ? 'days' : 'none',
        redoPenalty: 1, zeroDays: 30, zeroFloor: true, includeInTotal: true, hidden: false,
        paletteSnapshot: palette ? Palette.snapshotPalette(palette) : null,
        inputMethod: type === 'number' ? 'number' : null
      };
    }

    function scopeForClasses(classIds, sheetName) {
      if (classIds.length === 1) return { type: 'class', classId: classIds[0] };
      workspace = Workspace.createGroup(workspace, { name: `${sheetName} 使用クラス`, classIds }, { idFactory: id });
      const group = workspace.groups.at(-1);
      group.autoSheetGroup = true;
      return { type: 'group', groupId: group.id };
    }

    async function saveEditor() {
      const name = byId('checklistNameInput').value.trim();
      const type = byId('checklistTypeInput').value;
      const paletteId = byId('checklistPaletteInput').value;
      const classIds = [...document.querySelectorAll('[data-checklist-class-id]:checked')].map(input => input.value);
      const error = byId('checklistEditorError');
      if (!name) { error.textContent = 'チェック表名を入力してください。'; return; }
      if (!classIds.length) { error.textContent = '使用するクラスを1つ以上選択してください。'; return; }
      try {
        if (editingSheetId) {
          const sheet = workspace.sheetDefinitions.find(item => item.id === editingSheetId);
          const oldClassIds = classIdsForSheet(sheet);
          if (oldClassIds.slice().sort().join('|') !== classIds.slice().sort().join('|')) {
            if (Object.values(workspace.classRecords).some(bySheet => Object.keys(bySheet[editingSheetId]?.values || {}).length)) {
              throw new Error('記録があるチェック表の使用クラス変更は、記録画面から行ってください。');
            }
            oldClassIds.forEach(classId => { delete workspace.classRecords[classId]?.[editingSheetId]; });
            sheet.scope = scopeForClasses(classIds, name);
            sheet.dueDatesByClass = Object.fromEntries(classIds.map(classId => [classId, Object.fromEntries(sheet.columns.map(column => [column.id, '']))]));
            classIds.forEach(classId => {
              workspace.classRecords[classId] = workspace.classRecords[classId] || {};
              workspace.classRecords[classId][editingSheetId] = { values: {}, meta: {} };
            });
          }
          workspace = Workspace.updateSheetDefinition(workspace, editingSheetId, { name, type, columns: sheet.columns, dueDatesByClass: sheet.dueDatesByClass });
        } else {
          const scope = scopeForClasses(classIds, name);
          workspace = Workspace.createSheetDefinition(workspace, { name, type, scope, columns: [defaultColumn(type, paletteId)] }, { idFactory: id });
          editingSheetId = workspace.sheetDefinitions.at(-1).id;
        }
        const savedSheet = workspace.sheetDefinitions.find(item => item.id === editingSheetId);
        savedSheet.updatedAt = new Date().toISOString();
        await persist();
        openList();
      } catch (caught) {
        error.textContent = caught?.message || 'チェック表を保存できませんでした。';
      }
    }

    async function duplicateSheet(sheetId) {
      const source = workspace.sheetDefinitions.find(item => item.id === sheetId);
      if (!source) return;
      workspace = Workspace.createSheetDefinition(workspace, {
        name: `${source.name}（複製）`, type: source.type, scope: clone(source.scope),
        columns: source.columns.map(column => ({ ...clone(column), id: undefined })), dueDatesByClass: source.dueDatesByClass
      }, { idFactory: id });
      workspace.sheetDefinitions.at(-1).updatedAt = new Date().toISOString();
      await persist();
      renderList();
    }

    async function archiveSheet(sheetId) {
      workspace = Workspace.archiveSheet(workspace, sheetId);
      await persist();
      renderList();
    }

    async function deleteSheet(sheetId) {
      const sheet = workspace.sheetDefinitions.find(item => item.id === sheetId);
      if (!sheet || !ask(`「${sheet.name}」と、このチェック表内の記録を削除しますか？\n削除後は元に戻せません。`)) return;
      if (!sheet.archivedAt) workspace = Workspace.archiveSheet(workspace, sheetId);
      workspace = Workspace.deleteArchivedSheet(workspace, sheetId);
      await persist();
      renderList();
    }

    function openTargetChooser(sheetId) {
      const sheet = workspace.sheetDefinitions.find(item => item.id === sheetId);
      if (!sheet) return;
      activeSheetId = sheetId;
      screen = 'target';
      hideChecklistScreens();
      targetScreen.classList.add('active');
      byId('checklistTargetTitle').textContent = `「${sheet.name}」を記録するクラス`;
      const classes = sheetClasses(sheet);
      const choices = classes.map(item => `<button class="checklistTargetCard" type="button" data-checklist-target="class:${item.id}"><b>${escapeText(item.name)}</b><small>${escapeText(item.school || '学校名未設定')}・${item.students.filter(student => !student.archived).length}名</small></button>`);
      if (sheet.scope.type === 'group') {
        const group = workspace.groups.find(item => item.id === sheet.scope.groupId);
        choices.unshift(`<button class="checklistTargetCard" type="button" data-checklist-target="group:${group.id}"><b>${escapeText(group.name)}</b><small>${classes.length}クラスの名簿を下方向につなげて表示</small></button>`);
      }
      byId('checklistTargetChoices').innerHTML = choices.join('');
    }

    function openSheet(sheetId, target = null) {
      const sheet = workspace.sheetDefinitions.find(item => item.id === sheetId);
      if (!sheet) return;
      const classes = sheetClasses(sheet);
      if (!target) {
        if (classes.length === 1) target = `class:${classes[0].id}`;
        else { openTargetChooser(sheetId); return; }
      }
      activeSheetId = sheetId;
      activeTarget = target;
      workspace.ui.currentSheetId = sheetId;
      const parts = targetParts(target);
      workspace.ui.currentClassId = parts.kind === 'class' ? parts.targetId : (targetClassIds(target)[0] || null);
      workspace.ui.currentGroupId = parts.kind === 'group' ? parts.targetId : null;
      workspace.ui.recordMode = parts.kind === 'group' ? 'combined' : 'class';
      workspace.ui.view = 'record';
      screen = 'record';
      hideChecklistScreens();
      recordScreen.classList.add('active');
      renderRecord();
    }

    function targetOptions(sheet) {
      const classes = sheetClasses(sheet);
      const options = classes.map(item => `<option value="class:${item.id}">${escapeText(item.name)}</option>`);
      if (sheet.scope.type === 'group') {
        const group = workspace.groups.find(item => item.id === sheet.scope.groupId);
        options.unshift(`<option value="group:${group.id}">${escapeText(group.name)}（合同）</option>`);
      }
      return options.join('');
    }

    function availableSheetsForTarget() {
      const { kind, targetId } = targetParts();
      return kind === 'group'
        ? Workspace.sheetsForGroup(workspace, targetId)
        : Workspace.availableSheetsForClass(workspace, targetId);
    }

    function recordKey(columnId, studentId) { return Model.recordKey(columnId, studentId); }
    function classBucket(classId, sheetId = activeSheetId) {
      const bucket = workspace.classRecords[classId]?.[sheetId];
      if (!bucket) return null;
      bucket.lockedColumns = bucket.lockedColumns && typeof bucket.lockedColumns === 'object' ? bucket.lockedColumns : {};
      return bucket;
    }

    function columnForClass(sheet, column, classId) {
      return { ...column, due: sheet.dueDatesByClass?.[classId]?.[column.id] ?? column.due ?? '' };
    }

    function localDateKey() {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    function recordRows(sheet = currentSheet()) {
      const { kind, targetId } = targetParts();
      return Workspace.rowsForSheet(workspace, {
        sheetId: sheet.id,
        classId: kind === 'class' ? targetId : null,
        groupId: kind === 'group' ? targetId : null,
        mode: kind === 'group' ? 'combined' : 'class'
      }).filter(row => row.kind === 'section' || !row.student?.archived);
    }

    function scoreCell(sheet, column, row) {
      const bucket = classBucket(row.classId, sheet.id);
      const key = recordKey(column.id, row.studentId);
      const classRecord = workspace.classes.find(item => item.id === row.classId);
      return Domain.scoreRecord({
        sheetType: sheet.type,
        column: columnForClass(sheet, column, row.classId),
        value: bucket?.values?.[key] || '',
        meta: bucket?.meta?.[key] || {},
        schedule: { weekdays: classRecord?.weekdays || [], exceptions: classRecord?.exceptions || {} },
        today: localDateKey()
      });
    }

    function rowTotal(sheet, row) {
      const scores = sheet.columns.filter(column => column.includeInTotal).map(column => scoreCell(sheet, column, row)).filter(value => value !== null);
      return scores.length ? scores.reduce((sum, value) => sum + value, 0) : null;
    }

    function columnStats(sheet, column, rows) {
      let missing = 0, redo = 0;
      for (const row of rows.filter(item => item.kind === 'student')) {
        const bucket = classBucket(row.classId, sheet.id);
        const key = recordKey(column.id, row.studentId);
        const value = bucket?.values?.[key] || '';
        if (!value) missing += 1;
        if (value === '再' || bucket?.meta?.[key]?.redo) redo += 1;
      }
      return { missing, redo };
    }

    function columnDueText(sheet, column) {
      const dates = targetClassIds().map(classId => sheet.dueDatesByClass?.[classId]?.[column.id] || '').filter(Boolean);
      if (!dates.length) return '期限なし';
      if (new Set(dates).size > 1) return 'クラス別';
      const [, month, day] = dates[0].split('-');
      return `${Number(month)}/${Number(day)}`;
    }

    function isColumnLocked(columnId) {
      const ids = targetClassIds();
      return ids.length > 0 && ids.every(classId => Boolean(classBucket(classId)?.lockedColumns?.[columnId]));
    }

    function renderRecord() {
      const sheet = currentSheet();
      if (!sheet || !sheetSupportsTarget(sheet)) { openList(); return; }
      const targetSelect = byId('checklistTargetSelect');
      targetSelect.innerHTML = targetOptions(sheet);
      targetSelect.value = activeTarget;
      const sheetSelect = byId('checklistSheetSelect');
      sheetSelect.innerHTML = availableSheetsForTarget().map(item => `<option value="${item.id}">${escapeText(item.name)}</option>`).join('');
      sheetSelect.value = activeSheetId;
      const rows = recordRows(sheet);
      const headerCells = sheet.columns.map(column => {
        const stats = columnStats(sheet, column, rows);
        const locked = isColumnLocked(column.id);
        return `<th class="checklistColumnHeader" data-column-id="${column.id}" data-locked="${locked}"><details class="checklistColumnMenu"><summary aria-label="列メニュー">•••</summary><div><button type="button" data-column-action="edit" data-column-id="${column.id}">編集</button><button type="button" data-column-action="delete" data-column-id="${column.id}">削除</button></div></details><div class="checklistColumnTitle">${escapeText(column.title)}</div><div class="checklistColumnPoints">${column.base}点</div><div class="checklistColumnDue">${columnDueText(sheet, column)}</div><div class="checklistColumnStats">未${stats.missing}/再${stats.redo}</div><div class="checklistColumnState"><span title="ダブルタップで切替">${locked ? '🔒' : '🔓'}</span><input type="checkbox" data-total-column-id="${column.id}" aria-label="${escapeText(column.title)}を合計に含める"${column.includeInTotal ? ' checked' : ''}></div></th><th class="checklistAddColumnHead"><button type="button" data-add-column-after="${column.id}" aria-label="${escapeText(column.title)}の右に列を追加">＋</button></th>`;
      }).join('');
      const bodyRows = rows.map(row => {
        if (row.kind === 'section') return targetParts().kind === 'group' ? `<tr class="checklistClassSection"><td colspan="${sheet.columns.length * 2 + 2}">${escapeText(row.className)}</td></tr>` : '';
        const cells = sheet.columns.map(column => {
          const bucket = classBucket(row.classId, sheet.id);
          const key = recordKey(column.id, row.studentId);
          const value = bucket?.values?.[key] || '';
          const color = Palette.colorTokenForMark(value);
          return `<td class="checklistRecordCell${color ? ` mark-${color}` : ''}" data-record-class-id="${row.classId}" data-record-student-id="${row.studentId}" data-record-column-id="${column.id}">${escapeText(value)}</td><td class="checklistAddColumnCell"></td>`;
        }).join('');
        const total = rowTotal(sheet, row);
        return `<tr><th class="checklistStudentName">${escapeText(row.no)}　${escapeText(row.name)}</th>${cells}<td class="checklistTotalCell">${total === null ? '－' : total}</td></tr>`;
      }).join('');
      byId('checklistTableWrap').innerHTML = `<table class="checklistRecordTable"><thead><tr><th class="checklistNameHeader">番号・氏名</th>${headerCells}<th class="checklistTotalHeader">✓を付けた列の集計<br><button type="button" id="copyChecklistTotalsBtn">コピー</button></th></tr></thead><tbody>${bodyRows}</tbody></table>`;
    }

    function closePalette() {
      selectedCell = null;
      byId('checklistInputPalette').hidden = true;
    }

    function renderInputPalette() {
      if (!selectedCell) { closePalette(); return; }
      const sheet = currentSheet();
      const column = sheet.columns.find(item => item.id === selectedCell.columnId);
      if (!column) { closePalette(); return; }
      const bucket = classBucket(selectedCell.classId);
      if (bucket.lockedColumns[column.id]) { closePalette(); return; }
      const key = recordKey(column.id, selectedCell.studentId);
      const value = bucket.values[key] || '';
      const layout = Palette.paletteLayout(column.paletteSnapshot);
      byId('checklistPaletteTitle').textContent = column.title;
      byId('checklistPaletteValue').textContent = value ? `入力中：${value}` : '';
      const buttons = layout.buttons.map(button => `<button type="button" class="palette-${button.entry.color}" data-palette-entry-id="${button.entry.id}" data-palette-label="${escapeText(button.entry.label)}" data-span="${button.slotSpan}">${escapeText(button.entry.label)}</button>`).join('');
      const paletteButtons = byId('checklistPaletteButtons');
      paletteButtons.className = `checklistPaletteButtons palette-size-${paletteSize(column.paletteSnapshot.size)}`;
      paletteButtons.style.setProperty('--palette-columns', String(Math.max(1, layout.columns)));
      paletteButtons.innerHTML = buttons;
      byId('checklistInputPalette').hidden = false;
    }

    async function saveWorkspaceChange() {
      workspace = Workspace.migrateWorkspace(workspace);
      const sheet = currentSheet();
      if (sheet) sheet.updatedAt = new Date().toISOString();
      renderRecord();
      await persist();
    }

    async function clearSelectedCell() {
      if (!selectedCell) return;
      workspace = Workspace.clearRecordCell(workspace, selectedCell.classId, activeSheetId, selectedCell.columnId, selectedCell.studentId);
      closePalette();
      await saveWorkspaceChange();
    }

    function rowsForColumnAction() {
      return recordRows().filter(row => row.kind === 'student');
    }

    async function applyPaletteEntry(entryId) {
      if (!selectedCell) return;
      const sheet = currentSheet();
      const column = sheet.columns.find(item => item.id === selectedCell.columnId);
      const entry = column.paletteSnapshot.entries.find(item => item.id === entryId);
      if (!entry) return;
      const keepNumericPaletteOpen = sheet.type === 'number' && column.inputMethod === 'number' && /^\d$/.test(entry.label);
      const today = localDateKey();
      const applyValue = (row, value, meta = null, onlyBlank = false) => {
        const bucket = classBucket(row.classId);
        const key = recordKey(column.id, row.studentId);
        if (onlyBlank && bucket.values[key]) return;
        bucket.values[key] = value;
        if (meta) bucket.meta[key] = { ...(bucket.meta[key] || {}), ...meta };
        else delete bucket.meta[key];
      };
      const currentRow = { classId: selectedCell.classId, studentId: selectedCell.studentId };
      if (entry.action === 'batchReturn') {
        for (const row of rowsForColumnAction()) {
          const bucket = classBucket(row.classId);
          const key = recordKey(column.id, row.studentId);
          if (bucket.values[key] === '再' || bucket.meta[key]?.redo) bucket.meta[key] = { ...(bucket.meta[key] || {}), redo: true, returned: today };
        }
      } else if (['fillCircle', 'fillCross', 'fillA', 'fillC'].includes(entry.action)) {
        const value = ({ fillCircle: '○', fillCross: '×', fillA: 'A', fillC: 'C' })[entry.action];
        rowsForColumnAction().forEach(row => applyValue(row, value, null, true));
      } else if (entry.action === 'date') {
        applyValue(currentRow, today, { submitted: today });
      } else if (entry.action === 'redo') {
        const bucket = classBucket(selectedCell.classId);
        const key = recordKey(column.id, selectedCell.studentId);
        const previous = bucket.values[key];
        applyValue(currentRow, '再', { redo: true, initialSubmitted: /^\d{4}-\d{2}-\d{2}$/.test(previous) ? previous : (columnForClass(sheet, column, selectedCell.classId).due || today), submitted: null, returned: null });
      } else if (sheet.type === 'number' && column.inputMethod === 'number' && /^\d$/.test(entry.label)) {
        const bucket = classBucket(selectedCell.classId);
        const key = recordKey(column.id, selectedCell.studentId);
        const next = `${bucket.values[key] || ''}${entry.label}`.replace(/^0+(?=\d)/, '').slice(0, 6);
        applyValue(currentRow, next || '0');
      } else applyValue(currentRow, entry.label);
      if (!keepNumericPaletteOpen) closePalette();
      await saveWorkspaceChange();
      if (keepNumericPaletteOpen) renderInputPalette();
    }

    async function toggleColumnLock(columnId) {
      const next = !isColumnLocked(columnId);
      targetClassIds().forEach(classId => { classBucket(classId).lockedColumns[columnId] = next; });
      closePalette();
      await saveWorkspaceChange();
    }

    function openColumnEditor(columnId = null, afterId = null) {
      const sheet = currentSheet();
      const column = columnId ? sheet.columns.find(item => item.id === columnId) : null;
      columnDraft = { columnId, afterId };
      byId('checklistColumnDialogTitle').textContent = column ? '列を編集' : '列を追加';
      byId('checklistColumnTitleInput').value = column?.title || '';
      byId('checklistColumnPointsInput').value = column?.base ?? 5;
      const firstClassId = targetClassIds()[0];
      byId('checklistColumnDueInput').value = column ? (sheet.dueDatesByClass?.[firstClassId]?.[column.id] || '') : '';
      byId('checklistColumnPaletteInput').innerHTML = paletteOptions(column?.paletteSnapshot?.paletteId || workspace.preferences.defaultPaletteIds[sheet.type === 'evaluation' ? 'activity' : sheet.type === 'number' ? 'numeric' : 'submission']);
      byId('checklistColumnTotalInput').checked = column ? column.includeInTotal : true;
      byId('checklistColumnError').textContent = '';
      byId('checklistColumnModal').hidden = false;
    }

    function closeColumnEditor() {
      columnDraft = null;
      byId('checklistColumnModal').hidden = true;
    }

    async function saveColumnEditor() {
      const sheet = currentSheet();
      const title = byId('checklistColumnTitleInput').value.trim();
      if (!title) { byId('checklistColumnError').textContent = '列名を入力してください。'; return; }
      const points = Number(byId('checklistColumnPointsInput').value);
      if (!Number.isFinite(points) || points < 0) { byId('checklistColumnError').textContent = '配点を0以上で入力してください。'; return; }
      const palette = workspace.preferences.palettes.find(item => item.id === byId('checklistColumnPaletteInput').value);
      const due = byId('checklistColumnDueInput').value;
      const columns = sheet.columns.map(item => clone(item));
      if (columnDraft.columnId) {
        const index = columns.findIndex(item => item.id === columnDraft.columnId);
        columns[index] = { ...columns[index], title, base: points, includeInTotal: byId('checklistColumnTotalInput').checked, paletteSnapshot: Palette.snapshotPalette(palette) };
        targetClassIds().forEach(classId => {
          sheet.dueDatesByClass[classId] = sheet.dueDatesByClass[classId] || {};
          sheet.dueDatesByClass[classId][columnDraft.columnId] = due;
        });
      } else {
        const column = { ...defaultColumn(sheet.type, palette.id), title, base: points, due, includeInTotal: byId('checklistColumnTotalInput').checked };
        const index = Math.max(0, columns.findIndex(item => item.id === columnDraft.afterId) + 1);
        columns.splice(index, 0, column);
      }
      workspace = Workspace.updateSheetDefinition(workspace, sheet.id, { name: sheet.name, type: sheet.type, columns, dueDatesByClass: sheet.dueDatesByClass });
      activeSheetId = sheet.id;
      closeColumnEditor();
      await saveWorkspaceChange();
    }

    async function deleteColumn(columnId) {
      const sheet = currentSheet();
      const column = sheet.columns.find(item => item.id === columnId);
      const summary = Workspace.columnDeletionSummary(workspace, sheet.id, columnId);
      if (!ask(`「${column.title}」を削除しますか？\n${summary.recordCount}件の入力内容も削除され、元に戻せません。`)) return;
      try {
        workspace = Workspace.deleteSheetColumn(workspace, sheet.id, columnId);
        await saveWorkspaceChange();
      } catch (error) { notify(error.message); }
    }

    async function copyTotals() {
      const sheet = currentSheet();
      const totals = recordRows(sheet).filter(row => row.kind === 'student').map(row => rowTotal(sheet, row));
      await Interactions.writeClipboardText(Interactions.formatTotalsForClipboard(totals));
      notify('集計結果をコピーしました。');
    }

    function paletteSize(value) {
      return ['small', 'standard', 'large'].includes(value) ? value : 'standard';
    }

    function renderPalettePreview() {
      const preview = byId('checklistPalettePreview');
      if (!paletteDraft?.entries?.length) { preview.innerHTML = '<span class="small">ボタンを追加してください。</span>'; return; }
      const layout = Palette.paletteLayout(paletteDraft);
      const buttons = layout.buttons.map(button => `<button type="button" class="checklistPreviewButton palette-${button.entry.color}" data-span="${button.slotSpan}" tabindex="-1">${escapeText(button.entry.label)}</button>`).join('');
      preview.innerHTML = `<div class="checklistPalettePreviewShell"><div class="checklistPaletteHead"><b>入力パレット</b><button type="button" tabindex="-1" aria-label="閉じる">−</button></div><div class="checklistPaletteValue"></div><div class="checklistPaletteButtons palette-size-${paletteSize(paletteDraft.size)}" style="--palette-columns:${Math.max(1, layout.columns)}">${buttons}</div><button class="btn checklistPreviewClear" type="button" tabindex="-1">入力を取り消す</button></div>`;
    }

    function paletteEntryRow(entry, index) {
      const colorOptions = Palette.ALLOWED_COLORS.map(color => `<option value="${color}"${entry.color === color ? ' selected' : ''}>${color}</option>`).join('');
      const actions = [['mark','通常入力'],['date','日付'],['redo','再提出'],['batchReturn','再提出分を返却'],['fillCircle','残りを○'],['fillCross','残りを×'],['fillA','残りをA'],['fillC','残りをC']];
      return `<div class="checklistPaletteEntryRow" data-entry-id="${entry.id}"><input data-entry-field="label" value="${escapeText(entry.label)}" aria-label="表示文字"><select data-entry-field="color">${colorOptions}</select><input data-entry-field="score" type="number" step="0.5" value="${entry.score ?? ''}" aria-label="点数"><select data-entry-field="action">${actions.map(([value,label]) => `<option value="${value}"${entry.action === value ? ' selected' : ''}>${label}</option>`).join('')}</select><select data-entry-field="slotSpan"><option value="1"${entry.slotSpan === 1 ? ' selected' : ''}>1枠</option><option value="2"${entry.slotSpan === 2 ? ' selected' : ''}>2枠</option></select><label title="表示"><input data-entry-field="visible" type="checkbox"${entry.visible !== false ? ' checked' : ''}>表示</label><div class="checklistPaletteEntryMove"><button type="button" data-entry-move="-1"${index === 0 ? ' disabled' : ''}>↑</button><button type="button" data-entry-move="1"${index === paletteDraft.entries.length - 1 ? ' disabled' : ''}>↓</button><button class="checklistPaletteEntryDelete" type="button" data-entry-delete>削除</button></div></div>`;
    }

    function renderPaletteEditor({ preserveScroll = false } = {}) {
      const list = byId('checklistPaletteList');
      const oldListScroll = preserveScroll ? list.scrollTop : 0;
      const entryList = byId('checklistPaletteEntryList');
      const oldEntryScroll = preserveScroll ? entryList.scrollTop : 0;
      list.innerHTML = workspace.preferences.palettes.map(palette => {
        const name = palette.preset && !palette.name.endsWith('プリセット') ? `${palette.name}プリセット` : palette.name;
        const sizeLabel = ({ small:'小', standard:'標準', large:'大' })[paletteSize(palette.size)];
        return `<article class="checklistPaletteLibraryItem${palette.id === selectedPaletteId ? ' active' : ''}" data-palette-id="${palette.id}"><button type="button" class="checklistPaletteLibrarySelect" data-palette-select="${palette.id}"><strong>${escapeText(name)}</strong><small>${palette.scoringEnabled ? '点数連動' : '記号のみ'}・${sizeLabel}${palette.preset ? '' : '・保存済み'}</small></button><details class="checklistPaletteItemMenu"><summary aria-label="${escapeText(name)}のメニュー">…</summary><div><button type="button" data-palette-duplicate="${palette.id}">複製</button></div></details></article>`;
      }).join('');
      if (!paletteDraft) {
        const selected = workspace.preferences.palettes.find(item => item.id === selectedPaletteId) || workspace.preferences.palettes[0];
        selectedPaletteId = selected?.id || null;
        paletteDraft = selected ? PaletteEditor.createDraft(selected) : PaletteEditor.addEntry(PaletteEditor.blankDraft(), { label:'○', color:'rose' });
      }
      byId('checklistPaletteNameInput').value = paletteDraft.name;
      byId('checklistPaletteSizeInput').value = paletteDraft.size;
      byId('checklistPaletteScoringInput').checked = paletteDraft.scoringEnabled;
      const preset = Boolean(paletteDraft.preset);
      byId('checklistPaletteNameInput').disabled = preset;
      byId('checklistPaletteSizeInput').disabled = preset;
      byId('checklistPaletteScoringInput').disabled = preset;
      byId('saveChecklistPaletteBtn').disabled = preset;
      byId('deleteChecklistPaletteBtn').disabled = preset;
      byId('addChecklistPaletteEntryBtn').disabled = preset;
      entryList.innerHTML = paletteDraft.entries.map(paletteEntryRow).join('');
      entryList.querySelectorAll('input,select,button').forEach(control => { if (preset) control.disabled = true; });
      renderPalettePreview();
      if (preserveScroll) { list.scrollTop = oldListScroll; entryList.scrollTop = oldEntryScroll; }
    }

    function newPaletteDraft() {
      paletteDraft = PaletteEditor.addEntry(PaletteEditor.blankDraft({ id: id('palette') }), { label:'○', color:'rose', action:'mark' });
      selectedPaletteId = null;
      renderPaletteEditor({ preserveScroll: true });
      byId('checklistPaletteNameInput').focus();
    }

    async function savePaletteDraft() {
      paletteDraft.name = byId('checklistPaletteNameInput').value.trim();
      paletteDraft.size = byId('checklistPaletteSizeInput').value;
      paletteDraft.scoringEnabled = byId('checklistPaletteScoringInput').checked;
      try {
        if (!paletteDraft.entries.length) throw new Error('ボタンを1つ以上追加してください。');
        if (selectedPaletteId && workspace.preferences.palettes.some(item => item.id === selectedPaletteId && !item.preset)) {
          workspace.preferences = Palette.updateUserPalette(workspace.preferences, selectedPaletteId, PaletteEditor.toPaletteInput(paletteDraft));
        } else {
          const created = Palette.createUserPalette(workspace.preferences, PaletteEditor.toPaletteInput(paletteDraft));
          workspace.preferences = created.preferences;
          selectedPaletteId = created.paletteId;
        }
        paletteDraft = PaletteEditor.createDraft(workspace.preferences.palettes.find(item => item.id === selectedPaletteId));
        byId('checklistPaletteError').textContent = '';
        await persist();
        renderPaletteEditor({ preserveScroll: true });
      } catch (error) { byId('checklistPaletteError').textContent = error.message; }
    }

    async function duplicateSelectedPalette() {
      if (!selectedPaletteId) return;
      const result = Palette.duplicatePalette(workspace.preferences, selectedPaletteId, { idFactory: id });
      workspace.preferences = result.preferences;
      selectedPaletteId = result.paletteId;
      paletteDraft = PaletteEditor.createDraft(workspace.preferences.palettes.find(item => item.id === selectedPaletteId));
      await persist();
      renderPaletteEditor({ preserveScroll: true });
    }

    async function deleteSelectedPalette() {
      if (!selectedPaletteId || !ask(`「${paletteDraft.name}」を削除しますか？`)) return;
      try {
        workspace.preferences = Palette.deleteUserPalette(workspace.preferences, selectedPaletteId);
        selectedPaletteId = workspace.preferences.palettes[0]?.id || null;
        paletteDraft = null;
        await persist();
        renderPaletteEditor({ preserveScroll: true });
      } catch (error) { byId('checklistPaletteError').textContent = error.message; }
    }

    async function setDefaultPalette(sheetType) {
      if (!selectedPaletteId) return;
      const key = sheetType === 'evaluation' ? 'activity' : sheetType === 'number' ? 'numeric' : 'submission';
      const next = clone(workspace.preferences);
      next.defaultPaletteIds[key] = selectedPaletteId;
      workspace.preferences = Palette.validatePreferences(next);
      await persist();
      notify(`${Settings.sectionLabel('palette')}：${paletteDraft.name}を基本に設定しました。`);
    }

    function renderGroupSettings() {
      const classes = workspace.classes.filter(item => item.students.some(student => !student.archived));
      const group = workspace.groups.find(item => item.id === editingGroupId) || null;
      byId('checklistGroupNameInput').value = group?.name || '';
      byId('checklistGroupClassChoices').innerHTML = classes.map(item => `<label><input type="checkbox" data-group-class-id="${item.id}"${group?.classIds.includes(item.id) ? ' checked' : ''}>${escapeText(item.name)}</label>`).join('');
      byId('checklistGroupList').innerHTML = workspace.groups.length ? workspace.groups.map(item => `<article class="checklistGroupCard"><h3>${escapeText(item.name)}</h3><div class="small">${item.classIds.map(classId => escapeText(workspace.classes.find(value => value.id === classId)?.name || classId)).join('・')}</div><div class="checklistGroupCardActions"><button class="btn" type="button" data-group-edit="${item.id}">編集</button><button class="btn danger" type="button" data-group-delete="${item.id}">削除</button></div></article>`).join('') : '<div class="checklistEmpty">合同グループはまだありません。</div>';
    }

    async function saveGroup() {
      const name = byId('checklistGroupNameInput').value.trim();
      const classIds = [...document.querySelectorAll('[data-group-class-id]:checked')].map(item => item.dataset.groupClassId);
      try {
        workspace = editingGroupId ? Workspace.updateGroup(workspace, editingGroupId, { name, classIds }) : Workspace.createGroup(workspace, { name, classIds }, { idFactory: id });
        editingGroupId = null;
        await persist();
        renderGroupSettings();
      } catch (error) { notify(error.message); }
    }

    async function deleteGroup(groupId) {
      const group = workspace.groups.find(item => item.id === groupId);
      if (!group || !ask(`合同グループ「${group.name}」を削除しますか？`)) return;
      try { workspace = Workspace.deleteGroup(workspace, groupId, { idFactory: id }); editingGroupId = null; await persist(); renderGroupSettings(); }
      catch (error) { notify(error.message); }
    }

    function renderArchiveSettings() {
      const archived = workspace.sheetDefinitions.filter(sheet => sheet.archivedAt);
      byId('checklistArchiveList').innerHTML = archived.length ? archived.map(sheet => `<article class="checklistArchiveCard"><h3>${escapeText(sheet.name)}</h3><div class="small">保管日時 ${dateText(sheet.archivedAt)}</div><div class="checklistArchiveCardActions"><button class="btn" type="button" data-archive-restore="${sheet.id}">復元</button><button class="btn danger" type="button" data-archive-delete="${sheet.id}">完全削除</button></div></article>`).join('') : '<div class="checklistEmpty">保管済みシートはありません。</div>';
    }

    async function restoreArchivedSheet(sheetId) { workspace = Workspace.restoreSheet(workspace, sheetId); await persist(); renderArchiveSettings(); }
    async function permanentlyDeleteArchivedSheet(sheetId) {
      const sheet = workspace.sheetDefinitions.find(item => item.id === sheetId);
      const summary = Workspace.sheetDeletionSummary(workspace, sheetId);
      if (!sheet || !ask(`「${sheet.name}」を完全に削除しますか？\n${summary.recordCount}件の記録も削除され、元に戻せません。`)) return;
      workspace = Workspace.deleteArchivedSheet(workspace, sheetId);
      await persist();
      renderArchiveSettings();
    }

    function localDateIso() {
      const now = new Date();
      return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }

    function closeExportDialog() {
      byId('checklistExportModal').style.display = 'none';
      byId('checklistExportError').textContent = '';
    }

    function openExportDialog() {
      const sheet = currentSheet();
      if (!sheet) return;
      const currentIds = targetClassIds().filter(classId => classIdsForSheet(sheet).includes(classId));
      const allIds = classIdsForSheet(sheet);
      const labelFor = ids => ids.map(classId => workspace.classes.find(item => item.id === classId)?.name || classId).join('・');
      byId('checklistExportSheetName').textContent = `「${sheet.name}」を書き出します。`;
      byId('checklistExportCurrentLabel').textContent = labelFor(currentIds);
      byId('checklistExportAllLabel').textContent = `${allIds.length}クラス`;
      byId('checklistExportError').textContent = '';
      byId('checklistExportModal').style.display = 'flex';
    }

    function runChecklistExport() {
      const sheet = currentSheet();
      if (!sheet) return;
      const format = document.querySelector('input[name="checklistExportFormat"]:checked')?.value || 'xlsx';
      const scope = document.querySelector('input[name="checklistExportScope"]:checked')?.value || 'current';
      const classIds = scope === 'all' ? classIdsForSheet(sheet) : targetClassIds();
      try {
        const bundle = ExportModel.buildExportBundle(workspace, {
          sheetId: sheet.id,
          classIds,
          today: localDateIso(),
          exportedAt: new Date().toISOString()
        });
        if (format === 'xlsx') XlsxExport.download(bundle);
        else if (format === 'csv') CsvExport.download(bundle);
        else {
          const result = PrintExport.open(bundle, { blank: format === 'print-blank' });
          if (!result.ok) throw new Error('印刷画面を開けませんでした。ポップアップを許可して、もう一度お試しください。');
        }
        closeExportDialog();
      } catch (error) {
        byId('checklistExportError').textContent = error.message;
      }
    }

    function catalogSnapshot() {
      return {
        classes: catalog.classes.map(item => ({
          id: item.id,
          school: item.school,
          name: item.name,
          students: (item.students || []).map(student => ({
            id: student.id,
            number: student.number,
            name: student.name,
            kana: student.kana
          }))
        }))
      };
    }

    function renderRestoreInspection() {
      const target = byId('checklistRestoreInspection');
      const restoreButton = byId('restoreChecklistBackupBtn');
      restoreButton.disabled = !pendingRestoreInspection;
      if (!pendingRestoreInspection) {
        target.innerHTML = '';
        return;
      }
      const { summary, differences } = pendingRestoreInspection;
      const warning = differences.length
        ? `<div class="checklistRestoreSummary checklistRestoreWarning">現在の名簿との差異が${differences.length}件あります。記録は残したまま、現在のMITORI名簿と照合して復元します。</div>`
        : '<div class="checklistRestoreSummary">現在のMITORI名簿と一致しています。</div>';
      target.innerHTML = `<div class="checklistRestoreSummary"><b>${escapeText(dateText(summary.createdAt))}のバックアップ</b><br>使用中のシート ${summary.activeSheetCount}件／保管済み ${summary.archivedSheetCount}件／合同グループ ${summary.groupCount}件／パレット ${summary.paletteCount}件</div>${warning}`;
    }

    async function inspectRestoreFile(file) {
      pendingRestoreInspection = null;
      renderRestoreInspection();
      if (!file) return;
      try {
        pendingRestoreInspection = Backup.inspectRestore(await file.text(), catalogSnapshot());
        renderRestoreInspection();
      } catch (error) {
        byId('checklistRestoreInspection').innerHTML = `<div class="checklistRestoreSummary checklistRestoreWarning">${escapeText(error.message)}</div>`;
      }
    }

    async function restoreChecklistBackup() {
      if (!pendingRestoreInspection) return;
      const differenceText = pendingRestoreInspection.differences.length
        ? `\n現在の名簿との差異が${pendingRestoreInspection.differences.length}件あります。`
        : '';
      if (!ask(`現在のチェック表データを、このバックアップの内容に置き換えます。${differenceText}\nMITORIのクラス・名簿・授業記録は上書きしません。続けますか？`)) return;
      workspace = Backup.restoreBackup(pendingRestoreInspection);
      synchronizeCatalog();
      await persist();
      pendingRestoreInspection = null;
      byId('checklistRestoreFileInput').value = '';
      renderRestoreInspection();
      notify('チェック表のバックアップを復元しました。');
    }

    async function clearAllChecklistData() {
      if (!ask('チェック表のシート・評価記録・パレット・合同グループを完全に削除します。MITORIのクラス・名簿・授業記録は削除しません。先にバックアップを保存してください。続けますか？')) return;
      if (!ask('削除後は元に戻せません。復元には手動バックアップJSONが必要です。本当に完全削除しますか？')) return;
      workspace = Backup.clearChecklistData(workspace);
      synchronizeCatalog();
      await storage.clear();
      await persist();
      editingSheetId = null;
      activeSheetId = null;
      activeTarget = null;
      selectedCell = null;
      selectedPaletteId = null;
      paletteDraft = null;
      editingGroupId = null;
      pendingRestoreInspection = null;
      byId('checklistRestoreFileInput').value = '';
      showSettingsSection('backup');
      notify('チェック表データを完全に削除しました。MITORI本体のデータは残っています。');
    }

    function showSettingsSection(section) {
      settingsSection = ['palette','groups','archive','backup'].includes(section) ? section : 'palette';
      const mapping = { palette:'checklistPaletteSettingsPane', groups:'checklistGroupSettingsPane', archive:'checklistArchiveSettingsPane', backup:'checklistBackupSettingsPane' };
      document.querySelectorAll('.checklistSettingsPane').forEach(pane => pane.classList.toggle('active', pane.id === mapping[settingsSection]));
      const navMapping = { palette:'checklistPaletteSettingsNav', groups:'checklistGroupSettingsNav', archive:'checklistArchiveSettingsNav', backup:'checklistBackupSettingsNav' };
      Object.values(navMapping).forEach(id => byId(id).classList.toggle('active', id === navMapping[settingsSection]));
      if (settingsSection === 'palette') renderPaletteEditor({ preserveScroll: true });
      else if (settingsSection === 'groups') renderGroupSettings();
      else if (settingsSection === 'archive') renderArchiveSettings();
      else if (settingsSection === 'backup') renderRestoreInspection();
    }

    function openSettings(section = 'palette') {
      screen = 'settings';
      hideChecklistScreens();
      settingsScreen.classList.add('active');
      showSettingsSection(section);
    }

    function render() {
      if (screen === 'list') renderList();
      else if (screen === 'editor') showEditor(editingSheetId);
      else if (screen === 'target') openTargetChooser(activeSheetId);
      else if (screen === 'record') renderRecord();
      else if (screen === 'settings') openSettings(settingsSection);
    }

    const stored = await storage.load();
    try { workspace = stored ? Model.migrateState(stored) : Model.createBlankState(); }
    catch (error) {
      workspace = Model.createBlankState();
      warnings = [{ code: 'storage-recovery', message: error.message }];
    }
    synchronizeCatalog();
    await persist();

    byId('newChecklistBtn').addEventListener('click', () => showEditor());
    byId('checklistListSettingsBtn').addEventListener('click', () => openSettings('palette'));
    byId('checklistEditorBackBtn').addEventListener('click', openList);
    byId('saveChecklistBtn').addEventListener('click', saveEditor);
    byId('checklistSchoolFilter').addEventListener('click', event => { const button = event.target.closest('[data-checklist-school-filter]'); if (button) { filters.school = button.dataset.checklistSchoolFilter; renderList(); } });
    byId('checklistGradeFilter').addEventListener('click', event => { const button = event.target.closest('[data-checklist-grade-filter]'); if (button) { filters.grade = button.dataset.checklistGradeFilter; renderList(); } });
    byId('checklistClassChoices').addEventListener('click', event => {
      const button = event.target.closest('[data-select-group]');
      if (!button) return;
      const group = button.closest('.checklistClassGroup');
      const inputs = [...group.querySelectorAll('input[type="checkbox"]:not(:disabled)')];
      const allSelected = inputs.every(input => input.checked);
      inputs.forEach(input => { input.checked = !allSelected; });
      button.textContent = allSelected ? 'このまとまりをすべて選択' : 'このまとまりの選択を解除';
    });
    byId('checklistSheetGrid').addEventListener('click', async event => {
      const action = event.target.closest('[data-action]');
      if (action) {
        event.preventDefault();
        const sheetId = action.dataset.sheetId;
        if (action.dataset.action === 'edit' || action.dataset.action === 'classes') showEditor(sheetId);
        else if (action.dataset.action === 'duplicate') await duplicateSheet(sheetId);
        else if (action.dataset.action === 'archive') await archiveSheet(sheetId);
        else if (action.dataset.action === 'delete') await deleteSheet(sheetId);
        return;
      }
      const card = event.target.closest('.checklistSheetCard');
      if (card) openSheet(card.dataset.sheetId);
    });
    byId('checklistTargetBackBtn').addEventListener('click', openList);
    byId('checklistRecordBackBtn').addEventListener('click', openList);
    byId('checklistTargetChoices').addEventListener('click', event => {
      const choice = event.target.closest('[data-checklist-target]');
      if (choice) openSheet(activeSheetId, choice.dataset.checklistTarget);
    });
    byId('checklistTargetSelect').addEventListener('change', event => {
      activeTarget = event.target.value;
      workspace.ui.currentClassId = targetParts().kind === 'class' ? targetParts().targetId : targetClassIds()[0];
      workspace.ui.currentGroupId = targetParts().kind === 'group' ? targetParts().targetId : null;
      workspace.ui.recordMode = targetParts().kind === 'group' ? 'combined' : 'class';
      renderRecord();
    });
    byId('checklistSheetSelect').addEventListener('change', event => {
      activeSheetId = event.target.value;
      workspace.ui.currentSheetId = activeSheetId;
      closePalette();
      renderRecord();
    });
    byId('checklistTableWrap').addEventListener('click', async event => {
      const cell = event.target.closest('.checklistRecordCell');
      if (cell) {
        const bucket = classBucket(cell.dataset.recordClassId);
        if (bucket?.lockedColumns?.[cell.dataset.recordColumnId]) return;
        selectedCell = { classId: cell.dataset.recordClassId, studentId: cell.dataset.recordStudentId, columnId: cell.dataset.recordColumnId };
        renderInputPalette();
        return;
      }
      const add = event.target.closest('[data-add-column-after]');
      if (add) { openColumnEditor(null, add.dataset.addColumnAfter); return; }
      const action = event.target.closest('[data-column-action]');
      if (action) {
        if (action.dataset.columnAction === 'edit') openColumnEditor(action.dataset.columnId);
        else if (action.dataset.columnAction === 'delete') await deleteColumn(action.dataset.columnId);
        return;
      }
      if (event.target.closest('#copyChecklistTotalsBtn')) await copyTotals();
    });
    byId('checklistTableWrap').addEventListener('dblclick', async event => {
      if (event.target.closest('button,input,summary,details')) return;
      const header = event.target.closest('.checklistColumnHeader');
      if (header) await toggleColumnLock(header.dataset.columnId);
    });
    byId('checklistTableWrap').addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' || event.target.closest('button,input,summary,details')) {
        headerTouchActivation.reset();
        return;
      }
      const header = event.target.closest('.checklistColumnHeader');
      if (!header) { headerTouchActivation.reset(); return; }
      headerTouchActivation.pointerDown({ key:header.dataset.columnId, time:event.timeStamp, x:event.clientX, y:event.clientY });
    });
    byId('checklistTableWrap').addEventListener('pointerup', async event => {
      if (event.pointerType === 'mouse' || event.target.closest('button,input,summary,details')) return;
      const header = event.target.closest('.checklistColumnHeader');
      if (!header) { headerTouchActivation.reset(); return; }
      if (headerTouchActivation.pointerUp({ key:header.dataset.columnId, time:event.timeStamp, x:event.clientX, y:event.clientY })) {
        event.preventDefault();
        await toggleColumnLock(header.dataset.columnId);
      }
    });
    byId('checklistTableWrap').addEventListener('pointercancel', () => headerTouchActivation.reset());
    byId('checklistTableWrap').addEventListener('change', async event => {
      const checkbox = event.target.closest('[data-total-column-id]');
      if (!checkbox) return;
      const sheet = currentSheet();
      const columns = sheet.columns.map(column => column.id === checkbox.dataset.totalColumnId ? { ...clone(column), includeInTotal: checkbox.checked } : clone(column));
      workspace = Workspace.updateSheetDefinition(workspace, sheet.id, { name: sheet.name, type: sheet.type, columns, dueDatesByClass: sheet.dueDatesByClass });
      await saveWorkspaceChange();
    });
    byId('checklistPaletteButtons').addEventListener('click', event => {
      const button = event.target.closest('[data-palette-entry-id]');
      if (button) applyPaletteEntry(button.dataset.paletteEntryId);
    });
    byId('checklistClearCellBtn').addEventListener('click', clearSelectedCell);
    byId('checklistPaletteCloseBtn').addEventListener('click', closePalette);
    byId('closeChecklistColumnBtn').addEventListener('click', closeColumnEditor);
    byId('cancelChecklistColumnBtn').addEventListener('click', closeColumnEditor);
    byId('saveChecklistColumnBtn').addEventListener('click', saveColumnEditor);
    byId('checklistOutputBtn').addEventListener('click', openExportDialog);
    byId('cancelChecklistExportBtn').addEventListener('click', closeExportDialog);
    byId('runChecklistExportBtn').addEventListener('click', runChecklistExport);
    byId('checklistPaletteSettingsNav').addEventListener('click', () => showSettingsSection('palette'));
    byId('checklistGroupSettingsNav').addEventListener('click', () => showSettingsSection('groups'));
    byId('checklistArchiveSettingsNav').addEventListener('click', () => showSettingsSection('archive'));
    byId('checklistBackupSettingsNav').addEventListener('click', () => showSettingsSection('backup'));
    byId('checklistSettingsBackBtn').addEventListener('click', openList);
    byId('checklistMainSettingsBtn').addEventListener('click', openMainSettings);
    byId('addChecklistPaletteBtn').addEventListener('click', newPaletteDraft);
    byId('checklistPaletteList').addEventListener('click', async event => {
      const duplicate = event.target.closest('[data-palette-duplicate]');
      if (duplicate) {
        selectedPaletteId = duplicate.dataset.paletteDuplicate;
        await duplicateSelectedPalette();
        return;
      }
      const item = event.target.closest('[data-palette-select]');
      if (!item) return;
      selectedPaletteId = item.dataset.paletteSelect;
      paletteDraft = PaletteEditor.createDraft(workspace.preferences.palettes.find(palette => palette.id === selectedPaletteId));
      renderPaletteEditor({ preserveScroll: true });
    });
    byId('checklistPaletteNameInput').addEventListener('input', event => { if (paletteDraft) paletteDraft.name = event.target.value; });
    byId('checklistPaletteSizeInput').addEventListener('change', event => { if (paletteDraft) { paletteDraft.size = event.target.value; renderPalettePreview(); } });
    byId('checklistPaletteScoringInput').addEventListener('change', event => { if (paletteDraft) paletteDraft.scoringEnabled = event.target.checked; });
    byId('checklistPaletteEntryList').addEventListener('input', event => {
      const row = event.target.closest('[data-entry-id]');
      const field = event.target.dataset.entryField;
      if (!row || !field || !paletteDraft) return;
      let value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      if (field === 'score') value = value === '' ? null : Number(value);
      if (field === 'slotSpan') value = Number(value);
      paletteDraft = PaletteEditor.updateEntry(paletteDraft, row.dataset.entryId, { [field]: value });
      renderPalettePreview();
    });
    byId('checklistPaletteEntryList').addEventListener('click', event => {
      const row = event.target.closest('[data-entry-id]');
      if (!row || !paletteDraft) return;
      const move = event.target.closest('[data-entry-move]');
      if (move) { paletteDraft = PaletteEditor.moveEntry(paletteDraft, row.dataset.entryId, Number(move.dataset.entryMove)); renderPaletteEditor({ preserveScroll: true }); return; }
      if (event.target.closest('[data-entry-delete]')) { paletteDraft = PaletteEditor.removeEntry(paletteDraft, row.dataset.entryId); renderPaletteEditor({ preserveScroll: true }); }
    });
    byId('addChecklistPaletteEntryBtn').addEventListener('click', () => { paletteDraft = PaletteEditor.addEntry(paletteDraft, { label:'新規', color:'cream' }); renderPaletteEditor({ preserveScroll: true }); });
    byId('saveChecklistPaletteBtn').addEventListener('click', savePaletteDraft);
    byId('duplicateChecklistPaletteBtn').addEventListener('click', duplicateSelectedPalette);
    byId('deleteChecklistPaletteBtn').addEventListener('click', deleteSelectedPalette);
    document.querySelector('.checklistPaletteDefaultRow').addEventListener('click', event => { const button = event.target.closest('[data-set-default]'); if (button) setDefaultPalette(button.dataset.setDefault); });
    byId('saveChecklistGroupBtn').addEventListener('click', saveGroup);
    byId('newChecklistGroupBtn').addEventListener('click', () => { editingGroupId = null; renderGroupSettings(); byId('checklistGroupNameInput').focus(); });
    byId('checklistGroupList').addEventListener('click', event => {
      const edit = event.target.closest('[data-group-edit]');
      const remove = event.target.closest('[data-group-delete]');
      if (edit) { editingGroupId = edit.dataset.groupEdit; renderGroupSettings(); }
      else if (remove) deleteGroup(remove.dataset.groupDelete);
    });
    byId('checklistArchiveList').addEventListener('click', event => {
      const restore = event.target.closest('[data-archive-restore]');
      const remove = event.target.closest('[data-archive-delete]');
      if (restore) restoreArchivedSheet(restore.dataset.archiveRestore);
      else if (remove) permanentlyDeleteArchivedSheet(remove.dataset.archiveDelete);
    });
    byId('downloadChecklistBackupBtn').addEventListener('click', () => {
      const filename = Backup.downloadBackup(workspace, catalogSnapshot());
      notify(`${filename} を保存しました。Googleドライブ等へ保管してください。`);
    });
    byId('checklistRestoreFileInput').addEventListener('change', event => inspectRestoreFile(event.target.files?.[0]));
    byId('restoreChecklistBackupBtn').addEventListener('click', restoreChecklistBackup);
    byId('clearChecklistDataBtn').addEventListener('click', clearAllChecklistData);

    openList();
    return Object.freeze({
      openList,
      openSettings,
      refreshCatalog: async () => { synchronizeCatalog(); await persist(); render(); },
      render,
      flush: () => storage.flush(),
      setOffline: value => storage.setOffline(Boolean(value)),
      countClassReferences: classId => workspace.sheetDefinitions.filter(sheet => classIdsForSheet(sheet).includes(classId)).length,
      getWorkspace: () => clone(workspace),
      getWarnings: () => clone(warnings)
    });
  }

  root.MitoriChecklist = Object.freeze({ init });
})(globalThis);
