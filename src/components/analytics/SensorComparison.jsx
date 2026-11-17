
import { useEffect, useMemo, useState } from "react";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const COLORS = {
  harmonized: "#e2e8f0",
  modis: "#22b5d6",
  viirs: "#b27aff",
};

function median(values) {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatNumber(value) {
  if (value === null || value === undefined) {
    return "—";
  }

  return value.toLocaleString("en-US", {
    maximumFractionDigits: 1,
  });
}

export default function SensorComparison({
  fires = [],
  selectedMonth = null,
  selectedYear = null,
}) {
  // -----------------------------------
  // 1. Chart visibility
  // -----------------------------------

  const [visible, setVisible] = useState({
    harmonized: false,
    modis: true,
    viirs: true,
  });

  // -----------------------------------
  // 2. Available years
  // -----------------------------------

  const years = useMemo(() => {
    return [
      ...new Set(
        fires
          .map((fire) => Number(fire.date?.slice(0, 4)))
          .filter(Number.isFinite)
      ),
    ].sort((a, b) => a - b);
  }, [fires]);

  const [month, setMonth] = useState(8);
  const [year, setYear] = useState(2023);

  // Synchronize with the historical heatmap
  // when the parent provides a selection.
  useEffect(() => {
    if (
      Number.isInteger(selectedMonth) &&
      selectedMonth >= 1 &&
      selectedMonth <= 12
    ) {
      setMonth(selectedMonth);
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (
      Number.isInteger(selectedYear) &&
      years.includes(selectedYear)
    ) {
      setYear(selectedYear);
    }
  }, [selectedYear, years]);

  // Keep the year selector valid after imports.
  useEffect(() => {
    if (years.length > 0 && !years.includes(year)) {
      setYear(years[years.length - 1]);
    }
  }, [years, year]);

  // -----------------------------------
  // 3. Aggregate observations by month
  // -----------------------------------

  const monthlyData = useMemo(() => {
    const counts = new Map();

    fires.forEach((fire) => {
      if (!fire.date || !fire.satellite) return;

      const key = fire.date.slice(0, 7);

      if (!/^\d{4}-\d{2}$/.test(key)) return;

      if (!counts.has(key)) {
        counts.set(key, {
          month: key,
          MODIS: 0,
          VIIRS: 0,
        });
      }

      const current = counts.get(key);

      if (fire.satellite === "MODIS") {
        current.MODIS += 1;
      }

      if (fire.satellite === "VIIRS") {
        current.VIIRS += 1;
      }
    });

    return [...counts.values()].sort((a, b) =>
      a.month.localeCompare(b.month)
    );
  }, [fires]);

  // -----------------------------------
  // 4. Selected month statistics
  // -----------------------------------

  const selectedKey =
    `${year}-${String(month).padStart(2, "0")}`;

  const selected = monthlyData.find(
    (item) => item.month === selectedKey
  );

  // Raw sensor observations are counted
  // separately. This combined total is NOT
  // a harmonized count of unique fires.
  const selectedCount = selected
    ? selected.MODIS + selected.VIIRS
    : null;

  // -----------------------------------
  // 5. Historical comparison
  // -----------------------------------

  const baseline = monthlyData
    .filter((item) => {
      const itemYear = Number(item.month.slice(0, 4));
      const itemMonth = Number(item.month.slice(5, 7));

      return itemMonth === month && itemYear !== year;
    })
    .map((item) => item.MODIS + item.VIIRS);

  // Preliminary comparison only.
  // Full coverage and harmonization checks
  // are required for scientific conclusions.
  const historicalMedian =
    baseline.length >= 3 ? median(baseline) : null;

  const difference =
    historicalMedian !== null &&
    historicalMedian > 0 &&
    selectedCount !== null
      ? ((selectedCount - historicalMedian) /
          historicalMedian) *
        100
      : null;

  // -----------------------------------
  // 6. Comparison status
  // -----------------------------------

  let comparisonStatus = "Insufficient data";

  if (difference !== null) {
    if (difference >= 50) {
      comparisonStatus = "Well above baseline";
    } else if (difference > 0) {
      comparisonStatus = "Above baseline";
    } else if (difference <= -50) {
      comparisonStatus = "Well below baseline";
    } else if (difference < 0) {
      comparisonStatus = "Below baseline";
    } else {
      comparisonStatus = "Equal to baseline";
    }
  }

  // -----------------------------------
  // 7. Chart visibility handler
  // -----------------------------------

  function toggleSeries(key) {
    if (key === "harmonized") return;

    setVisible((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  }

  // -----------------------------------
  // 8. Comparison bar scaling
  // -----------------------------------

  const maxBarValue = Math.max(
    historicalMedian ?? 0,
    selectedCount ?? 0,
    1
  );

  const medianWidth =
    historicalMedian === null
      ? 0
      : (historicalMedian / maxBarValue) * 100;

  const observedWidth =
    selectedCount === null
      ? 0
      : (selectedCount / maxBarValue) * 100;

  // -----------------------------------
  // 9. Render
  // -----------------------------------

  return (
    <div className="sensor-comparison-grid">

      {/* LEFT PANEL */}

      <section className="panel comparison-panel">
        <h3>Compared with normal</h3>

        <p className="chart-description">
          Chosen month against the median of other
          available years.
        </p>

        <div className="comparison-selectors">
          <select
            aria-label="Select comparison month"
            value={month}
            onChange={(event) =>
              setMonth(Number(event.target.value))
            }
          >
            {MONTHS.map((name, index) => (
              <option
                key={name}
                value={index + 1}
              >
                {name}
              </option>
            ))}
          </select>

          <select
            aria-label="Select comparison year"
            value={years.includes(year) ? year : ""}
            onChange={(event) =>
              setYear(Number(event.target.value))
            }
          >
            {years.length === 0 && (
              <option value="">
                No data
              </option>
            )}

            {years.map((availableYear) => (
              <option
                key={availableYear}
                value={availableYear}
              >
                {availableYear}
              </option>
            ))}
          </select>
        </div>

        {/* Percentage and status */}

        <div className="comparison-result">
          <div className="comparison-percentage">
            {difference === null
              ? "—"
              : `${difference > 0 ? "+" : ""}${difference.toFixed(0)}%`}
          </div>

          <span className="comparison-status">
            {comparisonStatus}
          </span>
        </div>

        {/* Formula */}

        <p className="comparison-formula">
          {difference === null
            ? "Not enough comparable historical observations."
            : `(${formatNumber(selectedCount)} − ${formatNumber(historicalMedian)}) ÷ ${formatNumber(historicalMedian)} × 100 = ${difference > 0 ? "+" : ""}${difference.toFixed(1)}%`}
        </p>

        {/* Comparison bars */}

        <div className="comparison-bars">

          <div className="comparison-bar-row">
            <span>Historical median</span>

            <div className="comparison-bar-track">
              <div
                className="comparison-bar median-bar"
                style={{
                  width: `${medianWidth}%`,
                }}
              />
            </div>

            <strong>
              {formatNumber(historicalMedian)}
            </strong>
          </div>

          <div className="comparison-bar-row">
            <span>
              {MONTHS[month - 1]} {year}
            </span>

            <div className="comparison-bar-track">
              <div
                className="comparison-bar observed-bar"
                style={{
                  width: `${observedWidth}%`,
                }}
              />
            </div>

            <strong>
              {formatNumber(selectedCount)}
            </strong>
          </div>

        </div>

        {/* Scientific explanation */}

        <div className="comparison-insight">
          {fires.length === 0 ? (
            <p>
              Import MODIS and VIIRS CSV files
              to begin the analysis.
            </p>
          ) : difference === null ? (
            <p>
              Historical comparison is unavailable.
              At least three other years with
              comparable monthly observations
              are required.
            </p>
          ) : (
            <>
              <p>
                <strong>
                  {MONTHS[month - 1]} {year}
                </strong>{" "}
                recorded{" "}
                <strong>
                  {Math.abs(difference).toFixed(1)}%
                </strong>{" "}
                {difference >= 0 ? "more" : "fewer"}{" "}
                raw satellite detections than
                the preliminary historical median.
              </p>

              <p>
                This comparison uses{" "}
                {baseline.length} other available
                years. It has not yet been corrected
                for differences between MODIS
                and VIIRS detection sensitivity.
              </p>
            </>
          )}
        </div>
      </section>

      {/* RIGHT PANEL */}

      <section className="panel sensor-chart-panel">
        <h3>Sensor comparison over time</h3>

        <p className="chart-description">
          Compare raw MODIS and VIIRS detections.
          Harmonized estimates will be added after
          validating the sensor adjustment model.
        </p>

        {/* THREE CHECKBOXES */}

        <div className="sensor-checkboxes">

          <label
            className="sensor-checkbox-disabled"
            title="Harmonized data is not available yet"
          >
            <input
              type="checkbox"
              checked={visible.harmonized}
              disabled
              readOnly
            />

            <span
              className="sensor-line sensor-harmonized"
            />

            Harmonized (VIIRS-equivalent)
          </label>

          <label>
            <input
              type="checkbox"
              checked={visible.modis}
              onChange={() =>
                toggleSeries("modis")
              }
            />

            <span
              className="sensor-line sensor-modis"
            />

            MODIS raw
          </label>

          <label>
            <input
              type="checkbox"
              checked={visible.viirs}
              onChange={() =>
                toggleSeries("viirs")
              }
            />

            <span
              className="sensor-line sensor-viirs"
            />

            VIIRS raw
          </label>

        </div>

        {/* CHART */}

        <div className="sensor-chart-container">

          {monthlyData.length === 0 ? (
            <div className="sensor-empty-state">
              <p>No satellite observations loaded.</p>
              <span>
                Import your MODIS and VIIRS CSV
                files to display the comparison.
              </span>
            </div>
          ) : (
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <LineChart
                data={monthlyData}
                margin={{
                  top: 10,
                  right: 15,
                  left: 0,
                  bottom: 5,
                }}
              >
                <CartesianGrid
                  stroke="#29333d"
                  strokeDasharray="3 3"
                  vertical={false}
                />

                <XAxis
                  dataKey="month"
                  stroke="#93a6b9"
                  minTickGap={25}
                  tickLine={false}
                />

                <YAxis
                  stroke="#93a6b9"
                  tickLine={false}
                  allowDecimals={false}
                  tickFormatter={(value) =>
                    value.toLocaleString("en-US")
                  }
                />

                <Tooltip
                  contentStyle={{
                    background: "#171c20",
                    border: "1px solid #354251",
                    borderRadius: 8,
                    color: "#fff",
                  }}
                  formatter={(value, name) => [
                    formatNumber(value),
                    name,
                  ]}
                />

                {visible.modis && (
                  <Line
                    type="linear"
                    dataKey="MODIS"
                    name="MODIS raw"
                    stroke={COLORS.modis}
                    dot={false}
                    activeDot={{ r: 5 }}
                    strokeWidth={2}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}

                {visible.viirs && (
                  <Line
                    type="linear"
                    dataKey="VIIRS"
                    name="VIIRS raw"
                    stroke={COLORS.viirs}
                    dot={false}
                    activeDot={{ r: 5 }}
                    strokeWidth={2}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}

              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <p className="sensor-chart-note">
          Cyan: raw MODIS detections. Purple:
          raw VIIRS detections. These are
          satellite observations, not unique
          wildfire counts. Months without
          imported observations are not
          necessarily fire-free.
        </p>

        {/* Harmonization status */}

        <div className="sensor-harmonization-status">
          <strong>
            Harmonized series
          </strong>

          <p>
            Not available yet. We will calculate
            VIIRS-equivalent estimates and
            uncertainty intervals using the
            MODIS–VIIRS harmonization analysis.
          </p>
        </div>
      </section>

    </div>
  );
}
