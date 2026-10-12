const test = require('node:test');
const assert = require('node:assert/strict');

const Backup = require('../backup.js');

function validMitoriState(overrides = {}) {
  return {
    classes: [], sharedClasses: [], records: [], grades: [], subjects: [], tagSets: [],
    lessonLists: [], archivedTiles: [], performanceTests: [], criteriaSets: [], classLayout: [],
    board: {}, classData: {}, sharedClassData: {}, timetable: {}, termSettings: {},
    weeklyPlan: {}, performanceResults: {}, ...overrides,
  };
}

test('a full backup keeps MITORI and checklist data together', () => {
  const envelope = Backup.createBackup(
    { classes: [{ id: 'tile-1' }], records: [{ id: 'record-1' }] },
    { sheetDefinitions: [{ id: 'sheet-1' }] },
    '2026-10-12T11:30:00.000Z',
    '0.3.86',
  );

  assert.deepEqual(envelope, {
    appId: 'MITORI_FULL_BACKUP_V1',
    formatVersion: 1,
    createdAt: '2026-10-12T11:30:00.000Z',
    appVersion: '0.3.86',
    mitoriState: { classes: [{ id: 'tile-1' }], records: [{ id: 'record-1' }] },
    checklistState: { sheetDefinitions: [{ id: 'sheet-1' }] },
  });
});

test('parsing a backup rejects unrelated and newer backup formats', () => {
  assert.throws(
    () => Backup.parseBackup('{"appId":"OTHER","formatVersion":1}'),
    /MITORI全体のバックアップではありません/,
  );
  assert.throws(
    () => Backup.parseBackup(JSON.stringify({
      appId: 'MITORI_FULL_BACKUP_V1',
      formatVersion: 2,
      createdAt: '2026-10-12T11:30:00.000Z',
      mitoriState: {},
      checklistState: {},
    })),
    /新しいバックアップ形式/,
  );
});

test('parsing refuses a damaged backup before local data can be replaced', () => {
  assert.throws(
    () => Backup.parseBackup(JSON.stringify({
      appId: 'MITORI_FULL_BACKUP_V1',
      formatVersion: 1,
      createdAt: '2026-10-12T11:30:00.000Z',
      mitoriState: { classes: 'broken' },
      checklistState: { sheetDefinitions: [] },
    })),
    /MITORI本体のデータが不正です/,
  );
  assert.throws(
    () => Backup.parseBackup(JSON.stringify({
      appId: 'MITORI_FULL_BACKUP_V1',
      formatVersion: 1,
      createdAt: '2026-10-12T11:30:00.000Z',
      mitoriState: validMitoriState(),
      checklistState: { sheetDefinitions: 'broken' },
    })),
    /チェック表のデータが不正です/,
  );
  assert.throws(
    () => Backup.parseBackup(JSON.stringify({
      appId: 'MITORI_FULL_BACKUP_V1',
      formatVersion: 1,
      createdAt: '2026-10-12T11:30:00.000Z',
      mitoriState: validMitoriState({ classes: [null] }),
      checklistState: { appId: 'MITORI_CHECKLIST', schemaVersion: 3, sheetDefinitions: [] },
    })),
    /MITORI本体のデータが不正です/,
  );
  assert.throws(
    () => Backup.parseBackup(JSON.stringify({
      appId: 'MITORI_FULL_BACKUP_V1',
      formatVersion: 1,
      createdAt: '2026-10-12T11:30:00.000Z',
      mitoriState: validMitoriState(),
      checklistState: { appId: 'OTHER', schemaVersion: 3, sheetDefinitions: [] },
    })),
    /チェック表のデータが不正です/,
  );
});

test('restore commits both stores and rolls both back if either write fails', async () => {
  const previous = { mitoriState: { marker: 'old-main' }, checklistState: { marker: 'old-checklist' } };
  const next = { mitoriState: { marker: 'new-main' }, checklistState: { marker: 'new-checklist' } };
  const writes = [];

  await assert.rejects(
    () => Backup.commitRestore({
      previous,
      next,
      writeChecklist: async value => { writes.push(['checklist', value.marker]); },
      writeMitori: async value => {
        writes.push(['main', value.marker]);
        if (value.marker === 'new-main') throw new Error('disk full');
      },
    }),
    /disk full/,
  );

  assert.deepEqual(writes, [
    ['checklist', 'new-checklist'],
    ['main', 'new-main'],
    ['checklist', 'old-checklist'],
    ['main', 'old-main'],
  ]);
});

