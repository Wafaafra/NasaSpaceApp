
import { useMemo, useState } from "react";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import {
  Flame,
  Layers,
  Copy,
  Download,
  MapPinned,
  Activity,
  TrendingUp,
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";

import SensorTimeline from "./SensorTimeline";
import BurningCalendar from "../calendar/BurningCalendar";
import HistoricalAnomalies from "./HistoricalAnomalies";

import "./AnalyticsPages.css";
import "./FireCalendarPolish.css";

const COLORS = ["#f97352", "#4f83cc"];

const MONTH_NAMES = [
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

/* =========================================
   GENERAL HELPERS
========================================= */

function formatNumber(value, decimals = 1) {
  if (value == null || !Number.isFinite(Number(value))) {
    return "—";
  }

  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: decimals,
  });
}

function dateOf(fire) {
  return String(
    fire.date || fire.acq_date || ""
  ).slice(0, 10);
}

function sensorOf(fire) {
  const sensor = String(
    fire.sensor ||
    fire.instrument ||
    fire.satellite ||
    ""
  ).toUpperCase();

  if (
    sensor.includes("MODIS") ||
    sensor.includes("TERRA") ||
    sensor.includes("AQUA") ||
    sensor === "T" ||
    sensor === "A"
  ) {
    return "MODIS";
  }

  if (
    sensor.includes("VIIRS") ||
    sensor.includes("SNPP") ||
    sensor.includes("S-NPP") ||
    sensor.includes("NOAA") ||
    sensor === "N"
  ) {
    return "VIIRS";
  }

  return "Unknown";
}

function getContribution(row) {
  if (
    row.viirsPresent !== null &&
    row.viirsPresent !== undefined &&
    row.viirsPresent !== ""
  ) {
    const observed = Number(row.viirsPresent);

    if (observed === 0 || observed === 1) {
      return {
        value: observed,
        source: "observed",
      };
    }
  }

  if (
    row.probability !== null &&
    row.probability !== undefined &&
    row.probability !== ""
  ) {
    const probability = Number(row.probability);

    if (
      Number.isFinite(probability) &&
      probability >= 0 &&
      probability <= 1
    ) {
      return {
        value: probability,
        source: "estimated",
      };
    }
  }

  return null;
}

function downloadCSV(filename, headers, rows) {
  const escapeCSV = (value) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const csv = [
    headers.map(escapeCSV).join(","),
    ...rows.map((row) =>
      row.map(escapeCSV).join(",")
    ),
  ].join("\r\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function median(values) {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/* =========================================
   RAW ANALYTICS
========================================= */

function buildRawAnalytics(fires) {
  const months = new Map();
  const days = new Map();
  const years = new Map();
  const cells = new Set();

  let modis = 0;
  let viirs = 0;
  let total = 0;

  for (const fire of fires) {
    const date = dateOf(fire);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      continue;
    }

    total++;

    const sensor = sensorOf(fire);

    if (sensor === "MODIS") modis++;
    if (sensor === "VIIRS") viirs++;

    const month = date.slice(0, 7);
    const year = date.slice(0, 4);

    if (!months.has(month)) {
      months.set(month, {
        month,
        total: 0,
        modis: 0,
        viirs: 0,
        observed: 0,
        estimated: 0,
      });
    }

    const item = months.get(month);

    item.total++;

    if (sensor === "MODIS") item.modis++;
    if (sensor === "VIIRS") item.viirs++;

    days.set(date, (days.get(date) || 0) + 1);
    years.set(year, (years.get(year) || 0) + 1);

    const lat = Number(fire.latitude);
    const lon = Number(fire.longitude);

    if (
      fire.latitude != null &&
      fire.longitude != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lon)
    ) {
      const latCell = Math.floor(lat / 0.09);
      const lonCell = Math.floor(
        lon /
          (0.09 /
            Math.max(
              0.2,
              Math.cos((lat * Math.PI) / 180)
            ))
      );

      cells.add(`${latCell}:${lonCell}`);
    }
  }

  const monthly = [...months.values()].sort(
    (a, b) => a.month.localeCompare(b.month)
  );

  const annual = [...years.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, value]) => ({
      year,
      total: value,
    }));

  const peak = monthly.reduce(
    (best, item) =>
      !best || item.total > best.total
        ? item
        : best,
    null
  );

  return {
    monthly,
    annual,
    days,
    modis,
    viirs,
    observed: 0,
    estimated: 0,
    total,
    activeCells: cells.size,
    peak,
    missingRows: 0,
    observedRows: 0,
    estimatedRows: 0,
  };
}

/* =========================================
   HARMONIZED ANALYTICS
========================================= */

