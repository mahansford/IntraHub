// Minimal iCalendar (RFC 5545) VEVENT parser — deliberately scoped down:
// it reads plain, non-recurring events (DTSTART/DTEND/SUMMARY) and shows
// them sorted by start time. A VEVENT carrying an RRULE is included using
// its own DTSTART (the rule's first occurrence) with `recurring: true` so
// the UI can label it, rather than expanding the full recurrence — proper
// RRULE expansion (weekly/monthly/exceptions/timezones) needs a real
// library and was out of scope for a first version of this card.

function unfoldLines(text) {
  // iCal "folds" long lines with a leading space/tab on the continuation.
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function parseIcsDate(value) {
  // Handles YYYYMMDD (all-day) and YYYYMMDDTHHMMSS[Z] (timed).
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) {
    return { date: new Date(Number(y), Number(mo) - 1, Number(d)), allDay: true };
  }
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? 'Z' : ''}`;
  return { date: new Date(iso), allDay: false };
}

function parseIcs(text) {
  const unfolded = unfoldLines(text);
  const lines = unfolded.split('\n');
  const events = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current && current.dtstart && current.summary) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const keyPart = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const key = keyPart.split(';')[0];

    if (key === 'SUMMARY') current.summary = value.replace(/\\,/g, ',').replace(/\\;/g, ';');
    else if (key === 'DTSTART') current.dtstart = parseIcsDate(value);
    else if (key === 'DTEND') current.dtend = parseIcsDate(value);
    else if (key === 'RRULE') current.recurring = true;
    else if (key === 'LOCATION') current.location = value.replace(/\\,/g, ',');
  }

  return events;
}

async function getCalendarEvents(icsUrl, { limit = 8, withinDays = 60 } = {}) {
  const resp = await fetch(icsUrl, { headers: { 'User-Agent': 'Alcove/1.0' } });
  if (!resp.ok) throw new Error(`Calendar feed responded ${resp.status}`);
  const text = await resp.text();
  const events = parseIcs(text);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cutoff = new Date(startOfToday.getTime() + withinDays * 86400000);

  return events
    .filter((e) => e.dtstart?.date && e.dtstart.date >= startOfToday && e.dtstart.date <= cutoff)
    .sort((a, b) => a.dtstart.date - b.dtstart.date)
    .slice(0, limit)
    .map((e) => ({
      summary: e.summary,
      start: e.dtstart.date.toISOString(),
      allDay: e.dtstart.allDay,
      location: e.location || null,
      recurring: Boolean(e.recurring),
    }));
}

export { getCalendarEvents };
