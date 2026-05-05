require('dotenv').config();
const express = require('express');
const { Client } = require('@notionhq/client');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

// Semantic sort order — lower number = higher priority
const URGENCY_RANK = {
  'urgent':        0,
  'time sensitive': 1,
  'not urgent':    2,
  'unplanned':     3,
};

const IMPORTANCE_RANK = {
  'very important':    0,
  'important':         1,
  'medium importance': 2,
  'unplanned':         3,
};

function rankUrgency(val) {
  return URGENCY_RANK[(val || '').toLowerCase()] ?? 99;
}

function rankImportance(val) {
  return IMPORTANCE_RANK[(val || '').toLowerCase()] ?? 99;
}

app.get('/api/tasks', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        and: [
          {
            property: 'Done',
            checkbox: { equals: false },
          },
          {
            property: 'Next Due',
            date: { on_or_before: today },
          },
        ],
      },
      // Fetch all; we sort semantically in JS below
      page_size: 100,
    });

    const getSelect = (props, key) => props[key]?.select?.name || null;
    const getDate   = (props, key) => props[key]?.date?.start || null;
    const getTitle  = (props, key) => props[key]?.title?.map((t) => t.plain_text).join('') || 'Untitled';

    const tasks = response.results.map((page) => {
      const p = page.properties;
      return {
        id:          page.id,
        name:        getTitle(p, 'Task'),
        urgency:     getSelect(p, 'Urgency'),
        importance:  getSelect(p, 'Importance'),
        loe:         getSelect(p, 'LOE / Level of Effort'),
        projectTag:  getSelect(p, 'Project Tag'),
        dueDate:     getDate(p, 'Next Due'),
      };
    });

    // Sort: Urgency asc (Urgent first), then Importance asc (Very Important first)
    tasks.sort((a, b) => {
      const uDiff = rankUrgency(a.urgency) - rankUrgency(b.urgency);
      if (uDiff !== 0) return uDiff;
      return rankImportance(a.importance) - rankImportance(b.importance);
    });

    res.json({ tasks });
  } catch (err) {
    console.error('Error fetching tasks:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Swipe right — mark My Day = true
app.post('/api/tasks/:id/do', async (req, res) => {
  try {
    const { id } = req.params;
    await notion.pages.update({
      page_id: id,
      properties: { 'My Day': { checkbox: true } },
    });
    console.log(`[DO] Task ${id} → My Day`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error updating task:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks/:id/skip', async (req, res) => {
  console.log(`[SKIP] Task ${req.params.id}`);
  res.json({ ok: true });
});

app.post('/api/tasks/:id/snooze', async (req, res) => {
  console.log(`[SNOOZE] Task ${req.params.id}`);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Notion Swiper running at http://localhost:${PORT}`);
});
