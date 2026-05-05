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

    const doOverlay = document.createElement('div');
    doOverlay.className = 'card-do-overlay';
    doOverlay.textContent = '✅';

    const skipOverlay = document.createElement('div');
    skipOverlay.className = 'card-skip-overlay';
    skipOverlay.textContent = '⏭';

    // ── Project tag (top-right) ──
    const topRow = document.createElement('div');
    topRow.className = 'card-top-row';

    if (task.projectTag) {
      const projBadge = document.createElement('div');
      projBadge.className = 'card-badge badge-project';
      projBadge.textContent = task.projectTag;
      topRow.appendChild(projBadge);
    }

    // ── Task name ──
    const name = document.createElement('div');
    name.className = 'card-name';
    name.textContent = task.name;

    // ── Chip row: urgency · importance · due date ──
    const chips = document.createElement('div');
    chips.className = 'card-chips';

    if (task.urgency) {
      chips.appendChild(makeChip(urgencyLabel(task.urgency), `chip-urgency-${slugify(task.urgency)}`));
    }

    if (task.importance) {
      chips.appendChild(makeChip(task.importance, `chip-importance-${slugify(task.importance)}`));
    }

    if (task.dueDate) {
      const { label, cls } = formatDue(task.dueDate);
      chips.appendChild(makeChip(label, `chip-due-${cls || 'default'}`));
    }

    card.append(doOverlay, skipOverlay, topRow, name, chips);
    return card;
  }

  // ── Chip / Badge helpers ───────────────────────────────────────────────────
  function makeChip(label, cls) {
    const el = document.createElement('span');
    el.className = `chip ${cls}`;
    el.textContent = label;
    return el;
  }

  function slugify(val) {
    return (val || 'none').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  function urgencyLabel(val) {
    const map = {
      'urgent':         'Urgent',
      'time sensitive': 'Time Sensitive',
      'not urgent':     'Not Urgent',
      'unplanned':      'Unplanned',
    };
    return map[(val || '').toLowerCase()] || val || '';
  }

  function formatDue(dateStr) {
    const due   = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff  = Math.round((due - today) / 86400000);

    if (diff < 0)   return { label: `Overdue by ${-diff}d`, cls: 'overdue' };
    if (diff === 0) return { label: 'Due today',             cls: 'today' };
    if (diff === 1) return { label: 'Due tomorrow',          cls: 'soon' };
    if (diff <= 7)  return { label: `Due in ${diff} days`,   cls: 'soon' };
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
      card.style.transform = `translate(${curX}px, ${curY}px) rotate(${curX * 0.08}deg)`;

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

      if (curX > THRESHOLD)        decide('do');
      else if (curX < -THRESHOLD)  decide('skip');
      else {
        card.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        card.style.transform  = '';
        doOverlay.style.opacity   = 0;
        skipOverlay.style.opacity = 0;
        setTimeout(() => { card.style.transition = ''; }, 400);
      }
    }

    card.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => { if (dragging) onMove(e.clientX, e.clientY); });
    window.addEventListener('mouseup', () => onEnd());

    card.addEventListener('touchstart', (e) => {
      onStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    card.addEventListener('touchmove', (e) => {
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    card.addEventListener('touchend', () => onEnd());
  }

  // ── Decide ─────────────────────────────────────────────────────────────────
  async function decide(action) {
    if (animating || current >= tasks.length) return;
    animating = true;

    const task    = tasks[current];
    const topCard = stack.firstElementChild;

    console.log(`[${action.toUpperCase()}]`, task.name, {
      urgency:    task.urgency,
      importance: task.importance,
      loe:        task.loe,
      due:        task.dueDate,
    });

    topCard.classList.add(action === 'do' ? 'fly-right' : action === 'skip' ? 'fly-left' : 'fly-up');

    fetch(`/api/tasks/${task.id}/${action}`, { method: 'POST' })
      .then(r => r.json())
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
    if (e.key === 'ArrowRight')      decide('do');
    else if (e.key === 'ArrowLeft')  decide('skip');
    else if (e.key === ' ')          { e.preventDefault(); decide('snooze'); }
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function updateCounter() {
    const n = tasks.length - current;
    counter.textContent = n > 0 ? `${n} task${n !== 1 ? 's' : ''} remaining` : '';
  }

  function showLoading(show) {
    loadState.classList.toggle('hidden', !show);
  }

  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  loadTasks();
})();
