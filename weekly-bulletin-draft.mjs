export async function continueDraft(controller, id) {
  if (!id) throw new Error('請選擇要繼續編輯的草稿。');
  const rows = await controller.refreshBulletins();
  const row = rows.find(item => item.id === id);
  if (!row) throw new Error('找不到這份週報，請重新選擇草稿。');
  if (!['draft', 'changes_requested'].includes(row.status)) {
    throw new Error('這份週報的狀態已變更，請重新選擇可編輯的草稿。');
  }
  await controller.open(row, {force: true, autofill: false});
  return row;
}