function buildHarmonizedAnalytics(records) {
  const months = new Map();
  const days = new Map();
  const years = new Map();
  const cells = new Set();

  let total = 0;
  let modis = 0;
  let observed = 0;
  let estimated = 0;

  let missingRows = 0;
  let observedRows = 0;
  let estimatedRows = 0;

  for (const row of records) {
    const date = String(row.date || "").slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      continue;
    }

    const month = date.slice(0, 7);
    const year = date.slice(0, 4);

    if (!months.has(month)) {
      months.set(month, {
        month,
        total: 0,
        modis: 0,
        viirs: 0,
        observed: 0,
        estimated: 0,
        observedRows: 0,
        estimatedRows: 0,
        missingRows: 0,
      });
    }

    const item = months.get(month);

    const modisCount = Number(row.modisCount);

    if (
      row.modisCount != null &&
      row.modisCount !== "" &&
      Number.isFinite(modisCount) &&
      modisCount >= 0
    ) {
      modis += modisCount;
      item.modis += modisCount;
    }

    const contribution = getContribution(row);

    if (!contribution) {
      missingRows++;
      item.missingRows++;
      continue;
    }

    const value = contribution.value;

    total += value;
    item.total += value;

    days.set(
      date,
      (days.get(date) || 0) + value
    );

    years.set(
      year,
      (years.get(year) || 0) + value
    );

    if (row.cellId != null) {
      cells.add(row.cellId);
    }

    if (contribution.source === "observed") {
      observed += value;
      observedRows++;

      item.observed += value;
      item.viirs += value;
      item.observedRows++;
    } else {
      estimated += value;
      estimatedRows++;

      item.estimated += value;
      item.estimatedRows++;
    }
  }

  const monthly = [...months.values()].sort(
    (a, b) => a.month.localeCompare(b.month)
  );

  const annual = [...years.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, value]) => ({
      year,
      total: value,
    }));

  const peak = monthly.reduce(
    (best, item) =>
      !best || item.total > best.total
        ? item
        : best,
    null
  );

  return {
    monthly,
    annual,
    days,
    modis,
    viirs: observed,
    observed,
    estimated,
    total,
    activeCells: cells.size,
    peak,
    missingRows,
    observedRows,
    estimatedRows,
  };
}

/* =========================================
   REUSABLE COMPONENTS
========================================= */

