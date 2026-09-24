export const TASK_TYPES = new Set(['general', 'sermon', 'event', 'care', 'document']);
export const TASK_STATUSES = new Set(['draft', 'pending', 'approved', 'completed', 'cancelled']);

export function validTaskInput(input: Record<string, unknown>) {
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 200) return false;
  if (input.description !== undefined && (typeof input.description !== 'string' || input.description.length > 5000)) return false;
  if (typeof input.taskType !== 'string' || !TASK_TYPES.has(input.taskType)) return false;
  if (typeof input.assignedTo !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.assignedTo)) return false;
  if (typeof input.idempotencyKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.idempotencyKey)) return false;
  if (input.dueAt !== undefined && input.dueAt !== null) {
    if (typeof input.dueAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(input.dueAt) || !Number.isFinite(Date.parse(input.dueAt))) return false;
  }
  return true;
}

export function validTaskTransition(from: string, to: string) {
  return (from === 'draft' && to === 'pending') ||
    (from === 'pending' && to === 'approved') ||
    (from === 'approved' && to === 'completed');
}
