export const TASK_TYPES = new Set(['general', 'sermon', 'event', 'care', 'document']);
export const TASK_STATUSES = new Set(['draft', 'pending', 'approved', 'completed', 'cancelled']);
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TASK = 5;
export const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain', 'text/markdown',
  'image/jpeg', 'image/png', 'image/webp',
]);


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

const ATTACHMENT_EXTENSION_TYPES: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv', txt: 'text/plain', md: 'text/markdown',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};
export function validAttachmentInput(fileName: unknown, contentType: unknown, size: unknown) {
  if (typeof fileName !== 'string' || fileName.trim().length === 0 || fileName.length > 255 ||
      typeof contentType !== 'string' || !ALLOWED_ATTACHMENT_TYPES.has(contentType) ||
      !Number.isSafeInteger(size) || Number(size) <= 0 || Number(size) > MAX_ATTACHMENT_BYTES) return false;
  const extension=fileName.toLowerCase().split('.').at(-1)||'';
  return ATTACHMENT_EXTENSION_TYPES[extension]===contentType;
}

export function validCompletionReport(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 3000;
}
