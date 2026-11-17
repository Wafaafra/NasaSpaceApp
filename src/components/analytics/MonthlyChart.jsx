
import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  ErrorBar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function getMonthIndex(value) {
  if (typeof value === "number") {
    if (value >= 1 && value <= 12) return value - 1;
    if (value >= 0 && value <= 11) return value;
    return -1;
  }

  if (typeof value !== "string") return -1;

  const text = value.trim();

  const match = text.match(/^\d{4}-(\d{1,2})/);

  if (match) return Number(match[1]) - 1;

  return MONTHS.findIndex(
    (m) => m.toLowerCase() === text.slice(0, 3).toLowerCase()
  );
}

function percentile(values, p) {
  if (!values.length) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  return sorted[lower] +
    (sorted[upper] - sorted[lower]) * (position - lower);
}

function ChartTooltip({ active, payload, label, detailed }) {
  if (!active || !payload?.length) return null;

  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <div className="firelens-chart-tooltip">
      <strong>{label}</strong>
      <div>
        {detailed ? "Median" : "Detections"}:{" "}
        {Number(item.hotspots).toLocaleString()}
      </div>

      {detailed && item.samples >= 2 && (
        <div>
          25th–75th percentile:{" "}
          {item.low.toFixed(1)} – {item.high.toFixed(1)}
        </div>
      )}
    </div>
  );
}

export default function MonthlyChart({
  data = [],
  variant = "compact",
}) {
  const detailed = variant === "detailed";

  const chartData = useMemo(() => {
    const totals = Array(12).fill(0);
    const yearly = Array.from({ length: 12 }, () => new Map());

    for (const item of Array.isArray(data) ? data : []) {
      const rawMonth = item.month ?? item.date ?? item.name;
      const index = getMonthIndex(rawMonth);

      if (index < 0 || index > 11) continue;

      const count = Number(
        item.count ??
        item.total ??
        item.hotspots ??
        item.detections ??
        item.value ??
        (Number(item.modis || 0) + Number(item.viirs || 0))
      );

      if (!Number.isFinite(count)) continue;

      totals[index] += count;

      // Yearly aggregation is required for percentiles.
      const year = item.year ??
        (typeof rawMonth === "string"
          ? rawMonth.match(/^(\d{4})-/)?.[1]
          : null);

      if (year != null) {
        const key = String(year);
        yearly[index].set(
          key,
          (yearly[index].get(key) || 0) + count
        );
      }
    }

    return MONTHS.map((month, index) => {
      const values = [...yearly[index].values()];
      const hasYears = values.length > 0;

      const low = hasYears ? percentile(values, 0.25) : 0;
      const median = hasYears
        ? percentile(values, 0.5)
        : totals[index];
      const high = hasYears
        ? percentile(values, 0.75)
        : totals[index];

      const hotspots = detailed ? median : totals[index];

      return {
        month,
        hotspots,
        low,
        high,
        samples: values.length,
        error: [
          Math.max(0, hotspots - low),
          Math.max(0, high - hotspots),
        ],
      };
    });
  }, [data, detailed]);

  const total = chartData.reduce(
    (sum, item) => sum + item.hotspots,
    0
  );

  const peak = chartData.reduce(
    (best, item) =>
      item.hotspots > best.hotspots ? item : best,
    chartData[0]
  );

  const hasPercentiles = detailed &&
    chartData.some((item) => item.samples >= 2);

  return (
    <div
      className={`firelens-monthly-chart ${
        detailed ? "firelens-monthly-detailed" : ""
      }`}
    >
      <div className="firelens-chart-header">
        <div className="firelens-chart-legend">
          <span className="firelens-chart-dot" />
          <span>
            {detailed
              ? "Median monthly detections"
              : "Monthly detections"}
          </span>
        </div>

        {total > 0 && (
          <span className="firelens-chart-peak">
            Peak: {peak.month}
          </span>
        )}
      </div>

      {total > 0 ? (
        <div className="firelens-chart-plot">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{
                top: detailed ? 25 : 8,
                right: 8,
                left: detailed ? -8 : -22,
                bottom: 0,
              }}
              barCategoryGap={detailed ? "28%" : "22%"}
            >
              <CartesianGrid
                vertical={false}
                stroke="#e9eef3"
                strokeDasharray="3 4"
              />

              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                interval={0}
                tick={{
                  fill: "#8997a8",
                  fontSize: detailed ? 11 : 9,
                }}
                tickMargin={7}
              />

              <YAxis
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                tick={{
                  fill: "#9ba8b5",
                  fontSize: detailed ? 11 : 9,
                }}
              />

              <Tooltip
                content={
                  <ChartTooltip detailed={detailed} />
                }
                cursor={{
                  fill: "rgba(249,115,82,0.06)",
                }}
              />

              <Bar
                dataKey="hotspots"
                radius={[5, 5, 0, 0]}
                maxBarSize={detailed ? 43 : 21}
                fill="#c65c30"
                animationDuration={500}
              >
                {chartData.map((item) => (
                  <Cell
                    key={item.month}
                    fill={
                      item.month === peak.month
                        ? "#f47735"
                        : detailed
                          ? "#b6532b"
                          : "#f8b39d"
                    }
                  />
                ))}

                {hasPercentiles && (
                  <ErrorBar
                    dataKey="error"
                    width={9}
                    strokeWidth={1.8}
                    stroke="#89949e"
                    direction="y"
                  />
                )}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="firelens-chart-empty">
          No detections in this area
        </div>
      )}

      {detailed && (
        <p className="firelens-chart-note">
          {hasPercentiles
            ? "Bars show median monthly detections. Whiskers show the 25th–75th percentile where multiple years are available."
            : "Import multiple years of monthly observations to calculate interannual percentile ranges."}
        </p>
      )}
    </div>
  );
}
