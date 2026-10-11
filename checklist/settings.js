(function initChecklistSettings(root) {
  const sections = Object.freeze([
    { id: 'palette', label: 'パレット設定' },
    { id: 'groups', label: '合同グループ設定' },
    { id: 'archive', label: '保管済みシート' },
    { id: 'backup', label: 'バックアップ／復元' }
  ]);
  function sectionLabel(id) { return sections.find(section => section.id === id)?.label || sections[0].label; }
  root.MitoriChecklistSettings = Object.freeze({ sections, sectionLabel });
})(globalThis);
