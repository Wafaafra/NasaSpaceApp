
import { useMemo, useState } from "react";
import { Copy, Download } from "lucide-react";
import { compareWithHistoricalMedian } from "../../services/historicalComparison";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

function buildHeatmapData(fires) {
  const counts = new Map();

  for (const fire of fires) {
    const monthKey = fire.date.slice(0, 7);
    counts.set(monthKey, (counts.get(monthKey) || 0) + 1);
  }

   const years = Array.from(
  { length: 21 },
  (_, i) => 2005 + i
);

  const rows = years.flatMap(year =>
    MONTHS.map((month, index) => {
      const monthNumber = index + 1;
      const key = `${year}-${String(monthNumber).padStart(2, "0")}`;

      return {
        year,
        month,
        monthNumber,
        key,
        count: counts.get(key) ?? null
      };
    })
  );

  return { years, rows };
}

function getColor(count, maximum) {
  if (count === null) return null;

  const intensity = Math.sqrt(count / Math.max(maximum, 1));

  const start = [52, 39, 34];
  const end = [255, 150, 86];

  const rgb = start.map((value, i) =>
    Math.round(value + (end[i] - value) * intensity)
  );

  return `rgb(${rgb.join(",")})`;
}

function toCSV(rows) {
  const header = "Year,Month,Detections,Data Status";

  const lines = rows.map(row => [
    row.year,
    row.month,
    row.count ?? "",
    row.count === null
      ? "No imported detections; coverage unknown"
      : "Observed detections; coverage unverified"
  ].join(","));

  return [header, ...lines].join("\r\n");
}

export default function HistoricalHeatmap({
  fires = [],
  onMonthSelect
}) {
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState("");

  const { years, rows } = useMemo(
    () => buildHeatmapData(fires),
    [fires]
  );

  const maximum = Math.max(
    1,
    ...rows.map(row => row.count ?? 0)
  );

  const selectedRow = rows.find(
    row => row.key === selected
  );
  

  const rowsByYear = useMemo(() => {
    return years.map(year => ({
      year,
      months: rows.filter(row => row.year === year)
    }));
  }, [years, rows]);

  async function copyCSV() {
    try {
      await navigator.clipboard.writeText(toCSV(rows));
      setFeedback("CSV copied to clipboard");
    } catch {
      setFeedback("Copy failed. Try downloading instead.");
    }
  }

  function downloadCSV() {
    const blob = new Blob(
      [toCSV(rows)],
      { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "firelens-burning-calendar.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
    setFeedback("CSV download started");
  }

  function handleSelect(row) {
    setSelected(row.key);
    onMonthSelect?.(row.year, row.monthNumber);
  }

  if (years.length === 0) {
    return (
      <section className="panel historical-heatmap">
        <h3>Burning Activity Calendar</h3>
        <p className="chart-description">
          Import NASA FIRMS observations to explore
          historical monthly fire activity.
        </p>
      </section>
    );
  }

  return (
    <section className="panel historical-heatmap">
      <div className="heatmap-heading">
        <div>
          <h3>Burning Activity Calendar</h3>
          <p>
            Each cell represents one month.
            Select a month to explore its detections.
          </p>
        </div>

        <div className="heatmap-actions">
          <button onClick={copyCSV} type="button">
            <Copy size={15} />
            Copy CSV
          </button>

          <button onClick={downloadCSV} type="button">
            <Download size={15} />
            Download CSV
          </button>
        </div>
      </div>

      {feedback && (
        <p className="heatmap-feedback" role="status">
          {feedback}
        </p>
      )}

      <div className="heatmap-scroll">
        <div className="heatmap-grid">
          <div className="heatmap-label" />

          {MONTHS.map(month => (
            <div className="heatmap-label" key={month}>
              {month}
            </div>
          ))}

          {rowsByYear.map(({ year, months }) => (
            <div className="heatmap-row" key={year}>
              <div className="heatmap-year">{year}</div>

              {months.map(row => (
                <button
                  key={row.key}
                  type="button"
                  className={`heatmap-cell ${
                    row.count === null ? "no-data" : ""
                  } ${
                    selected === row.key ? "heatmap-selected" : ""
                  }`}
                  style={{
                    backgroundColor:
                      getColor(row.count, maximum) || undefined
                  }}
                  onClick={() => handleSelect(row)}
                  title={`${row.month} ${row.year}: ${
                    row.count ?? "No imported detections"
                  }`}
                >
                  {row.count === null
                    ? "—"
                    : row.count.toLocaleString()}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="heatmap-footer">
        <div className="heatmap-legend">
          <span>Low</span>
          <div className="heatmap-gradient" />
          <span>High</span>
        </div>

        <span>
          Square-root color scale · Missing coverage not verified
        </span>
      </div>

    
{selectedRow && (
  <div className="heatmap-details">
    <div className="comparison-heading">
      <div>
        <h3>
          {selectedRow.month} {selectedRow.year}
        </h3>
        <p>Historical fire activity comparison</p>
      </div>
    </div>

    {selectedRow.count === null ? (
      <p>
        No observations imported for this month.
        Historical comparison is unavailable.
      </p>
    ) : (
      <>
        <div className="comparison-stats">
          <div>
            <span>SELECTED MONTH</span>
            <strong>
              {selectedRow.count.toLocaleString()}
            </strong>
          </div>

          <div>
            <span>HISTORICAL MEDIAN</span>
            <strong>
              {comparison
                ? comparison.median.toLocaleString()
                : "—"}
            </strong>
          </div>

          <div>
            <span>DIFFERENCE</span>
            <strong>
              {comparison?.percentage == null
                ? "—"
                : `${comparison.percentage > 0 ? "+" : ""}${comparison.percentage.toFixed(1)}%`}
            </strong>
          </div>
        </div>

        <p className="comparison-explanation">
          {comparison
            ? `${comparison.status}. Compared with ${comparison.yearsCompared} other years for the same calendar month.`
            : "Insufficient historical data. At least three other years with comparable, complete observations are required."}
        </p>
      </>
    )}
  </div>
)}

    </section>
  );
}
