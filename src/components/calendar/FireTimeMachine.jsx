
import { useEffect, useMemo, useState } from "react";
import BurningCalendar from "./BurningCalendar";

import {
  getAvailableYears,
  getYearlyActivity
} from "../../services/historicalAnalytics";

export default function FireTimeMachine({
  fires,
  onDateChange
}) {
  const years = useMemo(
    () => getAvailableYears(fires),
    [fires]
  );

  const yearlyActivity = useMemo(
    () => getYearlyActivity(fires),
    [fires]
  );

  const [year, setYear] = useState(2023);
  const [month, setMonth] = useState(7);
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    if (years.length > 0 && !years.includes(year)) {
      setYear(years[0]);
    }
  }, [years, year]);

  function selectDay(day) {
    const nextDay = selectedDay === day ? null : day;
    setSelectedDay(nextDay);

    if (nextDay === null) {
      onDateChange(null);
      return;
    }

    const date = [
      year,
      String(month).padStart(2, "0"),
      String(nextDay).padStart(2, "0")
    ].join("-");

    onDateChange(date);
  }

  function changeMonth(value) {
    setMonth(Number(value));
    setSelectedDay(null);
    onDateChange(null);
  }

  function changeYear(value) {
    setYear(Number(value));
    setSelectedDay(null);
    onDateChange(null);
  }

  const monthName = new Date(year, month - 1, 1)
    .toLocaleString("en-US", { month: "long" });

  return (
    <section className="panel time-machine">
      <div className="panel-heading">
        <h3>Fire Time Machine</h3>
        <span>Historical Explorer</span>
      </div>

      <p className="chart-description">
        Explore daily fire detections and historical patterns.
      </p>

      <div className="time-controls">
        <select
          value={year}
          onChange={e => changeYear(e.target.value)}
        >
          {years.length === 0 && (
            <option value={2023}>2023</option>
          )}

          {years.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <select
          value={month}
          onChange={e => changeMonth(e.target.value)}
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={i + 1}>
              {new Date(2023, i, 1)
                .toLocaleString("en-US", { month: "long" })}
            </option>
          ))}
        </select>
      </div>

      <h4>{monthName} {year}</h4>

      <BurningCalendar
        fires={fires}
        year={year}
        month={month}
        selectedDay={selectedDay}
        onSelectDay={selectDay}
      />

      <div className="historical-summary">
        <h4>Yearly Observations</h4>

        {yearlyActivity.length === 0 ? (
          <p>No observations loaded.</p>
        ) : (
          yearlyActivity.map(item => (
            <div className="year-row" key={item.year}>
              <span>{item.year}</span>
              <strong>{item.count.toLocaleString()}</strong>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