test('a checklist write failure restores the previous data without committing the new main state', async () => {
  const previous = { mitoriState: { marker: 'old-main' }, checklistState: { marker: 'old-checklist' } };
  const next = { mitoriState: { marker: 'new-main' }, checklistState: { marker: 'new-checklist' } };
  const writes = [];

  await assert.rejects(
    () => Backup.commitRestore({
      previous,
      next,
      writeChecklist: async value => {
        writes.push(['checklist', value.marker]);
        if (value.marker === 'new-checklist') throw new Error('checklist unavailable');
      },
      writeMitori: async value => { writes.push(['main', value.marker]); },
    }),
    /checklist unavailable/,
  );

  assert.deepEqual(writes, [
    ['checklist', 'new-checklist'],
    ['checklist', 'old-checklist'],
    ['main', 'old-main'],
  ]);
});

test('restore is blocked when its pre-restore safety copy cannot be stored', async () => {
  await assert.rejects(
    () => Backup.saveRequiredSafetyBackup(null, { appId: 'MITORI_FULL_BACKUP_V1' }),
    /安全退避を作成できないため、復元を中止しました/,
  );
  await assert.rejects(
    () => Backup.saveRequiredSafetyBackup({ saveSafetyBackup: async () => { throw new Error('quota'); } }, {}),
    /安全退避を作成できないため、復元を中止しました/,
  );
});

test('an unseen newer file is detected before it can be overwritten', () => {
  const remote = Backup.createBackup({}, {}, '2026-10-12T12:00:00.000Z', '0.3.86');

  assert.equal(
    Backup.overwriteStatus(remote, '2026-10-12T11:00:00.000Z'),
    'remote-newer',
  );
  assert.equal(
    Backup.overwriteStatus(remote, '2026-10-12T12:00:00.000Z'),
    'known',
  );
  assert.equal(Backup.overwriteStatus(remote, ''), 'unknown-existing');
  assert.equal(Backup.overwriteStatus(null, ''), 'empty');
});

test('backup reminders become due only after the selected interval', () => {
  const now = '2026-10-12T12:00:00.000Z';

  assert.equal(Backup.isReminderDue({ intervalDays: 7, lastBackupAt: '2026-10-05T12:00:01.000Z' }, now), false);
  assert.equal(Backup.isReminderDue({ intervalDays: 7, lastBackupAt: '2026-10-05T12:00:00.000Z' }, now), true);
  assert.equal(Backup.isReminderDue({ intervalDays: 0, lastBackupAt: '2026-01-01T00:00:00.000Z' }, now), false);
  assert.equal(Backup.isReminderDue({ intervalDays: 7, firstSeenAt: '2026-10-06T12:00:00.000Z' }, now), false);
  assert.equal(Backup.isReminderDue({ intervalDays: 7, firstSeenAt: '2026-10-05T12:00:00.000Z' }, now), true);
});

test('a restored backup summary reports the data the user is about to load', () => {
  const envelope = Backup.createBackup(
    { sharedClasses: [{ id: 'a' }, { id: 'b' }], classes: [{ id: 'tile' }], records: [{}, {}], performanceTests: [{}] },
    { sheetDefinitions: [{ archivedAt: null }, { archivedAt: '2026-09-01' }] },
    '2026-10-12T12:00:00.000Z',
    '0.3.86',
  );

  assert.deepEqual(Backup.summarizeBackup(envelope), {
    createdAt: '2026-10-12T12:00:00.000Z',
    sharedClassCount: 2,
    lessonTileCount: 1,
    recordCount: 2,
    performanceTestCount: 1,
    activeChecklistCount: 1,
    archivedChecklistCount: 1,
  });
});