function StatCard({
  icon: Icon,
  label,
  value,
  note,
}) {
  return (
    <div className="analytics-stat-card">
      <div className="analytics-stat-icon">
        <Icon size={19} />
      </div>

      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function ChartPanel({
  title,
  subtitle,
  children,
}) {
  return (
    <section className="analytics-panel">
      <div className="analytics-panel-header">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>

      {children}
    </section>
  );
}

function EmptyState({ message }) {
  return (
    <div
      style={{
        padding: 35,
        textAlign: "center",
        color: "#64748b",
      }}
    >
      {message}
    </div>
  );
}

/* =========================================
   STATISTICS PAGE
========================================= */

function StatisticsPage({
  stats,
  harmonized,
  onOpenMonth,
}) {
  const [selectedYear, setSelectedYear] =
    useState(null);

  const selectedAnnual = stats.annual.find(
    (item) => item.year === selectedYear
  );

  const pieData = harmonized
    ? [
        {
          name: "Observed VIIRS",
          value: stats.observed,
        },
        {
          name: "Estimated VIIRS",
          value: stats.estimated,
        },
      ]
    : [
        {
          name: "MODIS",
          value: stats.modis,
        },
        {
          name: "VIIRS",
          value: stats.viirs,
        },
      ];

  const pieTotal = pieData.reduce(
    (sum, item) => sum + item.value,
    0
  );

  return (
    <>
      <div className="analytics-stats-grid">
        <StatCard
          icon={Flame}
          label={
            harmonized
              ? "Harmonized activity"
              : "Total hotspots"
          }
          value={formatNumber(
            stats.total,
            harmonized ? 1 : 0
          )}
          note={
            harmonized
              ? "Expected positive VIIRS cell-days"
              : "Raw satellite detections"
          }
        />

        <StatCard
          icon={TrendingUp}
          label="Peak month"
          value={stats.peak?.month || "—"}
          note={
            stats.peak
              ? `${formatNumber(stats.peak.total)} activity`
              : "No available activity"
          }
        />

        <StatCard
          icon={MapPinned}
          label="Grid cells represented"
          value={formatNumber(
            stats.activeCells,
            0
          )}
          note={
            harmonized
              ? "Candidate cells with usable records"
              : "Approximate spatial coverage"
          }
        />

        <StatCard
          icon={Activity}
          label="Active days"
          value={formatNumber(
            [...stats.days.values()].filter(
              (value) => value > 0
            ).length,
            0
          )}
          note="Dates with positive activity"
        />
      </div>

      <div className="analytics-main-grid">
        <ChartPanel
          title="Monthly burning activity"
          subtitle="Click a bar to explore its calendar month"
        >
          <div
            className="analytics-chart"
            style={{ height: 300 }}
          >
            {stats.monthly.length ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <BarChart
                  data={stats.monthly}
                  margin={{
                    top: 10,
                    right: 12,
                    left: 0,
                    bottom: 30,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 4"
                    vertical={false}
                    stroke="#e9eef3"
                  />

                  <XAxis
                    dataKey="month"
                    angle={-35}
                    textAnchor="end"
                    height={65}
                    tick={{ fontSize: 11 }}
                  />

                  <YAxis />

                  <Tooltip
                    formatter={(value) =>
                      formatNumber(value)
                    }
                  />

                  {harmonized ? (
                    <Legend />
                  ) : null}

                  {harmonized ? (
                    <>
                      <Bar
                        dataKey="observed"
                        name="Observed VIIRS"
                        stackId="activity"
                        fill="#f97352"
                        onClick={(entry) =>
                          onOpenMonth(entry.month)
                        }
                        cursor="pointer"
                      />

                      <Bar
                        dataKey="estimated"
                        name="Estimated VIIRS"
                        stackId="activity"
                        fill="#4f83cc"
                        onClick={(entry) =>
                          onOpenMonth(entry.month)
                        }
                        cursor="pointer"
                      />
                    </>
                  ) : (
                    <Bar
                      dataKey="total"
                      name="Hotspots"
                      fill="#f97352"
                      radius={[4, 4, 0, 0]}
                      onClick={(entry) =>
                        onOpenMonth(entry.month)
                      }
                      cursor="pointer"
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No monthly data available" />
            )}
          </div>
        </ChartPanel>

        <ChartPanel
          title={
            harmonized
              ? "Observed vs reconstructed"
              : "Sensor contribution"
          }
          subtitle={
            harmonized
              ? "Activity from actual VIIRS observations and logarithmic estimates"
              : "Share of imported MODIS and VIIRS detections"
          }
        >
          <div className="analytics-donut">
            {pieTotal > 0 ? (
              <ResponsiveContainer
                width="100%"
                height={230}
              >
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={62}
                    outerRadius={90}
                    paddingAngle={3}
                  >
                    {pieData.map(
                      (item, index) => (
                        <Cell
                          key={item.name}
                          fill={COLORS[index]}
                        />
                      )
                    )}
                  </Pie>

                  <Tooltip
                    formatter={(value) =>
                      formatNumber(value)
                    }
                  />

                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No activity available" />
            )}
          </div>
        </ChartPanel>
      </div>

      <ChartPanel
        title="Annual burning activity"
        subtitle="Click a year to inspect its monthly activity"
      >
        <div
          className="analytics-chart"
          style={{ height: 320 }}
        >
          {stats.annual.length ? (
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <LineChart data={stats.annual}>
                <CartesianGrid
                  strokeDasharray="3 4"
                  vertical={false}
                  stroke="#e9eef3"
                />

                <XAxis dataKey="year" />
                <YAxis />

                <Tooltip
                  formatter={(value) =>
                    formatNumber(value)
                  }
                />

                <Line
                  type="monotone"
                  dataKey="total"
                  name={
                    harmonized
                      ? "Expected positive cell-days"
                      : "Hotspots"
                  }
                  stroke="#f97352"
                  strokeWidth={3}
                  dot={{
                    r: 5,
                    cursor: "pointer",
                  }}
                  activeDot={{
                    r: 8,
                    onClick: (_event, payload) => {
                      const year =
                        payload?.payload?.year;

                      if (year) {
                        setSelectedYear(year);
                      }
                    },
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No annual data available" />
          )}
        </div>

        {selectedAnnual && (
          <div
            style={{
              marginTop: 12,
              padding: 14,
              background: "#fff7ed",
              borderRadius: 10,
            }}
          >
            <strong>
              {selectedAnnual.year}:{" "}
              {formatNumber(selectedAnnual.total)}
            </strong>

            <p>
              Total activity recorded for this
              year within the selected data.
            </p>

            <button
              type="button"
              onClick={() => {
                const firstMonth =
                  stats.monthly.find(
                    (item) =>
                      item.month.startsWith(
                        `${selectedAnnual.year}-`
                      )
                  );

                if (firstMonth) {
                  onOpenMonth(firstMonth.month);
                }
              }}
              style={{
                padding: "9px 14px",
                background: "#f97352",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Explore year
            </button>
          </div>
        )}
      </ChartPanel>

      {harmonized && (
        <ChartPanel
          title="Data quality"
          subtitle="Observed, reconstructed, and missing cell-day records"
        >
          <div className="analytics-stats-grid">
            <StatCard
              icon={Layers}
              label="Observed records"
              value={formatNumber(
                stats.observedRows,
                0
              )}
              note="VIIRS presence is known"
            />

            <StatCard
              icon={TrendingUp}
              label="Estimated records"
              value={formatNumber(
                stats.estimatedRows,
                0
              )}
              note="VIIRS presence reconstructed"
            />

            <StatCard
              icon={Activity}
              label="Missing records"
              value={formatNumber(
                stats.missingRows,
                0
              )}
              note="No valid observation or prediction"
            />
          </div>
        </ChartPanel>
      )}
    </>
  );
}

/* =========================================
   FIRE CALENDAR
========================================= */

function CalendarPage({ stats, harmonized, initialMonth = "" }) {
  const availableMonths = useMemo(
    () => stats.monthly.map((item) => item.month).sort(),
    [stats.monthly]
  );
  const [chosenMonth, setChosenMonth] = useState(initialMonth);
  const [selectedDate, setSelectedDate] = useState(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [baselineYears, setBaselineYears] = useState(10);
  const [showYearHeatmap, setShowYearHeatmap] = useState(false);

  const currentMonth = availableMonths.includes(chosenMonth)
    ? chosenMonth
    : availableMonths.at(-1) || "";
  const [year, month] = currentMonth
    ? currentMonth.split("-").map(Number)
    : [0, 0];
  const monthLabel = currentMonth
    ? `${MONTH_NAMES[month - 1]} ${year}`
    : "";
  const monthIndex = availableMonths.indexOf(currentMonth);

  const chooseMonth = (key) => {
    setChosenMonth(key);
    setSelectedDate(null);
    setSearch("");
    setSearchOpen(false);
  };
  const moveMonth = (direction) => {
    const next = monthIndex + direction;
    if (next >= 0 && next < availableMonths.length) {
      chooseMonth(availableMonths[next]);
    }
  };
  const matches = useMemo(() => {
    const query = search.trim().toLowerCase().replace(/\s+/g, " ");
    if (!query) return availableMonths.slice(-12).reverse();
    return availableMonths.filter((key) => {
      const [y, m] = key.split("-").map(Number);
      const label = `${MONTH_NAMES[m - 1]} ${y}`.toLowerCase();
      const short = `${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`.toLowerCase();
      return label.includes(query) || short.includes(query) || key.includes(query);
    }).reverse().slice(0, 40);
  }, [availableMonths, search]);

  const daily = useMemo(() => {
    if (!currentMonth) return [];
    const daysInMonth = new Date(year, month, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const date = `${currentMonth}-${String(day).padStart(2, "0")}`;
      return { day, date, count: stats.days.get(date) || 0 };
    });
  }, [currentMonth, year, month, stats.days]);

  const monthStats = stats.monthly.find((item) => item.month === currentMonth);
  const monthlyTotal = monthStats?.total || 0;
  const activeDays = daily.filter((item) => item.count > 0).length;
  const peakDay = daily.reduce(
    (best, item) => (!best || item.count > best.count ? item : best),
    null
  );
  const selectedDay = selectedDate?.startsWith(`${currentMonth}-`)
    ? Number(selectedDate.slice(-2))
    : null;
  const selectedCount = selectedDay ? stats.days.get(selectedDate) || 0 : 0;

  // Compare the same calendar month against earlier years only.
  // Missing months are NOT treated as zero activity.
  const historical = useMemo(() => {
    if (!currentMonth) return { median: null, samples: [], deviation: null };
    const samples = stats.monthly
      .filter((item) => {
        const [y, m] = item.month.split("-").map(Number);
        return m === month && y < year && y >= year - baselineYears;
      })
      .map((item) => ({ year: Number(item.month.slice(0, 4)), value: item.total }))
      .sort((a, b) => a.year - b.year);
    const baseline = median(samples.map((item) => item.value));
    return {
      median: baseline,
      samples,
      deviation: baseline != null && baseline > 0
        ? ((monthlyTotal - baseline) / baseline) * 100
        : null,
    };
  }, [stats.monthly, currentMonth, year, month, baselineYears, monthlyTotal]);

  const yearRows = useMemo(() => {
    const years = [...new Set(availableMonths.map((key) => Number(key.slice(0, 4))))].sort((a, b) => b - a);
    const byMonth = new Map(stats.monthly.map((item) => [item.month, item.total]));
    const max = Math.max(0, ...stats.monthly.map((item) => item.total));
    return years.map((y) => ({
      year: y,
      months: Array.from({ length: 12 }, (_, i) => {
        const key = `${y}-${String(i + 1).padStart(2, "0")}`;
        return { key, value: byMonth.get(key), level: max ? (byMonth.get(key) || 0) / max : 0 };
      }),
    }));
  }, [availableMonths, stats.monthly]);

  const unit = harmonized ? "expected VIIRS-positive cell-days" : "satellite hotspot detections";

  return (
    <div className="fire-calendar-page">
      <div className="fire-calendar-heading fire-calendar-heading-updated">
        <div>
          <span className="fire-calendar-eyebrow">MONTHLY EXPLORER</span>
          <p>{harmonized
            ? "Explore observed and reconstructed activity and compare it with historical patterns."
            : "Explore NASA FIRMS hotspot detections across months and years."}</p>
        </div>
        <div className="fl-month-navigation">
          <button type="button" className="fl-month-arrow" onClick={() => moveMonth(-1)}
            disabled={monthIndex <= 0} aria-label="Previous available month" title="Previous available month">
            <ChevronLeft size={19} />
          </button>
          <div className="fl-month-search">
            <Search size={17} aria-hidden="true" />
            <input value={search} placeholder={monthLabel || "Search month or year"}
              aria-label="Search month or year" onFocus={() => setSearchOpen(true)}
              onChange={(event) => { setSearch(event.target.value); setSearchOpen(true); }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearchOpen(false);
                if (event.key === "Enter" && matches.length) chooseMonth(matches[0]);
              }} />
            {searchOpen && (
              <div className="fl-month-results">
                <div className="fl-month-results-heading">
                  <span>Available months</span>
                  <button type="button" onClick={() => setSearchOpen(false)}>Close</button>
                </div>
                {matches.length ? matches.map((key) => {
                  const [y, m] = key.split("-").map(Number);
                  return <button type="button" key={key} className={key === currentMonth ? "active" : ""}
                    onClick={() => chooseMonth(key)}>{MONTH_NAMES[m - 1]} {y}</button>;
                }) : <p className="fl-no-matches">No matching month in the current data.</p>}
              </div>
            )}
          </div>
          <button type="button" className="fl-month-arrow" onClick={() => moveMonth(1)}
            disabled={monthIndex < 0 || monthIndex >= availableMonths.length - 1}
            aria-label="Next available month" title="Next available month">
            <ChevronRight size={19} />
          </button>
        </div>
      </div>

      {currentMonth ? (
        <>
          <div className="fl-calendar-toolbar">
            <div className="fl-view-switch">
              <button type="button" className={!showYearHeatmap ? "active" : ""} onClick={() => setShowYearHeatmap(false)}>Daily calendar</button>
              <button type="button" className={showYearHeatmap ? "active" : ""} onClick={() => setShowYearHeatmap(true)}>Year heatmap</button>
            </div>
            <label className="fl-baseline-control">Historical baseline
              <select value={baselineYears} onChange={(event) => setBaselineYears(Number(event.target.value))}>
                {[5, 10, 15, 20].map((n) => <option key={n} value={n}>Previous {n} years</option>)}
              </select>
            </label>
          </div>

          <div className="fire-calendar-stats fl-calendar-stats">
            <div className="fire-calendar-stat"><span>Monthly activity</span><strong>{formatNumber(monthlyTotal, harmonized ? 1 : 0)}</strong><small>{monthLabel} · {unit}</small></div>
            <div className="fire-calendar-stat"><span>Historical median</span><strong>{historical.median == null ? "—" : formatNumber(historical.median, harmonized ? 1 : 0)}</strong><small>{historical.samples.length} prior {MONTH_NAMES[month - 1]} observations</small></div>
            <div className="fire-calendar-stat"><span>Deviation vs median</span><strong className={historical.deviation == null ? "" : historical.deviation > 0 ? "fl-positive" : "fl-negative"}>{historical.deviation == null ? "—" : `${historical.deviation > 0 ? "+" : ""}${historical.deviation.toFixed(1)}%`}</strong><small>{historical.median === 0 ? "Median is zero; % unavailable" : historical.samples.length < 5 ? "Limited baseline — interpret cautiously" : "Relative to prior same-month median"}</small></div>
            <div className="fire-calendar-stat"><span>Active days</span><strong>{activeDays}</strong><small>Days with positive activity</small></div>
            <div className="fire-calendar-stat"><span>Peak day</span><strong>{peakDay?.count > 0 ? `${MONTH_NAMES[month - 1].slice(0, 3)} ${peakDay.day}` : "—"}</strong><small>{peakDay?.count > 0 ? `${formatNumber(peakDay.count, harmonized ? 1 : 0)} ${unit}` : "No positive activity"}</small></div>
          </div>

          {showYearHeatmap ? (
            <section className="fire-calendar-card fl-heatmap-card">
              <h3>Monthly activity across years</h3>
              <p>Click a month to open its daily calendar. Blank cells indicate no records in the current selection, not necessarily zero fires.</p>
              <div className="fl-heatmap-scroll"><div className="fl-heatmap-grid">
                <span className="fl-heatmap-year-label">Year</span>
                {MONTH_NAMES.map((name) => <span className="fl-heatmap-label" key={name}>{name.slice(0, 3)}</span>)}
                {yearRows.map((row) => (
                  <div className="fl-heatmap-row" key={row.year}>
                    <strong className="fl-heatmap-year-label">{row.year}</strong>
                    {row.months.map((cell) => (
                      <button type="button" key={cell.key} disabled={cell.value === undefined}
                        className={`fl-heatmap-cell ${cell.key === currentMonth ? "selected" : ""}`}
                        style={{ background: cell.value === undefined ? "#f1f3f6" : `rgba(244, 119, 53, ${0.14 + cell.level * 0.86})` }}
                        title={cell.value === undefined ? `${cell.key}: no records` : `${cell.key}: ${formatNumber(cell.value)}`}
                        onClick={() => { chooseMonth(cell.key); setShowYearHeatmap(false); }}>
                        {cell.value === undefined ? "·" : formatNumber(cell.value, 0)}
                      </button>
                    ))}
                  </div>
                ))}
              </div></div>
            </section>
          ) : (
            <div className="fire-calendar-layout">
              <section className="fire-calendar-card">
                <div className="fire-calendar-card-header"><div><h3>{monthLabel}</h3><p>Select a day to explore burning activity</p></div></div>
                <BurningCalendar daily={daily} year={year} month={month} selectedDay={selectedDay}
                  unit={harmonized ? "expected positive cell-days" : "hotspot detections"}
                  onSelectDay={(day) => setSelectedDate(`${currentMonth}-${String(day).padStart(2, "0")}`)} />
              </section>
              <aside className="fire-calendar-details fl-summary-v2">
                <div className="fl-summary-v2-top">
                  <span className="fire-calendar-details-label">{selectedDay ? "SELECTED DAY" : "MONTH SUMMARY"}</span>
                  <span className="fl-summary-v2-chip">{harmonized ? "Harmonized" : "NASA FIRMS"}</span>
                </div>
                <h3>{selectedDay ? new Date(year, month - 1, selectedDay).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : monthLabel}</h3>
                <div className="fl-summary-v2-total">
                  <strong>{formatNumber(selectedDay ? selectedCount : monthlyTotal, harmonized ? 1 : 0)}</strong>
                  <span>{unit}</span>
                </div>
                <div className="fl-summary-v2-metrics">
                  <div className="fire-calendar-details-row"><span>{selectedDay ? "Monthly contribution" : "Active days"}</span><strong>{selectedDay ? `${monthlyTotal > 0 ? ((selectedCount / monthlyTotal) * 100).toFixed(1) : "0.0"}%` : `${activeDays} days`}</strong></div>
                  {harmonized && <div className="fire-calendar-details-row"><span>Observed activity</span><strong>{formatNumber(monthStats?.observed ?? 0)}</strong></div>}
                  {harmonized && <div className="fire-calendar-details-row"><span>Estimated activity</span><strong>{formatNumber(monthStats?.estimated ?? 0)}</strong></div>}
                  {harmonized && <div className="fire-calendar-details-row"><span>Missing cell-day records</span><strong>{formatNumber(monthStats?.missingRows ?? 0, 0)}</strong></div>}
                  <div className="fire-calendar-details-row"><span>Source</span><strong>{harmonized ? "Observed + estimated" : "NASA FIRMS"}</strong></div>
                </div>
                {selectedDay && <button className="fl-clear-day" type="button" onClick={() => setSelectedDate(null)}>Back to month summary</button>}
                <p className="fire-calendar-footnote">{harmonized
                  ? "Estimates use logarithmic reconstruction, not a trained AI model. Values are expected VIIRS-positive cell-days, not individual fires or burned area."
                  : "Hotspot detections do not directly represent individual fires or burned area."}</p>
              </aside>
            </div>
          )}

          <section className="fl-history-panel fl-history-v2">
            <div className="fl-history-v2-heading">
              <div>
                <span className="fl-history-v2-eyebrow">HISTORICAL COMPARISON</span>
                <h3>{MONTH_NAMES[month - 1]} across previous years</h3>
                <p>Compare the selected month with available earlier years.</p>
              </div>
              <span className="fl-history-v2-count">{historical.samples.length} prior {historical.samples.length === 1 ? "year" : "years"}</span>
            </div>
            {historical.samples.length ? (
              <>
                <div className="fl-history-v2-insights">
                  <div><span>Historical median</span><strong>{formatNumber(historical.median, harmonized ? 1 : 0)}</strong></div>
                  <div><span>{monthLabel}</span><strong>{formatNumber(monthlyTotal, harmonized ? 1 : 0)}</strong></div>
                  <div><span>Deviation</span><strong>{historical.deviation == null ? "—" : `${historical.deviation > 0 ? "+" : ""}${historical.deviation.toFixed(1)}%`}</strong></div>
                </div>
                <div className="fl-history-bars">
                  {[...historical.samples, { year, value: monthlyTotal, current: true }].map((item) => {
                    const maximum = Math.max(1, monthlyTotal, ...historical.samples.map((s) => s.value));
                    return <div className={`fl-history-bar-row ${item.current ? "current" : ""}`} key={item.year}>
                      <span>{item.year}</span>
                      <div className="fl-history-track"><div style={{ width: `${(item.value / maximum) * 100}%` }} /></div>
                      <strong>{formatNumber(item.value, harmonized ? 1 : 0)}</strong>
                    </div>;
                  })}
                </div>
                <p className="fl-history-note">Median based on {historical.samples.length} available earlier {MONTH_NAMES[month - 1]} observations within the selected baseline window.</p>
              </>
            ) : (
              <div className="fl-history-v2-empty">
                <CalendarDays size={22} />
                <strong>No historical comparison available</strong>
                <p>No earlier {MONTH_NAMES[month - 1]} records exist in the currently filtered dataset. Widen the date range to calculate a historical baseline.</p>
              </div>
            )}
            <p className="fl-history-note fl-history-v2-caution">Comparisons are exploratory: sensor coverage, candidate-cell sampling, and reconstructed estimates can affect apparent trends.</p>
          </section>
        </>
      ) : <div className="fire-calendar-empty">No fire activity records are available for this date range.</div>}
    </div>
  );
}

/* =========================================
   SENSOR COMPARISON
========================================= */

function ComparisonPage({
  stats,
  fires,
  harmonized,
}) {
  const [search, setSearch] =
    useState("");

  const [sortBy, setSortBy] =
    useState("month");

  const [sortDirection, setSortDirection] =
    useState("asc");

  const [copied, setCopied] =
    useState(false);

  const rows = useMemo(() => {
    return stats.monthly.map((item) => ({
      ...item,
      difference:
        item.viirs - item.modis,
      ratio:
        item.modis > 0
          ? item.viirs / item.modis
          : null,
    }));
  }, [stats.monthly]);

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) =>
      row.month
        .toLowerCase()
        .includes(search.toLowerCase())
    );

    return [...filtered].sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];

      let result = 0;

      if (sortBy === "month") {
        result = aValue.localeCompare(bValue);
      } else if (aValue == null) {
        result = bValue == null ? 0 : 1;
      } else if (bValue == null) {
        result = -1;
      } else {
        result = aValue - bValue;
      }

      return sortDirection === "asc"
        ? result
        : -result;
    });
  }, [
    rows,
    search,
    sortBy,
    sortDirection,
  ]);

  const columns = harmonized
    ? [
        ["month", "Month"],
        ["modis", "MODIS rows"],
        ["observed", "Observed VIIRS"],
        ["estimated", "Estimated VIIRS"],
        ["total", "Harmonized activity"],
      ]
    : [
        ["month", "Month"],
        ["modis", "MODIS raw"],
        ["viirs", "VIIRS raw"],
        ["difference", "Difference"],
        ["ratio", "VIIRS / MODIS"],
      ];

  const csvRows = visibleRows.map((row) =>
    columns.map(([key]) => row[key])
  );

  const csvHeaders = columns.map(
    ([, label]) => label
  );

  const csvText = [
    csvHeaders.join(","),
    ...csvRows.map((row) =>
      row.map((value) =>
        `"${String(value ?? "").replace(/"/g, '""')}"`
      ).join(",")
    ),
  ].join("\r\n");

  async function copyCSV() {
    try {
      await navigator.clipboard.writeText(
        csvText
      );

      setCopied(true);
    } catch (error) {
      console.error(
        "CSV copy failed:",
        error
      );
    }
  }

  function changeSort(column) {
    if (sortBy === column) {
      setSortDirection((previous) =>
        previous === "asc"
          ? "desc"
          : "asc"
      );
    } else {
      setSortBy(column);
      setSortDirection(
        column === "month"
          ? "asc"
          : "desc"
      );
    }
  }

  return (
    <div className="sensor-comparison-page">
      <div className="analytics-stats-grid">
        <StatCard
          icon={Flame}
          label={
            harmonized
              ? "MODIS candidate rows"
              : "MODIS detections"
          }
          value={formatNumber(
            stats.modis,
            0
          )}
          note={
            harmonized
              ? "MODIS rows in candidate cells"
              : "Raw observations"
          }
        />

        <StatCard
          icon={Layers}
          label={
            harmonized
              ? "Observed VIIRS activity"
              : "VIIRS detections"
          }
          value={formatNumber(
            stats.viirs,
            0
          )}
          note={
            harmonized
              ? "Observed positive cell-days"
              : "Raw observations"
          }
        />

        <StatCard
          icon={Activity}
          label={
            harmonized
              ? "Estimated VIIRS activity"
              : "VIIRS / MODIS ratio"
          }
          value={
            harmonized
              ? formatNumber(
                  stats.estimated
                )
              : stats.modis > 0
                ? `${(
                    stats.viirs /
                    stats.modis
                  ).toFixed(2)}×`
                : "—"
          }
          note={
            harmonized
              ? "Model-estimated positive cell-days"
              : "Descriptive raw detection ratio"
          }
        />
      </div>

      {!harmonized && (
        <SensorTimeline
          monthly={stats.monthly}
          fires={fires}
        />
      )}

      {harmonized && (
        <ChartPanel
          title="MODIS and VIIRS activity"
          subtitle="MODIS candidate rows and VIIRS-positive cell-days have different units; compare patterns, not absolute magnitudes"
        >
          <div
            className="analytics-chart"
            style={{ height: 320 }}
          >
            {stats.monthly.length ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <LineChart
                  data={stats.monthly}
                >
                  <CartesianGrid
                    strokeDasharray="3 4"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10 }}
                  />

                  <YAxis />
                  <Tooltip />
                  <Legend />

                  <Line
                    dataKey="modis"
                    name="MODIS rows"
                    stroke="#f97352"
                    strokeWidth={2}
                    dot={false}
                  />

                  <Line
                    dataKey="observed"
                    name="Observed VIIRS cell-days"
                    stroke="#4f83cc"
                    strokeWidth={2}
                    dot={false}
                  />

                  <Line
                    dataKey="estimated"
                    name="Estimated VIIRS cell-days"
                    stroke="#16a34a"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No comparison data available" />
            )}
          </div>
        </ChartPanel>
      )}

      <section className="analytics-panel comparison-table-panel">
        <div className="analytics-table-heading">
          <div>
            <h3>
              Monthly sensor comparison
            </h3>

            <p>
              Explore monthly values and
              export your results.
            </p>
          </div>

          <div className="analytics-actions">
            <button
              type="button"
              onClick={copyCSV}
            >
              <Copy size={15} />
              {copied
                ? "Copied!"
                : "Copy CSV"}
            </button>

            <button
              type="button"
              onClick={() =>
                downloadCSV(
                  "firelens-sensor-comparison.csv",
                  csvHeaders,
                  csvRows
                )
              }
            >
              <Download size={15} />
              Download CSV
            </button>
          </div>
        </div>

        <div className="comparison-toolbar">
          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search month, e.g. 2023-08"
            aria-label="Search months"
          />

          <span>
            {visibleRows.length} months
          </span>
        </div>

        <div className="analytics-table-scroll">
          <table className="analytics-table comparison-table">
            <thead>
              <tr>
                {columns.map(
                  ([key, label]) => (
                    <th key={key}>
                      <button
                        type="button"
                        className="comparison-sort-button"
                        onClick={() =>
                          changeSort(key)
                        }
                      >
                        {label}

                        {sortBy === key
                          ? sortDirection === "asc"
                            ? " ↑"
                            : " ↓"
                          : ""}
                      </button>
                    </th>
                  )
                )}
              </tr>
            </thead>

            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.month}>
                  {columns.map(([key]) => (
                    <td key={key}>
                      {key === "month"
                        ? row.month
                        : key === "ratio"
                          ? row.ratio == null
                            ? "—"
                            : `${row.ratio.toFixed(2)}×`
                          : formatNumber(
                              row[key],
                              harmonized ? 1 : 0
                            )}
                    </td>
                  ))}
                </tr>
              ))}

              {!visibleRows.length && (
                <tr>
                  <td
                    colSpan={columns.length}
                  >
                    No matching observations.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="analytics-note">
          {harmonized
            ? "MODIS rows, observed VIIRS-positive cell-days, and estimated VIIRS-positive cell-days are different quantities. They must not be interpreted as equivalent raw detection counts."
            : "Raw MODIS and VIIRS detection counts differ because of spatial resolution, sensitivity, and observation timing. Their ratio is not a validated calibration factor."}
        </p>
      </section>
    </div>
  );
}

