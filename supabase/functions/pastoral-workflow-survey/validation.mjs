export const SURVEY_VERSION = 1;
export const ENTITY_KEYS = ['mplus', 'shine', 'tcsc'];
export const AREAS = ['課輔班', '教會行政', '總務設備', '主日聚會', '敬拜影音', '兒少青年', '牧養關懷', '協會事工', '其他'];
export const CADENCES = ['daily', 'weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'yearly', 'as_needed'];
export const WEEK_TIMES = ['weekday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'weekend', 'varies'];
export const OS_USAGE = ['daily', 'weekly', 'monthly', 'rarely', 'never'];
export const FRICTIONS = ['找不到入口', '資訊散在不同地方', '手機操作太繁瑣', '不知道下一步', '缺少到期提醒', '不清楚誰負責', '交接困難', '重複輸入資料', '不知道怎麼使用', '現有功能幫助不大', '資料不是最新', '通知太多', '目前沒有明顯阻礙', '其他'];
export const CURRENT_TOOLS = ['紙本或筆記', 'LINE 訊息', '手機行事曆', '試算表', '教會 OS', '憑記憶', '其他'];
export const IMPROVEMENTS = ['我的每週清單', '到期前提醒', '一鍵回報完成', '交接與代理', '常用資料集中', '手機快速入口', '工作範本', '目前不需要新功能', '其他'];
export const REMINDER_CHANNELS = ['app', 'line', 'calendar', 'none'];
export const REMINDER_LEADS = ['day_before', 'same_day', 'both', 'none'];

const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const choices = (value, allowed, max) => Array.isArray(value)
  ? [...new Set(value.filter(item => typeof item === 'string' && allowed.includes(item)))].slice(0, max)
  : [];

export function normalizeSurveyAnswers(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_answers');
  const areas = choices(value.areas, AREAS, AREAS.length);
  const routineTasks = Array.isArray(value.routineTasks) ? value.routineTasks : [];
  if (routineTasks.length > 8) throw new Error('too_many_tasks');
  const tasks = routineTasks.map(task => {
    if (!task || typeof task !== 'object' || Array.isArray(task)) throw new Error('invalid_task');
    const title = text(task.title, 120);
    const cadence = CADENCES.includes(task.cadence) ? task.cadence : '';
    const timing = WEEK_TIMES.includes(task.timing) ? task.timing : 'varies';
    const doneMeans = text(task.doneMeans, 240);
    const needsReminder = task.needsReminder === true;
    if (!title || !cadence) throw new Error('invalid_task');
    return { title, cadence, timing, doneMeans, needsReminder };
  });
  const frictions = choices(value.frictions, FRICTIONS, FRICTIONS.length);
  const currentTools = choices(value.currentTools, CURRENT_TOOLS, CURRENT_TOOLS.length);
  const improvements = choices(value.improvements, IMPROVEMENTS, IMPROVEMENTS.length);
  const reminderChannel = REMINDER_CHANNELS.includes(value.reminderChannel) ? value.reminderChannel : 'none';
  const reminderLead = REMINDER_LEADS.includes(value.reminderLead) ? value.reminderLead : 'none';
  const result = {
    areas,
    areaOther: text(value.areaOther, 120),
    routineTasks: tasks,
    irregularWork: text(value.irregularWork, 800),
    missedSteps: text(value.missedSteps, 800),
    handoff: text(value.handoff, 500),
    osUsage: OS_USAGE.includes(value.osUsage) ? value.osUsage : 'rarely',
    currentTools,
    frictions,
    frictionOther: text(value.frictionOther, 400),
    improvements,
    improvementOther: text(value.improvementOther, 400),
    reminderChannel,
    reminderLead,
    firstChange: text(value.firstChange, 500),
  };
  if (!areas.length && !result.areaOther) throw new Error('area_required');
  if (!tasks.length) throw new Error('task_required');
  if (frictions.includes('目前沒有明顯阻礙') && (frictions.length > 1 || result.frictionOther)) throw new Error('invalid_frictions');
  if (improvements.includes('目前不需要新功能') && (improvements.length > 1 || result.improvementOther)) throw new Error('invalid_improvements');
  if (!frictions.length && !result.frictionOther) throw new Error('friction_required');
  if (!improvements.length && !result.improvementOther) throw new Error('improvement_required');
  if (JSON.stringify(result).length > 12000) throw new Error('answers_too_large');
  return result;
}
