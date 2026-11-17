
import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  CalendarDays,
  AlertTriangle,
} from "lucide-react";

/* =====================================
   DATA HELPERS
===================================== */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getContribution(row) {
  if (
    row.viirsPresent !== null &&
    row.viirsPresent !== undefined &&
    row.viirsPresent !== ""
  ) {
    const value = Number(row.viirsPresent);

    if (value === 0 || value === 1) {
      return {
        value,
        source: "observed",
      };
    }
  }

  if (
    row.probability !== null &&
    row.probability !== undefined &&
    row.probability !== ""
  ) {
    const value = Number(row.probability);

    if (
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1
    ) {
      return {
        value,
        source: "estimated",
      };
    }
  }

  return null;
}

function median(values) {
  if (!values.length) return null;

  const sorted = [...values].sort(
    (a, b) => a - b
  );

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (
    sorted[middle - 1] + sorted[middle]
  ) / 2;
}

function formatNumber(value, decimals = 1) {
  if (value === null || value === undefined) {
    return "—";
  }

  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: decimals,
  });
}

function formatPercentage(value) {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/* =====================================
   AGGREGATION
===================================== */

function buildHistoricalData(records) {
  const monthly = new Map();

  for (const row of records) {
    const date = String(row.date || "");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      continue;
    }

    const month = date.slice(0, 7);
    const contribution = getContribution(row);

    if (!monthly.has(month)) {
      monthly.set(month, {
        month,
        year: Number(month.slice(0, 4)),
        monthNumber: Number(month.slice(5, 7)),
        activity: 0,
        observed: 0,
        estimated: 0,
        availableRows: 0,
        missingRows: 0,
        observedRows: 0,
        estimatedRows: 0,
        cells: new Set(),
      });
    }

    const item = monthly.get(month);

    if (!contribution) {
      item.missingRows++;
      continue;
    }

    item.activity += contribution.value;
    item.availableRows++;
    item.cells.add(row.cellId);

    if (contribution.source === "observed") {
      item.observed += contribution.value;
      item.observedRows++;
    } else {
      item.estimated += contribution.value;
      item.estimatedRows++;
    }
  }

  return [...monthly.values()]
    .map((item) => ({
      ...item,
      cellCount: item.cells.size,
      coverage:
        item.availableRows + item.missingRows > 0
          ? item.availableRows /
            (item.availableRows + item.missingRows)
          : 0,
      cells: undefined,
    }))
    .sort((a, b) =>
      a.month.localeCompare(b.month)
    );
}

/* =====================================
   SMALL STAT CARD
===================================== */

