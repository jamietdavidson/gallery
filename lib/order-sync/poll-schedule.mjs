import {dateInTimeZone, getZonedComponents} from './pickup-schedule.mjs';

function addCalendarDays(year, month, day, delta) {
  const shifted = new Date(Date.UTC(year, month - 1, day + delta, 12, 0, 0));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * @param {number} intervalMinutes Must divide 60 evenly (e.g. 5, 10, 15, 30).
 */
export function isClockAlignedInterval(intervalMinutes) {
  return (
    Number.isInteger(intervalMinutes) &&
    intervalMinutes > 0 &&
    60 % intervalMinutes === 0
  );
}

/**
 * Milliseconds until the next wall-clock poll slot (e.g. :00, :10, :20 in shop TZ).
 * @param {Date} [from]
 * @param {{ intervalMinutes: number, timeZone: string }} options
 */
export function msUntilNextPollSlot(
  from = new Date(),
  {intervalMinutes, timeZone},
) {
  if (!isClockAlignedInterval(intervalMinutes)) {
    throw new Error(
      `Poll interval must divide 60 evenly (got ${intervalMinutes} minutes)`,
    );
  }

  const zoned = getZonedComponents(from, timeZone);
  const totalMinutes = zoned.hour * 60 + zoned.minute;
  const remainder = totalMinutes % intervalMinutes;

  let minutesUntil = 0;
  if (remainder === 0 && zoned.second === 0) {
    minutesUntil = 0;
  } else if (remainder === 0) {
    minutesUntil = intervalMinutes;
  } else {
    minutesUntil = intervalMinutes - remainder;
  }

  let targetMinutes = totalMinutes + minutesUntil;
  let {year, month, day} = zoned;

  if (targetMinutes >= 1_440) {
    const dayOffset = Math.floor(targetMinutes / 1_440);
    targetMinutes %= 1_440;
    const shifted = addCalendarDays(year, month, day, dayOffset);
    year = shifted.year;
    month = shifted.month;
    day = shifted.day;
  }

  const hour = Math.floor(targetMinutes / 60);
  const minute = targetMinutes % 60;
  const nextSlot = dateInTimeZone(timeZone, year, month, day, hour, minute);

  return Math.max(0, nextSlot.getTime() - from.getTime());
}

/** @param {Date} date @param {string} timeZone */
export function formatPollSlot(date, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(date);
}

/**
 * Human-readable slot marks for logging (e.g. ":00, :10, :20, :30, :40, :50").
 * @param {number} intervalMinutes
 */
export function describePollSlots(intervalMinutes) {
  const slots = [];
  for (let minute = 0; minute < 60; minute += intervalMinutes) {
    slots.push(`:${String(minute).padStart(2, '0')}`);
  }
  return slots.join(', ');
}
