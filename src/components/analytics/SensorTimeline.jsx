
import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

import "./SensorTimeline.css";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const COLORS = {
  harmonized: "#e8edf2",
  modis: "#22b5d6",
  viirs: "#b27aff",
};

function median(values) {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sensorOf(fire) {
  const value = String(
    fire.sensor || fire.instrument || fire.satellite || ""
  ).toUpperCase();

  if (
    value.includes("MODIS") ||
    value.includes("TERRA") ||
    value.includes("AQUA") ||
    value === "T" ||
    value === "A"
  ) {
    return "MODIS";
  }

  if (
    value.includes("VIIRS") ||
    value.includes("SNPP") ||
    value.includes("S-NPP") ||
    value.includes("NOAA") ||
    value === "N"
  ) {
    return "VIIRS";
  }

  return null;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <div className="st-tooltip">
      <div className="st-tooltip-title">{label}</div>

      {item.harmonized != null && (
        <div className="st-tooltip-row">
          <span>Harmonized</span>
          <b>{Math.round(item.harmonized)}</b>
        </div>
      )}

      {item.low != null && item.high != null && (
        <div className="st-tooltip-row">
          <span>90% interval</span>
          <b>
            {Math.round(item.low)} to {Math.round(item.high)}
          </b>
        </div>
      )}

      <div className="st-tooltip-row">
        <span>
          <i style={{ background: COLORS.modis }} />
          MODIS
        </span>
        <b>{item.modis.toLocaleString()}</b>
      </div>

      <div className="st-tooltip-row">
        <span>
          <i style={{ background: COLORS.viirs }} />
          VIIRS
        </span>
        <b>{item.viirs.toLocaleString()}</b>
      </div>
    </div>
  );
}

export default function SensorTimeline({
  monthly = [],
  fires = [],
  harmonized = [],
}) {
  const [show, setShow] = useState({
    harmonized: true,
    modis: true,
    viirs: true,
  });

  const harmonizedMap = useMemo(
    () => new Map(harmonized.map((item) => [item.month, item])),
    [harmonized]
  );

  const data = useMemo(
    () =>
      monthly.map((item) => {
        const result = harmonizedMap.get(item.month);

        const value = result?.value ?? result?.harmonized ?? null;
        const low = result?.low ?? null;
        const high = result?.high ?? null;

        return {
          month: item.month,
          modis: Number(item.modis) || 0,
          viirs: Number(item.viirs) || 0,
          harmonized: value,
          low,
          high,
          band:
            low != null && high != null && high >= low
              ? [low, high]
              : null,
        };
      }),
    [monthly, harmonizedMap]
  );

  const hasHarmonized = data.some(
    (item) => item.harmonized != null
  );

  const firstViirs = data.find(
    (item) => item.viirs > 0
  )?.month;

  const ratios = MONTHS.map((label, index) => {
    const subset = data.filter(
      (item) => Number(item.month.slice(5, 7)) === index + 1
    );

    const modis = subset.reduce(
      (sum, item) => sum + item.modis,
      0
    );

    const viirs = subset.reduce(
      (sum, item) => sum + item.viirs,
      0
    );

    return {
      label,
      ratio: modis > 0 ? viirs / modis : null,
    };
  });

  const frp = useMemo(() => {
    const values = {
      MODIS: [],
      VIIRS: [],
    };

    for (const fire of fires) {
      const sensor = sensorOf(fire);
      const value = Number(fire.frp);

      if (
        sensor &&
        fire.frp != null &&
        fire.frp !== "" &&
        Number.isFinite(value) &&
        value >= 0
      ) {
        values[sensor].push(value);
      }
    }

    return {
      modis: median(values.MODIS),
      viirs: median(values.VIIRS),
    };
  }, [fires]);

  function toggle(key) {
    setShow((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  }

  return (
    <section className="st-panel">
      <h3>Sensor comparison over time</h3>

      <p className="st-sub">
        Monthly MODIS and VIIRS detections.
        Harmonized estimates appear when validated
        results are available.
      </p>

      <div className="st-options">
        {[
          {
            key: "harmonized",
            label: "Harmonized (VIIRS-equivalent)",
            disabled: !hasHarmonized,
          },
          { key: "modis", label: "MODIS raw" },
          { key: "viirs", label: "VIIRS raw" },
        ].map((item) => (
          <label
            key={item.key}
            className={item.disabled ? "is-disabled" : ""}
          >
            <input
              type="checkbox"
              checked={show[item.key] && !item.disabled}
              disabled={item.disabled}
              onChange={() => toggle(item.key)}
            />

            <span
              className={`st-swatch st-swatch--${item.key}`}
            />

            {item.label}
          </label>
        ))}
      </div>

      {data.length > 0 ? (
        <div className="st-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{
                top: 12,
                right: 15,
                bottom: 8,
                left: 0,
              }}
            >
              <CartesianGrid
                stroke="#27313a"
                vertical={false}
              />

              <XAxis
                dataKey="month"
                tick={{
                  fill: "#93a6b9",
                  fontSize: 11,
                }}
                tickLine={false}
                axisLine={false}
                minTickGap={26}
              />

              <YAxis
                tick={{
                  fill: "#93a6b9",
                  fontSize: 12,
                }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={46}
              />

              <Tooltip content={<CustomTooltip />} />

              {show.harmonized && hasHarmonized && (
                <>
                  <Area
                    type="linear"
                    dataKey="band"
                    stroke="none"
                    fill="#a6b0ba"
                    fillOpacity={0.24}
                    connectNulls={false}
                  />

                  <Line
                    type="linear"
                    dataKey="harmonized"
                    stroke={COLORS.harmonized}
                    strokeWidth={2.5}
                    strokeDasharray="7 5"
                    dot={false}
                    connectNulls={false}
                  />
                </>
              )}

              {show.modis && (
                <Line
                  type="linear"
                  dataKey="modis"
                  stroke={COLORS.modis}
                  strokeWidth={2}
                  dot={false}
                />
              )}

              {show.viirs && (
                <Line
                  type="linear"
                  dataKey="viirs"
                  stroke={COLORS.viirs}
                  strokeWidth={2}
                  dot={false}
                />
              )}

              {firstViirs && (
                <ReferenceLine
                  x={firstViirs}
                  stroke="#788995"
                  strokeDasharray="4 5"
                  label={{
                    value: "VIIRS in data",
                    position: "insideTopRight",
                    fill: "#93a6b9",
                    fontSize: 11,
                  }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="st-empty">
          Import MODIS or VIIRS data to display the timeline.
        </p>
      )}

      <p className="st-note">
        Dashed: harmonized series. Shaded: supplied
        90% interval. Solid: raw sensor counts.
      </p>

      <div className="st-ratios">
        {ratios.map(({ label, ratio }) => (
          <div className="st-ratio" key={label}>
            <span>{label}</span>
            <strong>
              {ratio == null
                ? "—"
                : `${ratio.toFixed(1)}×`}
            </strong>
          </div>
        ))}
      </div>

      <p className="st-note">
        Monthly ratios are raw VIIRS / MODIS count
        ratios, not harmonization coefficients.
      </p>

      <div className="st-frp">
        <span>Median fire radiative power</span>

        <span>
          MODIS{" "}
          <b>
            {frp.modis == null
              ? "—"
              : `${frp.modis.toFixed(1)} MW`}
          </b>
        </span>

        <span>
          VIIRS{" "}
          <b>
            {frp.viirs == null
              ? "—"
              : `${frp.viirs.toFixed(1)} MW`}
          </b>
        </span>
      </div>
    </section>
  );
}
