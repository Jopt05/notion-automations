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

async function main() {
  console.log("🔄 Calculando rachas...\n");

  const entries = await getAllEntries();
  const groups = groupByHabit(entries);

  for (const [habit, habitEntries] of Object.entries(groups)) {
    const streak = calculateStreak(habitEntries);
    console.log(`${habit}: ${streak} día${streak !== 1 ? "s" : ""}`);
    await updateStreakForEntries(habitEntries, streak);
  }

  console.log("\n🎉 Proceso completado.");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
