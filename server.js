require('dotenv').config();
const express = require('express');
const { Client } = require('@notionhq/client');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

// Fetch tasks that are not done and not already in My Day
app.get('/api/tasks', async (req, res) => {
  try {
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        and: [
          {
            property: 'Status',
            status: {
              does_not_equal: 'Done',
            },
          },
          {
            property: 'My Day',
            checkbox: {
              equals: false,
            },
          },
        ],
      },
      sorts: [
        { property: 'Priority', direction: 'ascending' },
        { property: 'Due', direction: 'ascending' },
      ],
    });

    const tasks = response.results.map((page) => {
      const props = page.properties;

      const getName = () => {
        const title = props.Name || props.Title || props.title;
        if (!title) return 'Untitled';
        return title.title?.map((t) => t.plain_text).join('') || 'Untitled';
      };

      const getPriority = () => {
        for (const key of ['Priority', 'Importance', 'priority']) {
          const p = props[key];
          if (!p) continue;
          if (p.type === 'select') return p.select?.name || null;
          if (p.type === 'multi_select') return p.multi_select?.[0]?.name || null;
          if (p.type === 'number') return p.number?.toString() || null;
        }
        return null;
      };

      const getDueDate = () => {
        for (const key of ['Due', 'Due Date', 'due', 'due_date', 'Deadline']) {
          const d = props[key];
          if (d?.type === 'date' && d.date?.start) return d.date.start;
        }
        return null;
      };

      return {
        id: page.id,
        name: getName(),
        priority: getPriority(),
        dueDate: getDueDate(),
      };
    });

    res.json({ tasks });
  } catch (err) {
    console.error('Error fetching tasks:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Toggle My Day = true for a task
app.post('/api/tasks/:id/do', async (req, res) => {
  try {
    const { id } = req.params;
    await notion.pages.update({
      page_id: id,
      properties: {
        'My Day': { checkbox: true },
      },
    });
    console.log(`[DO] Task ${id} added to My Day`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error updating task:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Log a skip (no Notion update needed)
app.post('/api/tasks/:id/skip', async (req, res) => {
  const { id } = req.params;
  console.log(`[SKIP] Task ${id} skipped`);
  res.json({ ok: true });
});

// Log a snooze (no Notion update needed — extend later)
app.post('/api/tasks/:id/snooze', async (req, res) => {
  const { id } = req.params;
  console.log(`[SNOOZE] Task ${id} snoozed`);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Notion Swiper running at http://localhost:${PORT}`);
});
