// Shared direct manipulation; only the caller decides how positions are persisted.
export function setupGardenArrangement({layer, toolbar, getPlacement, savePlacement, isSaving = () => false}) {
  let selected = null, draft = null, gesture = null, saving = false, failed = false, keyTimer;
  const status = toolbar.querySelector('[data-arrange-status]');
  const controls = toolbar.querySelector('[data-arrange-controls]');
  const retry = toolbar.querySelector('[data-arrange-retry]');
  const cancel = toolbar.querySelector('[data-arrange-cancel]');
  const object = key => [...layer.querySelectorAll('[data-placement-index]')].find(node => node.dataset.placementIndex === String(key));
  const say = message => { status.textContent = message; };
  const clampedX = (value, node) => {
    const width = layer.getBoundingClientRect().width;
    const edge = width ? 100 - (node?.offsetWidth || 48) / width * 100 - 2 : 88;
    return Math.round(Math.max(8, Math.min(92, edge, value)) * 100) / 100;
  };
  function refresh() {
    for (const node of layer.querySelectorAll('[data-placement-index]')) {
      const active = node.dataset.placementIndex === selected;
      node.classList.toggle('is-selected', active);
      node.classList.toggle('is-dragging', active && !!gesture?.dragging);
      node.setAttribute('aria-pressed', String(active));
      if (draft && node.dataset.placementIndex === draft.key) node.style.left = `${draft.x}%`;
    }
    controls.hidden = selected === null;
    toolbar.setAttribute('aria-busy', String(saving));
    for (const button of controls.querySelectorAll('button')) button.disabled = saving || isSaving() || failed;
    retry.hidden = cancel.hidden = !failed;
    retry.parentElement.hidden = !failed;
    retry.disabled = cancel.disabled = saving;
  }
  function select(node) {
    if (saving || isSaving()) { say('正在保存，請稍候。'); return false; }
    const key = node.dataset.placementIndex;
    if (draft && draft.key !== key) { say('請先保存目前位置，或取消這次移動。'); return false; }
    if (!getPlacement(key)) return false;
    selected = key;
    if (!failed) say(`${node.dataset.itemName}已選取，左右拖曳，放開就會保存。也可以點下方箭頭。`);
    refresh(); return true;
  }
  function shift(x) {
    const node = object(selected), item = getPlacement(selected);
    if (!node || !item) return;
    draft = {key: selected, id: item.id, x: clampedX(x, node), y: item.y};
    say(`${node.dataset.itemName}移動中…`); refresh();
  }
  async function commit() {
    clearTimeout(keyTimer);
    if (!draft || saving || failed) return;
    const item = getPlacement(draft.key);
    if (!item || item.id !== draft.id) { say('這件小物已更新，請重新選取。'); draft = null; refresh(); return; }
    if (draft.x === item.x) { draft = null; say('位置沒有變更。'); refresh(); return; }
    const move = {...draft};
    saving = true; say('正在保存花園位置…'); refresh();
    try {
      await savePlacement(move);
      draft = null; failed = false; say('位置已保存，這就是你的花園。');
    } catch {
      failed = true; say('位置尚未保存，已為你保留。請重試，或取消這次移動。');
    } finally { saving = false; refresh(); }
  }
  function releaseGesture() {
    const current = gesture; gesture = null;
    if (current?.node.hasPointerCapture(current.id)) current.node.releasePointerCapture(current.id);
    refresh(); return current;
  }
  function cancelGesture() {
    if (!gesture) return;
    releaseGesture(); draft = null; failed = false;
    const item = getPlacement(selected), node = object(selected);
    if (item && node) node.style.left = `${item.x}%`;
    say('移動已取消，保留原來的位置。'); refresh();
  }
  layer.addEventListener('pointerdown', event => {
    const node = event.target.closest('[data-placement-index]');
    if (!node || !event.isPrimary || event.button !== 0 || gesture || failed || !select(node)) return;
    clearTimeout(keyTimer);
    const item = getPlacement(selected);
    gesture = {id:event.pointerId, node, x:event.clientX, y:event.clientY, start:draft?.x ?? item.x, dragging:false};
    node.focus({preventScroll:true});
  });
  document.addEventListener('pointermove', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.dragging) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { releaseGesture(); return; }
      if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
      gesture.dragging = true; gesture.node.setPointerCapture(event.pointerId);
    }
    if (event.cancelable) event.preventDefault();
    const width = layer.getBoundingClientRect().width;
    if (width) shift(gesture.start + dx / width * 100);
  }, {passive:false});
  document.addEventListener('pointerup', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const current = releaseGesture();
    if (current.dragging || draft) void commit();
  });
  document.addEventListener('pointercancel', event => { if (gesture?.id === event.pointerId) cancelGesture(); });
  layer.addEventListener('lostpointercapture', event => { if (gesture?.id === event.pointerId) cancelGesture(); });
  layer.addEventListener('click', event => {
    const node = event.target.closest('[data-placement-index]');
    if (node) select(node);
  });
  layer.addEventListener('dragstart', event => event.preventDefault());
  layer.addEventListener('keydown', event => {
    const node = event.target.closest('[data-placement-index]');
    if (!node || !['ArrowLeft','ArrowRight','Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') { if (gesture) cancelGesture(); else if (!saving && draft) cancel.click(); return; }
    if (failed || !select(node)) return;
    shift((draft?.x ?? getPlacement(selected).x) + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 5 : 2));
    clearTimeout(keyTimer); keyTimer = setTimeout(() => void commit(), 400);
  });
  layer.addEventListener('keyup', event => {
    if (['ArrowLeft','ArrowRight'].includes(event.key) && draft) void commit();
  });
  for (const button of toolbar.querySelectorAll('[data-arrange-step]')) button.onclick = () => {
    if (selected === null || saving || isSaving() || failed) return;
    const item = getPlacement(selected); if (!item) return;
    shift((draft?.x ?? item.x) + Number(button.dataset.arrangeStep)); void commit();
  };
  toolbar.querySelector('[data-arrange-done]').onclick = () => {
    if (draft) { void commit(); return; }
    selected = null; say('點選花園小物，就可以左右移動。'); refresh();
  };
  retry.onclick = () => { if (!saving) { failed = false; void commit(); } };
  cancel.onclick = () => {
    if (saving) return;
    clearTimeout(keyTimer); draft = null; failed = false;
    const node = object(selected), item = getPlacement(selected);
    if (node && item) node.style.left = `${item.x}%`;
    say('已取消移動，保留原來的位置。'); refresh();
  };
  window.addEventListener('resize', cancelGesture);
  window.addEventListener('pagehide', cancelGesture);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelGesture(); });
  refresh();
  return {
    refresh,
    get busy() { return saving || !!draft || !!gesture; },
    focusFirst() {
      const node = object(selected) || layer.querySelector('[data-placement-index]');
      layer.closest('#garden').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
      if (node) { select(node); node.focus({preventScroll:true}); }
      else say('先從裝備包放入一件恩典小物，就能開始布置。');
    },
  };
}