function MetricCard({
  icon: Icon,
  label,
  value,
  description,
  color = "#f97352",
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 20,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color,
          marginBottom: 14,
        }}
      >
        <Icon size={19} />
        <span
          style={{
            color: "#64748b",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {label}
        </span>
      </div>

      <strong
        style={{
          display: "block",
          fontSize: 29,
          fontWeight: 800,
          color: "#172033",
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </strong>

      <p
        style={{
          margin: "8px 0 0",
          fontSize: 12,
          color: "#64748b",
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
    </div>
  );
}

/* =====================================
   MAIN COMPONENT
===================================== */

export default function HistoricalAnomalies({
  records = [],
  onSelectMonth,
}) {
  const monthlyData = useMemo(
    () => buildHistoricalData(records),
    [records]
  );

  const availableYears = useMemo(() => {
    return [
      ...new Set(
        monthlyData.map((row) => row.year)
      ),
    ].sort((a, b) => a - b);
  }, [monthlyData]);

  const [chosenYear, setChosenYear] =
    useState("");

  const [chosenMonth, setChosenMonth] =
    useState(8);

  const [baselineYears, setBaselineYears] =
    useState(10);

  const selectedYear =
    availableYears.includes(Number(chosenYear))
      ? Number(chosenYear)
      : availableYears.at(-1) || null;

  const selectedMonth = Number(chosenMonth);

  const analysis = useMemo(() => {
    if (!selectedYear) return null;

    const target = monthlyData.find(
      (item) =>
        item.year === selectedYear &&
        item.monthNumber === selectedMonth
    );

    const historical = monthlyData
      .filter(
        (item) =>
          item.monthNumber === selectedMonth &&
          item.year < selectedYear &&
          item.year >= selectedYear - baselineYears
      )
      .sort((a, b) => a.year - b.year);

    // Only months with at least one usable
    // observation or prediction enter the baseline.
    const validHistorical = historical.filter(
      (item) => item.availableRows > 0
    );

    const historicalValues =
      validHistorical.map(
        (item) => item.activity
      );

    const baseline = median(historicalValues);

    const targetValue =
      target && target.availableRows > 0
        ? target.activity
        : null;

    const anomaly =
      targetValue !== null &&
      baseline !== null &&
      baseline > 0
        ? ((targetValue - baseline) / baseline) * 100
        : null;

    const difference =
      targetValue !== null &&
      baseline !== null
        ? targetValue - baseline
        : null;

    const chartData = [
      ...validHistorical.map((item) => ({
        year: String(item.year),
        activity: item.activity,
        selected: false,
        coverage: item.coverage,
      })),
      ...(targetValue !== null
        ? [
            {
              year: String(selectedYear),
              activity: targetValue,
              selected: true,
              coverage: target.coverage,
            },
          ]
        : []),
    ];

    const historicalCoverage =
      validHistorical.length
        ? validHistorical.reduce(
            (sum, item) =>
              sum + item.coverage,
            0
          ) / validHistorical.length
        : 0;

    const targetCoverage =
      target?.coverage || 0;

    const enoughHistory =
      validHistorical.length >= 5;

    const sufficientCoverage =
      targetCoverage >= 0.9 &&
      historicalCoverage >= 0.9;

    // Candidate cell coverage varies between
    // months. Even high row completeness
    // does not guarantee comparable sampling.
    const reliable =
      enoughHistory &&
      sufficientCoverage &&
      baseline !== null &&
      targetValue !== null;

    return {
      target,
      targetValue,
      historical,
      validHistorical,
      baseline,
      anomaly,
      difference,
      chartData,
      targetCoverage,
      historicalCoverage,
      enoughHistory,
      sufficientCoverage,
      reliable,
    };
  }, [
    monthlyData,
    selectedYear,
    selectedMonth,
    baselineYears,
  ]);

  if (!records.length) {
    return (
      <div className="analytics-panel">
        <h3>No harmonized data available</h3>
        <p>
          Select Harmonized mode and choose a
          date range containing historical data.
        </p>
      </div>
    );
  }

  const status =
    analysis?.anomaly === null ||
    analysis?.anomaly === undefined
      ? "Insufficient data"
      : analysis.anomaly > 20
        ? "Above historical median"
        : analysis.anomaly < -20
          ? "Below historical median"
          : "Near historical median";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 22,
        width: "100%",
      }}
    >
      {/* HEADER */}

      <section className="analytics-panel">
        <div className="analytics-panel-header">
          <h3>Historical Fire Anomaly Detection</h3>
          <p>
            Compare harmonized burning activity
            with the same month in previous years.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            marginTop: 20,
          }}
        >
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 7,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Target year

            <select
              value={selectedYear || ""}
              onChange={(event) =>
                setChosenYear(event.target.value)
              }
              style={{
                padding: 11,
                border: "1px solid #e2e8f0",
                borderRadius: 9,
              }}
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 7,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Target month

            <select
              value={selectedMonth}
              onChange={(event) =>
                setChosenMonth(
                  Number(event.target.value)
                )
              }
              style={{
                padding: 11,
                border: "1px solid #e2e8f0",
                borderRadius: 9,
              }}
            >
              {MONTHS.map((month, index) => (
                <option
                  key={month}
                  value={index + 1}
                >
                  {month}
                </option>
              ))}
            </select>
          </label>

          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 7,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Historical baseline

            <select
              value={baselineYears}
              onChange={(event) =>
                setBaselineYears(
                  Number(event.target.value)
                )
              }
              style={{
                padding: 11,
                border: "1px solid #e2e8f0",
                borderRadius: 9,
              }}
            >
              <option value={5}>
                Previous 5 years
              </option>
              <option value={10}>
                Previous 10 years
              </option>
              <option value={15}>
                Previous 15 years
              </option>
              <option value={20}>
                Previous 20 years
              </option>
            </select>
          </label>
        </div>
      </section>

      {/* STATISTICS */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 15,
        }}
      >
        <MetricCard
          icon={Activity}
          label="Selected month activity"
          value={formatNumber(
            analysis?.targetValue
          )}
          description="Expected positive VIIRS cell-days"
        />

        <MetricCard
          icon={CalendarDays}
          label="Historical median"
          value={formatNumber(
            analysis?.baseline
          )}
          description="Median of available previous same-month values"
          color="#3b82f6"
        />

        <MetricCard
          icon={
            analysis?.anomaly >= 0
              ? TrendingUp
              : TrendingDown
          }
          label="Historical anomaly"
          value={formatPercentage(
            analysis?.anomaly
          )}
          description={status}
          color={
            analysis?.anomaly > 20
              ? "#dc2626"
              : analysis?.anomaly < -20
                ? "#16a34a"
                : "#f59e0b"
          }
        />

        <MetricCard
          icon={CalendarDays}
          label="Reference years"
          value={
            analysis?.validHistorical.length || 0
          }
          description="Previous years with available data"
          color="#8b5cf6"
        />
      </div>

      {/* COMPARISON CHART */}

      <section className="analytics-panel">
        <div className="analytics-panel-header">
          <h3>
            {MONTHS[selectedMonth - 1]} historical
            comparison
          </h3>
          <p>
            Orange represents the selected year.
            Blue represents previous years.
            Click a bar to select that year.
          </p>
        </div>

        <div
          style={{
            height: 340,
            width: "100%",
            marginTop: 20,
          }}
        >
          {analysis?.chartData.length ? (
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
                data={analysis.chartData}
                margin={{
                  top: 15,
                  right: 20,
                  left: 0,
                  bottom: 10,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e2e8f0"
                />

                <XAxis dataKey="year" />

                <YAxis
                  tickFormatter={(value) =>
                    formatNumber(value, 0)
                  }
                />

                <Tooltip
                  formatter={(value) => [
                    formatNumber(value),
                    "Expected positive cell-days",
                  ]}
                />

                {analysis.baseline !== null && (
                  <ReferenceLine
                    y={analysis.baseline}
                    stroke="#dc2626"
                    strokeDasharray="5 5"
                    label={{
                      value: "Historical median",
                      position: "insideTopRight",
                      fill: "#dc2626",
                      fontSize: 11,
                    }}
                  />
                )}

                <Bar
                  dataKey="activity"
                  name="Burning activity"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={55}
                  onClick={(entry) => {
                    if (entry?.year) {
                      setChosenYear(entry.year);
                    }
                  }}
                  cursor="pointer"
                >
                  {analysis.chartData.map(
                    (item) => (
                      <Cell
                        key={item.year}
                        fill={
                          item.selected
                            ? "#f97352"
                            : "#4f83cc"
                        }
                      />
                    )
                  )}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p>
              No historical observations available
              for this selection.
            </p>
          )}
        </div>
      </section>

      {/* INTERPRETATION */}

      <section className="analytics-panel">
        <div className="analytics-panel-header">
          <h3>Historical interpretation</h3>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            padding: 16,
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            borderRadius: 12,
            marginTop: 15,
          }}
        >
          <AlertTriangle
            size={20}
            color="#ea580c"
            style={{ flexShrink: 0 }}
          />

          <div>
            <strong
              style={{
                color: "#9a3412",
              }}
            >
              {analysis?.reliable
                ? status
                : "Exploratory comparison"}
            </strong>

            <p
              style={{
                margin: "8px 0 0",
                lineHeight: 1.7,
                color: "#7c2d12",
                fontSize: 13,
              }}
            >
              {analysis?.anomaly !== null &&
              analysis?.anomaly !== undefined
                ? `The selected month differs from its historical median by ${formatPercentage(
                    analysis.anomaly
                  )}. `
                : "A percentage anomaly cannot be calculated for this selection. "}

              {!analysis?.enoughHistory
                ? "Fewer than five historical years contain usable data. "
                : ""}

              {!analysis?.sufficientCoverage
                ? "Some records have missing values. "
                : ""}

              These values represent expected
              VIIRS-positive cell-days, not individual
              fires or burned area. Changes in
              candidate-cell coverage may affect
              comparisons between years.
            </p>
          </div>
        </div>

        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(170px, 1fr))",
            gap: 12,
          }}
        >
          <div>
            <span
              style={{
                color: "#64748b",
                fontSize: 12,
              }}
            >
              Target record completeness
            </span>

            <strong
              style={{
                display: "block",
                marginTop: 5,
              }}
            >
              {formatNumber(
                (analysis?.targetCoverage || 0) *
                  100
              )}
              %
            </strong>
          </div>

          <div>
            <span
              style={{
                color: "#64748b",
                fontSize: 12,
              }}
            >
              Historical record completeness
            </span>

            <strong
              style={{
                display: "block",
                marginTop: 5,
              }}
            >
              {formatNumber(
                (analysis?.historicalCoverage || 0) *
                  100
              )}
              %
            </strong>
          </div>

          <div>
            <span
              style={{
                color: "#64748b",
                fontSize: 12,
              }}
            >
              Difference from median
            </span>

            <strong
              style={{
                display: "block",
                marginTop: 5,
              }}
            >
              {formatNumber(
                analysis?.difference
              )}
            </strong>
          </div>
        </div>

        {analysis?.targetValue !== null &&
          analysis?.targetValue !== undefined &&
          onSelectMonth && (
            <button
              type="button"
              onClick={() =>
                onSelectMonth(
                  `${selectedYear}-${String(
                    selectedMonth
                  ).padStart(2, "0")}`
                )
              }
              style={{
                marginTop: 20,
                padding: "12px 18px",
                borderRadius: 10,
                background: "#f97352",
                border: "none",
                color: "#ffffff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Explore this month
            </button>
          )}
      </section>
    </div>
  );
}
