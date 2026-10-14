/**
 * Backup schedules are stored in UTC on the server (so they don't depend on
 * the server's timezone). The UI shows and edits them in the user's local
 * time. Note: converting can change the DAY too, e.g. Monday 02:00 in India
 * (UTC+5:30) is Sunday 20:30 UTC.
 *
 * Weekdays use the server's numbering: 0 = Monday ... 6 = Sunday.
 * (JavaScript's Date.getDay() uses 0 = Sunday, hence the "+ 6) % 7".)
 */

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const toServerDay = (jsDay) => (jsDay + 6) % 7;
const toJsDay = (serverDay) => (serverDay + 1) % 7;

/** Local {hour, minute, weekday} -> UTC {hour, minute, weekday}. */
export function localToUtc({ hour, minute, weekday }) {
  const d = new Date();
  if (weekday != null) d.setDate(d.getDate() + ((toJsDay(weekday) - d.getDay() + 7) % 7));
  d.setHours(hour, minute, 0, 0);
  return { hour: d.getUTCHours(), minute: d.getUTCMinutes(), weekday: weekday == null ? null : toServerDay(d.getUTCDay()) };
}

/** UTC {hour, minute, weekday} -> local {hour, minute, weekday}. */
export function utcToLocal({ hour, minute, weekday }) {
  const d = new Date();
  if (weekday != null) d.setUTCDate(d.getUTCDate() + ((toJsDay(weekday) - d.getUTCDay() + 7) % 7));
  d.setUTCHours(hour, minute, 0, 0);
  return { hour: d.getHours(), minute: d.getMinutes(), weekday: weekday == null ? null : toServerDay(d.getDay()) };
}

/** "Every day at 2:00 am" / "Every Sunday at 8:30 pm" (local time). */
export function describeSchedule(job) {
  const local = utcToLocal(job);
  const time = new Date(2000, 0, 1, local.hour, local.minute).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return job.frequency === "daily" ? `Every day at ${time}` : `Every ${WEEKDAYS[local.weekday]} at ${time}`;
}

/** "HH:MM" for <input type="time">. */
export const toTimeInput = (hour, minute) => `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
