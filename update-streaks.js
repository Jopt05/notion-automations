const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = "39984baa-084b-80b2-9bfa-cc46635811aa";

async function getAllEntries() {
  const entries = [];
  let cursor = undefined;

  while (true) {
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      sorts: [{ property: "Date", direction: "descending" }],
      start_cursor: cursor,
    });

    entries.push(...response.results);

    if (!response.has_more) break;
    cursor = response.next_cursor;
  }

  return entries;
}

function groupByHabit(entries) {
  const groups = {};

  for (const entry of entries) {
    const titleProp = entry.properties["Habit"];
    if (!titleProp || !titleProp.title || titleProp.title.length === 0) continue;

    const habitName = titleProp.title[0].plain_text.trim();
    if (!groups[habitName]) groups[habitName] = [];
    groups[habitName].push(entry);
  }

  return groups;
}

function calculateStreak(entries) {
  // Entries are already sorted by date descending
  // Filter entries that have a date
  const dated = entries.filter(
    (e) => e.properties["Date"] && e.properties["Date"].date && e.properties["Date"].date.start
  );

  if (dated.length === 0) return 0;

  // Sort by date descending to be sure
  dated.sort((a, b) => {
    const dateA = new Date(a.properties["Date"].date.start);
    const dateB = new Date(b.properties["Date"].date.start);
    return dateB - dateA;
  });

  let streak = 0;
  let expectedDate = null;

  for (const entry of dated) {
    const done = entry.properties["Done"] && entry.properties["Done"].checkbox === true;
    const dateStr = entry.properties["Date"].date.start;
    const entryDate = new Date(dateStr + "T00:00:00");

    if (expectedDate === null) {
      // First entry (most recent)
      if (!done) break; // If the most recent isn't done, streak is 0
      streak = 1;
      expectedDate = new Date(entryDate);
      expectedDate.setDate(expectedDate.getDate() - 1);
    } else {
      // Check if this entry is the expected previous day
      const entryDateStr = entryDate.toISOString().split("T")[0];
      const expectedDateStr = expectedDate.toISOString().split("T")[0];

      if (entryDateStr === expectedDateStr) {
        if (!done) break; // Streak broken
        streak++;
        expectedDate.setDate(expectedDate.getDate() - 1);
      } else if (entryDate < expectedDate) {
        // There's a gap (missing day) — streak broken
        break;
      }
      // If entryDate > expectedDate, skip duplicates
    }
  }

  return streak;
}

async function updateStreakForEntries(entries, streak) {
  // Update only today's entries with the streak value
  const today = new Date().toISOString().split("T")[0];

  for (const entry of entries) {
    const dateProp = entry.properties["Date"];
    if (!dateProp || !dateProp.date || !dateProp.date.start) continue;

    if (dateProp.date.start === today) {
      await notion.pages.update({
        page_id: entry.id,
        properties: {
          "Streak 🔥": { number: streak },
        },
      });
      console.log(`  Updated: streak = ${streak}`);
    }
  }
}

async function updateDashboard(streakData) {
  // Search for existing dashboard page
  const search = await notion.search({
    query: "🔥 Rachas",
    filter: { property: "object", value: "page" },
  });

  let dashboardId = null;

  for (const result of search.results) {
    const title = result.properties?.title?.title?.[0]?.plain_text;
    if (title === "🔥 Rachas") {
      dashboardId = result.id;
      break;
    }
  }

  // Build content blocks
  const today = new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const children = [
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content: `Última actualización: ${today}` } }],
      },
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: [{ type: "text", text: { content: "" } }] },
    },
  ];

  // Sort by streak descending
  const sorted = Object.entries(streakData).sort((a, b) => b[1] - a[1]);

  for (const [habit, streak] of sorted) {
    const fire = streak > 0 ? "🔥".repeat(Math.min(streak, 10)) : "❌";
    const text = `${habit}: ${streak} día${streak !== 1 ? "s" : ""} ${fire}`;

    children.push({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [{ type: "text", text: { content: text } }],
      },
    });
  }

  if (dashboardId) {
    // Clear existing content and replace
    const existingBlocks = await notion.blocks.children.list({ block_id: dashboardId });
    for (const block of existingBlocks.results) {
      await notion.blocks.delete({ block_id: block.id });
    }

    await notion.blocks.children.append({
      block_id: dashboardId,
      children,
    });

    console.log("\n✅ Dashboard '🔥 Rachas' actualizado.");
  } else {
    // Create new page at workspace level
    await notion.pages.create({
      parent: { type: "workspace", workspace: true },
      icon: { emoji: "🔥" },
      properties: {
        title: [{ type: "text", text: { content: "🔥 Rachas" } }],
      },
      children,
    });

    console.log("\n✅ Dashboard '🔥 Rachas' creado.");
  }
}

async function main() {
  console.log("🔄 Calculando rachas...\n");

  const entries = await getAllEntries();
  const groups = groupByHabit(entries);
  const streakData = {};

  for (const [habit, habitEntries] of Object.entries(groups)) {
    const streak = calculateStreak(habitEntries);
    streakData[habit] = streak;
    console.log(`${habit}: ${streak} día${streak !== 1 ? "s" : ""}`);
    await updateStreakForEntries(habitEntries, streak);
  }

  await updateDashboard(streakData);

  console.log("\n🎉 Proceso completado.");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
