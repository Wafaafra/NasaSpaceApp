import { useMemo } from "react";
import "./BurningCalendar.css";

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function getIntensity(count, max) {
  if (count <= 0 || max <= 0) return 0;
  const ratio = count / max;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}
export default function BurningCalendar({ daily = [], year, month, selectedDay, onSelectDay, unit = "activity" }) {
  const days = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const counts = new Map(daily.map((item) => [Number(item.day), Number(item.count) || 0]));
    return Array.from({ length: daysInMonth }, (_, index) => ({
      day: index + 1, count: counts.get(index + 1) || 0,
    }));
  }, [daily, year, month]);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const maxCount = Math.max(0, ...days.map((item) => item.count));
  const format = (value) => value.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return (
    <div className="burning-calendar">
      <div className="calendar-grid">
        {weekDays.map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
        {Array.from({ length: firstDay }, (_, index) => <div key={`empty-${index}`} />)}
        {days.map(({ day, count }) => (
          <button key={day} type="button"
            className={`calendar-day intensity-${getIntensity(count, maxCount)} ${selectedDay === day ? "selected-day" : ""}`}
            title={`${day}: ${format(count)} ${unit}`}
            aria-label={`${day}: ${format(count)} ${unit}`}
            aria-pressed={selectedDay === day}
            onClick={() => onSelectDay?.(day)}>
            <span>{day}</span><small>{count > 0 ? format(count) : ""}</small>
          </button>
        ))}
      </div>
      <div className="calendar-legend"><span>Fewer</span>
        {[0, 1, 2, 3, 4].map((level) => <span key={level} className={`legend-square intensity-${level}`} />)}
        <span>More</span>
      </div>
    </div>
  );
}
