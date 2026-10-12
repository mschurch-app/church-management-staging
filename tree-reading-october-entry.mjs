// Keep the dedicated October LIFF endpoint; mount the shared game in this page.
const params = new URLSearchParams(location.search);
const legacy = params.get('legacy') === '1' || params.get('view') === 'devotional';
if (legacy) {
  await import('./tree-reading-october-test.mjs?v=20261012-october-game1');
} else {
  const root = new URL('.', location.href);
  const game = new URL('prototypes/reading-tree-game/', root);
  const previous = document.querySelector('main');
  const status = document.createElement('section');
  status.className = 'section-card';
  status.setAttribute('role', 'status');
  status.textContent = '正在打開箴言讀經新花園…';
  previous.hidden = true;
  previous.before(status);
  try {
    const response = await fetch(new URL('member.html?v=20261012-scenes1', game), {
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error('game_unavailable');
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (!page.querySelector('#member-gate') || !page.querySelector('#reading-dialog')) throw Error('game_unavailable');
    // Assets and module-created relative media URLs must resolve at the game directory.
    document.head.querySelectorAll('link[href]').forEach(node => { node.href = new URL(node.getAttribute('href'), root).href; });
    page.body.querySelectorAll('a[href^="#"]').forEach(node => { node.href = new URL(node.getAttribute('href'), location.href).href; });
    const base = document.createElement('base');
    base.href = game.href;
    document.head.prepend(base);
    document.head.querySelectorAll('link[rel="stylesheet"]').forEach(node => node.remove());
    for (const node of page.head.querySelectorAll('link[rel="stylesheet"],link[rel="preload"]')) {
      const copy = node.cloneNode(true);
      copy.href = new URL(node.getAttribute('href'), game).href;
      document.head.append(copy);
    }
    document.title = '箴言十月讀經｜新版小樹同工測試';
    page.body.dataset.octoberTest = 'true';
    page.body.querySelectorAll('script').forEach(node => node.remove());
    document.body.replaceWith(page.body);
    await import('./prototypes/reading-tree-game/tree-member-game.mjs?v=20261012-scenes1');
  } catch {
    if (document.body.dataset.octoberTest === 'true' && document.querySelector('#member-gate')?.hidden === false) {
      // Authentication failures are presented by the shared gate, including the
      // invitation form. Keep its input and retry controls intact.
    } else {
    // No writes happen while mounting. Keep the original screen as an explicit recovery route.
    status.replaceChildren();
    const message = document.createElement('p');
    message.textContent = '新版花園暫時未能載入，你的讀經紀錄仍保留。';
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'primary'; retry.textContent = '重新開啟新版';
    retry.onclick = () => location.reload();
    const old = document.createElement('a'); old.className = 'secondary';
    old.href = new URL('tree-reading-october-test.html?legacy=1', root).href;
    old.textContent = '先使用原版讀經';
    status.append(message, retry, old);
    if (!status.isConnected) document.body.replaceChildren(status);
    }
  }
}