/* =========================================
   MAIN ANALYTICS COMPONENT
========================================= */

export default function AnalyticsPages({
  page = "statistics",
  fires = [],
  harmonizedRecords = [],
  dataMode = "raw",
  onBack,
}) {
  const harmonized =
    dataMode === "harmonized";

  const [calendarMonth, setCalendarMonth] =
    useState("");

  const [calendarVersion, setCalendarVersion] =
    useState(0);

  const [internalPage, setInternalPage] =
    useState(null);

  const currentPage =
    internalPage || page;

  const stats = useMemo(() => {
    return harmonized
      ? buildHarmonizedAnalytics(
          harmonizedRecords
        )
      : buildRawAnalytics(fires);
  }, [
    harmonized,
    harmonizedRecords,
    fires,
  ]);

  const titles = {
    statistics: "Fire Statistics",
    historical: "Fire Activity Calendar",
    sensors: "Sensor Comparison",
    anomalies: "Historical Anomalies",
  };

  function openMonth(month) {
    setCalendarMonth(month);
    setCalendarVersion(
      (previous) => previous + 1
    );
    setInternalPage("historical");
  }

  function handleBack() {
    setInternalPage(null);
    onBack?.();
  }

  return (
    <div className="analytics-page">
      <div className="analytics-page-header">
        <div>
          <span className="analytics-eyebrow">
            FIRELENS INTELLIGENCE
          </span>

          <h1>
            {titles[currentPage] ||
              "Analytics"}
          </h1>

          <p>
            {harmonized
              ? "Explore observed and reconstructed wildfire activity using harmonized MODIS–VIIRS data."
              : "Explore wildfire detections using imported NASA FIRMS observations."}
          </p>
        </div>

        <button
          className="analytics-back"
          type="button"
          onClick={handleBack}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            background: "#f47735",
            color: "#ffffff",
            border: "none",
            borderRadius: 14,
            padding: "15px 22px",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <ArrowLeft
            size={20}
            strokeWidth={2.5}
          />

          Back to Map
        </button>
      </div>

      {currentPage === "statistics" && (
        <StatisticsPage
          stats={stats}
          harmonized={harmonized}
          onOpenMonth={openMonth}
        />
      )}

      {currentPage === "historical" && (
        <CalendarPage
          key={`${calendarMonth}-${calendarVersion}`}
          stats={stats}
          harmonized={harmonized}
          initialMonth={calendarMonth}
        />
      )}

      {currentPage === "sensors" && (
        <ComparisonPage
          stats={stats}
          fires={fires}
          harmonized={harmonized}
        />
      )}

      {currentPage === "anomalies" && (
        harmonized ? (
          <HistoricalAnomalies
            records={harmonizedRecords}
            onSelectMonth={openMonth}
          />
        ) : (
          <ChartPanel
            title="Harmonized data required"
            subtitle="Switch to Harmonized mode to analyze historical fire anomalies."
          >
            <EmptyState
              message="Historical anomaly detection requires harmonized MODIS–VIIRS records."
            />
          </ChartPanel>
        )
      )}
    </div>
  );
}
