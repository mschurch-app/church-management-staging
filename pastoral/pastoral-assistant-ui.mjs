import {assistantChurch, buildAppointmentDraft} from './pastoral-assistant-management.mjs';
import {authenticateStaff, signOut} from './auth.mjs?v=20260924-5';
const $ = selector => document.querySelector(selector);
const params = new URLSearchParams(location.search);
let church;

function activateTab(tab) {
  document.querySelectorAll('[data-tab]').forEach(button => {
    const active = button.dataset.tab === tab;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    $(`#panel-${button.dataset.tab}`).hidden = !active;
  });
}
const tabs = [...document.querySelectorAll('[data-tab]')];
tabs.forEach((button, index) => {
  button.addEventListener('click', () => activateTab(button.dataset.tab));
  button.addEventListener('keydown', event => {
    let target;
    if (event.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length];
    if (event.key === 'ArrowLeft') target = tabs[(index + tabs.length - 1) % tabs.length];
    if (event.key === 'Home') target = tabs[0];
    if (event.key === 'End') target = tabs.at(-1);
    if (target) { event.preventDefault(); activateTab(target.dataset.tab); target.focus(); }
  });
});

$('#draft-form').addEventListener('input', () => {
  $('#draft-result').hidden = true;
  $('#draft-text').textContent = '';
  $('#draft-status').textContent = '';
});
$('#draft-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    $('#draft-text').textContent = buildAppointmentDraft({church, summary: $('#summary').value,
      date: $('#date').value, time: $('#time').value, duration: $('#duration').value, location: $('#location').value});
    $('#draft-result').hidden = false;
    $('#draft-status').textContent = '草稿已整理，尚未排入行事曆。';
  } catch (error) { $('#draft-status').textContent = error.message; }
});
$('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#draft-text').textContent); $('#draft-status').textContent = '已複製草稿，可以貼給秘書確認。'; }
  catch { $('#draft-status').textContent = '無法自動複製，請選取上方文字後複製。'; }
});

async function load() {
  try {
    let staff;
    const preview = params.get('preview') === '1' && ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
    if (preview) {
      // Localhost-only static preview. Never fetches private records or tokens.
      staff = {name: '示範使用者', role: 'pastor', churches: ['M+']};
      $('#auth-status').textContent = '本機介面預覽：示範身分，不連接 LINE、會友資料或 Google 行事曆。';
    } else {
      staff = await authenticateStaff();
      $('#auth-status').textContent = '已驗證 LINE 身分與教會同工授權。';
    }
    church = assistantChurch(staff, params.get('church'));
    $('#church-name').textContent = (church === 'M+' ? 'M＋大雅教會' : '火樂教會') + ' / PASTORAL ASSISTANT';
    $('#identity').textContent = `${staff.name}｜${{pastor:'牧師',secretary:'秘書',admin:'管理者'}[staff.role]}`;
    $('#back').hidden = false;
    $('#back').addEventListener('click', event => { event.preventDefault(); signOut(); });
    $('#workspace').hidden = false;
  } catch (error) {
    $('#workspace').hidden = true;
    $('#auth-status').textContent = error.message || '無法載入工作台。';
    $('#login').hidden = false;
  }
}
load();
