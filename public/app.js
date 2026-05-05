(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let tasks = [];
  let current = 0;
  let animating = false;

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const stack      = document.getElementById('card-stack');
  const emptyState = document.getElementById('empty-state');
  const loadState  = document.getElementById('loading-state');
  const counter    = document.getElementById('counter');
  const hintLeft   = document.getElementById('hint-left');
  const hintRight  = document.getElementById('hint-right');

  document.getElementById('btn-do').addEventListener('click', () => decide('do'));
  document.getElementById('btn-skip').addEventListener('click', () => decide('skip'));
  document.getElementById('btn-snooze').addEventListener('click', () => decide('snooze'));
  document.getElementById('reload-btn').addEventListener('click', loadTasks);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  async function loadTasks() {
    showLoading(true);
    emptyState.classList.add('hidden');
    stack.innerHTML = '';
    tasks = [];
    current = 0;

    try {
      const res = await fetch('/api/tasks');
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      tasks = data.tasks || [];
    } catch (err) {
      console.error('Failed to load tasks:', err);
      tasks = [];
    }

    showLoading(false);
    renderStack();
    updateCounter();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function renderStack() {
    stack.innerHTML = '';
    const remaining = tasks.slice(current);

    if (remaining.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    // Render up to 3 cards (top card + 2 background cards)
    remaining.slice(0, 3).forEach((task, i) => {
      const card = buildCard(task);
      if (i === 0) attachDrag(card, task);
      stack.appendChild(card);
    });
  }

  function buildCard(task) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = task.id;

    const doOverlay   = document.createElement('div');
    doOverlay.className = 'card-do-overlay';
    doOverlay.textContent = '✅';

    const skipOverlay = document.createElement('div');
    skipOverlay.className = 'card-skip-overlay';
    skipOverlay.textContent = '⏭';

    const tag = document.createElement('div');
    tag.className = `card-tag ${priorityClass(task.priority)}`;
    tag.textContent = task.priority ? `⚡ ${task.priority}` : '— No priority';

    const name = document.createElement('div');
    name.className = 'card-name';
    name.textContent = task.name;

    const meta = document.createElement('div');
    meta.className = 'card-meta';

    if (task.dueDate) {
      const due = document.createElement('div');
      const { label, cls } = formatDue(task.dueDate);
      due.className = `card-due ${cls}`;
      due.innerHTML = `<span>📅</span><span>${label}</span>`;
      meta.appendChild(due);
    }

    card.append(doOverlay, skipOverlay, tag, name, meta);
    return card;
  }

  // ── Priority helpers ───────────────────────────────────────────────────────
  function priorityClass(priority) {
    if (!priority) return 'priority-none';
    const p = priority.toLowerCase();
    if (p.includes('high') || p.includes('urgent') || p === '1') return 'priority-high';
    if (p.includes('med') || p === '2') return 'priority-medium';
    if (p.includes('low') || p === '3') return 'priority-low';
    return 'priority-none';
  }

  function formatDue(dateStr) {
    const due  = new Date(dateStr + 'T00:00:00');
    const now  = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const diff = Math.round((dueDay - today) / 86400000);

    if (diff < 0)  return { label: `Overdue by ${-diff}d`, cls: 'overdue' };
    if (diff === 0) return { label: 'Due today', cls: 'today' };
    if (diff === 1) return { label: 'Due tomorrow', cls: 'soon' };
    if (diff <= 7) return { label: `Due in ${diff} days`, cls: 'soon' };
    return { label: `Due ${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, cls: '' };
  }

  // ── Drag / swipe ───────────────────────────────────────────────────────────
  function attachDrag(card, task) {
    let startX = 0, startY = 0, curX = 0, curY = 0, dragging = false;
    const THRESHOLD = 80;

    const doOverlay   = card.querySelector('.card-do-overlay');
    const skipOverlay = card.querySelector('.card-skip-overlay');

    function onStart(x, y) {
      if (animating) return;
      startX = x; startY = y; curX = 0; curY = 0;
      dragging = true;
      card.classList.add('dragging');
    }

    function onMove(x, y) {
      if (!dragging) return;
      curX = x - startX;
      curY = y - startY;
      const rot = curX * 0.08;
      card.style.transform = `translate(${curX}px, ${curY}px) rotate(${rot}deg)`;

      const ratio = Math.min(Math.abs(curX) / THRESHOLD, 1);
      if (curX > 0) {
        doOverlay.style.opacity   = ratio;
        skipOverlay.style.opacity = 0;
        hintRight.style.opacity   = ratio;
        hintLeft.style.opacity    = 0;
      } else {
        skipOverlay.style.opacity = ratio;
        doOverlay.style.opacity   = 0;
        hintLeft.style.opacity    = ratio;
        hintRight.style.opacity   = 0;
      }
    }

    function onEnd() {
      if (!dragging) return;
      dragging = false;
      card.classList.remove('dragging');
      hintLeft.style.opacity  = 0;
      hintRight.style.opacity = 0;

      if (curX > THRESHOLD)       decide('do');
      else if (curX < -THRESHOLD) decide('skip');
      else {
        card.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        card.style.transform  = '';
        doOverlay.style.opacity   = 0;
        skipOverlay.style.opacity = 0;
        setTimeout(() => { card.style.transition = ''; }, 400);
      }
    }

    // Mouse
    card.addEventListener('mousedown',  (e) => onStart(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => { if (dragging) onMove(e.clientX, e.clientY); });
    window.addEventListener('mouseup',   ()  => onEnd());

    // Touch
    card.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      onStart(t.clientX, t.clientY);
    }, { passive: true });
    card.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      onMove(t.clientX, t.clientY);
    }, { passive: true });
    card.addEventListener('touchend', () => onEnd());
  }

  // ── Decide ─────────────────────────────────────────────────────────────────
  async function decide(action) {
    if (animating || current >= tasks.length) return;
    animating = true;

    const task = tasks[current];
    const topCard = stack.firstElementChild;

    console.log(`[${action.toUpperCase()}]`, task.name, '—', task.id);

    // Fly the card out
    const flyClass = action === 'do' ? 'fly-right' : action === 'skip' ? 'fly-left' : 'fly-up';
    topCard.classList.add(flyClass);

    // Fire API call in parallel with animation
    const apiAction = action === 'snooze' ? 'snooze' : action;
    fetch(`/api/tasks/${task.id}/${apiAction}`, { method: 'POST' })
      .then(r => r.json())
      .then(d => { if (!d.ok) console.warn('API response:', d); })
      .catch(err => console.error('API error:', err));

    await delay(350);

    current++;
    animating = false;
    renderStack();
    updateCounter();
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === 'ArrowRight') decide('do');
    else if (e.key === 'ArrowLeft') decide('skip');
    else if (e.key === ' ') { e.preventDefault(); decide('snooze'); }
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function updateCounter() {
    const remaining = tasks.length - current;
    counter.textContent = remaining > 0 ? `${remaining} task${remaining !== 1 ? 's' : ''} remaining` : '';
  }

  function showLoading(show) {
    loadState.classList.toggle('hidden', !show);
  }

  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── Boot ───────────────────────────────────────────────────────────────────
  loadTasks();
})();
