
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Flame,
  Map as MapIcon,
  BarChart3,
  CalendarDays,
  Layers,
  TrendingUp,
  SlidersHorizontal,
  Upload,
  ChevronDown,
  MapPin,
} from "lucide-react";
import { Satellite } from "lucide-react";
import AnalyticsPages from "../components/analytics/AnalyticsPages";
import "../App.css";
import {
  filterFires,
  getMonthlyActivity,
} from "../services/fireAnalytics";
import MonthlyChart from "../components/analytics/MonthlyChart";
import FireMap from "../components/map/FireMap";
import LocationWidget from "../components/map/LocationWidget";
import DataImporter from "../components/layout/DataImporter";
import { loadHarmonizedData } from "../services/harmonizedData";

/* ==========================================
   CONSTANTS
========================================== */

function getToday() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

const TODAY = getToday();

const SENSOR_START_DATES = {
  modis: "2000-02-24",
  viirs: "2013-01-01",
  both: "2000-02-24",
};

const HARMONIZED_START_DATE = "2000-01-01";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr",
  "May", "Jun", "Jul", "Aug",
  "Sep", "Oct", "Nov", "Dec",
];

const NAVIGATION = [
  { id: "map", icon: MapIcon, label: "Map" },
  { id: "statistics", icon: BarChart3, label: "Statistics" },
  { id: "historical", icon: CalendarDays, label: "Fire calendar" },
  { id: "sensors", icon: Layers, label: "Sensor comparison" },
  { id: "anomalies", icon: TrendingUp, label: "Historical anomalies" },
  { id: "filters", icon: SlidersHorizontal, label: "Filters" },
  { id: "import", icon: Upload, label: "Import data" },
];

/* ==========================================
   RAW DATA HELPERS
========================================== */

function getFireDate(fire) {
  return String(
    fire.date || fire.acq_date || ""
  ).slice(0, 10);
}

function getSensor(fire) {
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
    return "modis";
  }

  if (
    sensor.includes("VIIRS") ||
    sensor.includes("SNPP") ||
    sensor.includes("S-NPP") ||
    sensor.includes("NOAA") ||
    sensor === "N"
  ) {
    return "viirs";
  }

  return "unknown";
}

function matchesFilters(
  fire,
  startDate,
  endDate,
  dataType
) {
  const date = getFireDate(fire);

  if (date < startDate || date > endDate) {
    return false;
  }

  if (dataType === "both") {
    return true;
  }

  return getSensor(fire) === dataType;
}

function calculateZoneStats(fires) {
  if (!fires.length) {
    return {
      total: 0,
      annualAverage: 0,
      peakMonth: "—",
    };
  }

  const years = new Set();
  const monthCounts = new Array(12).fill(0);

  for (const fire of fires) {
    const date = getFireDate(fire);
    const year = date.slice(0, 4);
    const month = Number(date.slice(5, 7));

    if (/^\d{4}$/.test(year)) {
      years.add(year);
    }

    if (month >= 1 && month <= 12) {
      monthCounts[month - 1]++;
    }
  }

  const maxCount = Math.max(...monthCounts);

  return {
    total: fires.length,
    annualAverage: years.size
      ? Math.round(fires.length / years.size)
      : 0,
    peakMonth: maxCount
      ? MONTH_NAMES[monthCounts.indexOf(maxCount)]
      : "—",
  };
}

/* ==========================================
   GEOGRAPHIC AOI HELPERS
========================================== */

function pointOnSegment(x, y, ax, ay, bx, by) {
  const cross =
    (x - ax) * (by - ay) -
    (y - ay) * (bx - ax);

  if (Math.abs(cross) > 1e-10) {
    return false;
  }

  return (
    x >= Math.min(ax, bx) - 1e-10 &&
    x <= Math.max(ax, bx) + 1e-10 &&
    y >= Math.min(ay, by) - 1e-10 &&
    y <= Math.max(ay, by) + 1e-10
  );
}

function pointInRing(lon, lat, ring) {
  if (!Array.isArray(ring) || ring.length < 3) {
    return false;
  }

  let inside = false;

  for (
    let i = 0, j = ring.length - 1;
    i < ring.length;
    j = i++
  ) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    if (pointOnSegment(lon, lat, xi, yi, xj, yj)) {
      return true;
    }

    const intersects =
      (yi > lat) !== (yj > lat) &&
      lon <
        ((xj - xi) * (lat - yi)) /
          (yj - yi) +
          xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInPolygon(lon, lat, rings) {
  if (!rings?.length) return false;

  if (!pointInRing(lon, lat, rings[0])) {
    return false;
  }

  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lon, lat, rings[i])) {
      return false;
    }
  }

  return true;
}

function pointInAOI(lon, lat, aoi) {
  if (!aoi) return false;

  const geometry =
    aoi.type === "Feature"
      ? aoi.geometry
      : aoi;

  if (!geometry) return false;

  if (geometry.type === "Polygon") {
    return pointInPolygon(
      lon,
      lat,
      geometry.coordinates
    );
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some(
      (polygon) =>
        pointInPolygon(lon, lat, polygon)
    );
  }

  return false;
}

/* ==========================================
   HARMONIZED HELPERS
========================================== */

function getHarmonizedContribution(row) {
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
        source: "predicted",
      };
    }
  }

  return null;
}

function calculateHarmonizedStats(records) {
  const monthly = MONTH_NAMES.map((month) => ({
    month,
    activity: 0,
    observed: 0,
    estimated: 0,
  }));

  const cells = new Set();
  const years = new Set();

  let total = 0;
  let observed = 0;
  let estimated = 0;
  let observedDays = 0;
  let predictedDays = 0;
  let missingDays = 0;

  for (const row of records) {
    const contribution =
      getHarmonizedContribution(row);

    if (!contribution) {
      missingDays++;
      continue;
    }

    const value = contribution.value;

    total += value;
    cells.add(row.cellId);
    years.add(String(row.date).slice(0, 4));

    const month =
      Number(String(row.date).slice(5, 7)) - 1;

    if (contribution.source === "observed") {
      observed += value;
      observedDays++;

      if (month >= 0 && month < 12) {
        monthly[month].observed += value;
      }
    } else {
      estimated += value;
      predictedDays++;

      if (month >= 0 && month < 12) {
        monthly[month].estimated += value;
      }
    }

    if (month >= 0 && month < 12) {
      monthly[month].activity += value;
    }
  }

  const peak = monthly.reduce(
    (best, current) =>
      current.activity > best.activity
        ? current
        : best,
    monthly[0]
  );

  return {
    total,
    observed,
    estimated,
    observedDays,
    predictedDays,
    missingDays,
    activeCells: cells.size,
    yearsRepresented: years.size,
    peakMonth:
      peak.activity > 0 ? peak.month : "—",
    monthly,
  };
}

function formatNumber(value, decimals = 1) {
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
  });
}

/* ==========================================
   HARMONIZED MONTHLY CHART
========================================== */

function HarmonizedMonthlyChart({ data }) {
  const max = Math.max(
    1,
    ...data.map((item) => item.activity)
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: "6px",
        height: "100%",
        minHeight: "150px",
        padding: "12px 4px",
        boxSizing: "border-box",
      }}
    >
      {data.map((item) => {
        const height =
          item.activity > 0
            ? Math.max(
                3,
                (item.activity / max) * 110
              )
            : 0;

        return (
          <div
            key={item.month}
            title={
              `${item.month}: ` +
              `${formatNumber(item.activity)} ` +
              "expected positive cell-days"
            }
            style={{
              flex: 1,
              minWidth: 0,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: "32px",
                height: `${height}px`,
                background:
                  "linear-gradient(180deg, #ff4500, #b91c1c)",
                borderRadius: "4px 4px 0 0",
                transition: "height 0.2s ease",
              }}
            />

            <span
              style={{
                fontSize: "10px",
                color: "#64748b",
              }}
            >
              {item.month}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ==========================================
   DASHBOARD
========================================== */

export default function Dashboard() {
  const [source, setSource] = useState("both");
  const [navOpen, setNavOpen] = useState(false);
  const dataMode = source === "harmonized" ? "harmonized" : "raw";
  const dataType = source === "harmonized" ? "both" : source;
  const isHarmonized = source === "harmonized";

  const [harmonizedData, setHarmonizedData] =
    useState([]);

  const [
    harmonizedLoading,
    setHarmonizedLoading,
  ] = useState(true);

  const [
    harmonizedError,
    setHarmonizedError,
  ] = useState(null);

  useEffect(() => {
    let cancelled = false;

    loadHarmonizedData()
      .then((records) => {
        if (cancelled) return;

        setHarmonizedData(records);
        setHarmonizedError(null);
        setHarmonizedLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;

        console.error(
          "Failed to load harmonized data:",
          error
        );

        setHarmonizedError(error.message);
        setHarmonizedLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /* RAW DATA */

  const [modisData, setModisData] =
    useState([]);

  const [viirsData, setViirsData] =
    useState([]);

  /* MAP AND LOCATION */

  const [aoi, setAoi] = useState(null);

  const [
    selectedLocation,
    setSelectedLocation,
  ] = useState(null);

  /* NAVIGATION */

  const [activeNav, setActiveNav] =
    useState("map");

  const [showImport, setShowImport] =
    useState(false);

  /* FILTERS */

  const [startDate, setStartDate] =
    useState("2023-07-01");

  const [endDate, setEndDate] =
    useState("2023-08-31");

  const minDate = isHarmonized
    ? HARMONIZED_START_DATE
    : SENSOR_START_DATES[dataType];

  const isAnalytics = [
    "statistics",
    "historical",
    "sensors",
    "anomalies",
  ].includes(activeNav);

  /* RAW DATA FILTERING */

  const deferredStartDate =
    useDeferredValue(startDate);

  const deferredEndDate =
    useDeferredValue(endDate);

  const deferredDataType =
    useDeferredValue(dataType);

  // Apply the wildfire-only quality rules before any map or analytics filtering.
  // Keep individual detections here: harmonized records are already cell-days,
  // and raw detections must not be mislabeled as equivalent cell-day counts.
  const allFires = useMemo(() => {
    const cleanModis = modisData.filter((fire) =>
      Number(fire.type) === 0 &&
      Number.isFinite(Number(fire.confidence)) &&
      Number(fire.confidence) > 30
    );

    const cleanViirs = viirsData.filter((fire) =>
      Number(fire.type) === 0 &&
      ["n", "h"].includes(String(fire.confidence ?? "").trim().toLowerCase())
    );

    return [...cleanModis, ...cleanViirs];
  }, [modisData, viirsData]);

  const firesInsideAOI = useMemo(() => {
    if (!aoi) return [];

    return filterFires(
      allFires,
      aoi,
      "0000-01-01",
      "9999-12-31",
      "raw"
    );
  }, [allFires, aoi]);

  // Sensor Comparison needs both raw sensors, independently of the
  // map's MODIS / VIIRS / Harmonized source selection.
  // Keep the date and selected-area filters in effect.
  const comparisonFires = useMemo(() => {
    const records = aoi ? firesInsideAOI : allFires;
    return records.filter((fire) => {
      const date = getFireDate(fire);
      return date >= deferredStartDate && date <= deferredEndDate;
    });
  }, [allFires, firesInsideAOI, aoi, deferredStartDate, deferredEndDate]);

  const filteredFires = useMemo(() => {
    return allFires.filter((fire) =>
      matchesFilters(
        fire,
        deferredStartDate,
        deferredEndDate,
        deferredDataType
      )
    );
  }, [
    allFires,
    deferredStartDate,
    deferredEndDate,
    deferredDataType,
  ]);

  const selectedFires = useMemo(() => {
    if (!aoi) return [];

    return firesInsideAOI.filter((fire) =>
      matchesFilters(
        fire,
        deferredStartDate,
        deferredEndDate,
        deferredDataType
      )
    );
  }, [
    firesInsideAOI,
    aoi,
    deferredStartDate,
    deferredEndDate,
    deferredDataType,
  ]);

  const zoneMonthlyData = useMemo(() => {
    if (!selectedFires.length) return [];

    return getMonthlyActivity(selectedFires);
  }, [selectedFires]);

  const zoneStats = useMemo(() => {
    return calculateZoneStats(selectedFires);
  }, [selectedFires]);

  /* HARMONIZED AOI FILTERING */

  const harmonizedInsideAOI = useMemo(() => {
    if (!aoi || !harmonizedData.length) {
      return [];
    }

    // JavaScript's built-in Map works correctly
    // because the Lucide icon is named MapIcon.
    const cellMembership = new Map();

    return harmonizedData.filter((row) => {
      const id = row.cellId;

      if (cellMembership.has(id)) {
        return cellMembership.get(id);
      }

      const latMin = Number(row.latMin);
      const latMax = Number(row.latMax);
      const lonMin = Number(row.lonMin);
      const lonMax = Number(row.lonMax);

      let inside = false;

      if (
        row.latMin != null &&
        row.latMax != null &&
        row.lonMin != null &&
        row.lonMax != null &&
        Number.isFinite(latMin) &&
        Number.isFinite(latMax) &&
        Number.isFinite(lonMin) &&
        Number.isFinite(lonMax) &&
        latMin < latMax &&
        lonMin < lonMax
      ) {
        const lat = (latMin + latMax) / 2;
        const lon = (lonMin + lonMax) / 2;

        inside = pointInAOI(lon, lat, aoi);
      }

      cellMembership.set(id, inside);

      return inside;
    });
  }, [harmonizedData, aoi]);

  const selectedHarmonizedRecords = useMemo(
    () => {
      if (!aoi) return [];

      return harmonizedInsideAOI.filter(
        (row) =>
          row.date >= startDate &&
          row.date <= endDate
      );
    },
    [
      harmonizedInsideAOI,
      aoi,
      startDate,
      endDate,
    ]
  );

  const filteredHarmonizedRecords = useMemo(
    () => harmonizedData.filter(
      (row) => row.date >= startDate && row.date <= endDate
    ),
    [harmonizedData, startDate, endDate]
  );

  const harmonizedZoneStats = useMemo(
    () =>
      calculateHarmonizedStats(
        selectedHarmonizedRecords
      ),
    [selectedHarmonizedRecords]
  );

  /* HANDLERS */

  const handleAOIChange = useCallback(
    (geojson) => {
      setAoi(geojson);
    },
    []
  );

  const handleSelectLocation = useCallback(
    (location) => {
      setSelectedLocation(location);
    },
    []
  );

  const handleBackToMap = useCallback(() => {
    setActiveNav("map");
  }, []);

  function handleSourceChange(event) {
    const next = event.target.value;
    setSource(next);
    const nextMin = next === "harmonized"
      ? HARMONIZED_START_DATE
      : SENSOR_START_DATES[next];
    if (startDate < nextMin) setStartDate(nextMin);
    if (endDate < nextMin) setEndDate(nextMin);
  }

  function handleStartDateChange(event) {
    const value = event.target.value;
    if (!value) return;

    const safeDate =
      value < minDate
        ? minDate
        : value > TODAY
          ? TODAY
          : value;

    setStartDate(safeDate);

    if (safeDate > endDate) {
      setEndDate(safeDate);
    }
  }

  function handleEndDateChange(event) {
    const value = event.target.value;
    if (!value) return;

    const safeDate =
      value > TODAY
        ? TODAY
        : value < minDate
          ? minDate
          : value;

    setEndDate(safeDate);

    if (safeDate < startDate) {
      setStartDate(safeDate);
    }
  }

  /* DATA IMPORT */

  const handleDataLoaded = useCallback(
    (satellite, detections) => {
      const records = Array.isArray(detections)
        ? detections
        : [];

      if (satellite === "MODIS") {
        setModisData(
          records.map((fire) => ({
            ...fire,
            sensor: "MODIS",
          }))
        );
      }

      if (satellite === "VIIRS") {
        setViirsData(
          records.map((fire) => ({
            ...fire,
            sensor: "VIIRS",
          }))
        );
      }
    },
    []
  );

  function handleNavClick(id) {
    if (id === "import") {
      setShowImport(true);
      setActiveNav("map");
      return;
    }

    if (id === "filters") {
      setActiveNav("map");
      setShowImport(false);
      return;
    }

    setActiveNav(id);
    setShowImport(false);
  }

  /* ==========================================
     RENDER
  ========================================== */

  return (
    <div className="firelens-page">
      <div
        className={`firelens-map-shell ${
          isAnalytics
            ? "firelens-analytics-mode"
            : ""
        }`}
      >
        {/* MAP */}

        
          <div className="firelens-shared-map-background">
  <FireMap
    fires={filteredFires}
    onAOIChange={handleAOIChange}
    selectedLocation={selectedLocation}
    onSelectLocation={handleSelectLocation}
    dataMode={dataMode}
    harmonizedData={harmonizedData}
    startDate={startDate}
    endDate={endDate}
    onOpenImport={() => {
      setActiveNav("map");
      setShowImport(true);
    }}
  />
</div>

        {/* TOP FILTERS */}

        <div className="firelens-top-filters">
          
<div className="firelens-location-filter">
  <LocationWidget
    selectedLocation={selectedLocation}
    onSelectLocation={handleSelectLocation}
  />
</div>


          <div className="firelens-filter-date firelens-unified-control">
            <CalendarDays size={15} />

            <input
              type="date"
              aria-label="Start date"
              value={startDate}
              min={minDate}
              max={endDate}
              onChange={handleStartDateChange}
            />

            <span>–</span>

            <input
              type="date"
              aria-label="End date"
              value={endDate}
              min={startDate}
              max={TODAY}
              onChange={handleEndDateChange}
            />
          </div>

          <label className="firelens-source-control firelens-unified-control">
            <Satellite size={18} className="firelens-sensor-icon" />
            <select
              value={source}
              onChange={handleSourceChange}
              aria-label="Data source"
            >
              <option value="both">All sensors</option>
              <option value="modis">MODIS</option>
              <option value="viirs">VIIRS</option>
              <option
                value="harmonized"
                disabled={harmonizedLoading || !!harmonizedError || !harmonizedData.length}
              >
                Harmonized
              </option>
            </select>
            <ChevronDown size={15} className="firelens-select-chevron" />
          </label>
        </div>

        {/* SELECTED AREA STATISTICS */}

        {aoi && !isAnalytics && (
          <div className="firelens-zone-widgets">

            {/* MONTHLY ACTIVITY */}

            <section className="firelens-zone-widget activity-widget">
              <div className="zone-widget-top">
                <div className="zone-widget-heading">
                  <span className="zone-widget-eyebrow">
                    <span className="zone-status-dot" />
                    {" "}SELECTED AREA
                  </span>

                  <h3>Burning activity</h3>

                  <p>
                    {isHarmonized
                      ? "Monthly harmonized activity"
                      : "Monthly hotspot detections"}
                  </p>
                </div>

                <div className="zone-widget-icon">
                  <BarChart3 size={18} />
                </div>
              </div>

              <div className="zone-chart">
                {isHarmonized ? (
                  harmonizedLoading ? (
                    <div className="zone-empty">
                      Loading harmonized data...
                    </div>
                  ) : harmonizedZoneStats.total > 0 ? (
                    <HarmonizedMonthlyChart
                      data={harmonizedZoneStats.monthly}
                    />
                  ) : (
                    <div className="zone-empty">
                      No available harmonized activity
                      in this area for the selected dates
                    </div>
                  )
                ) : selectedFires.length > 0 ? (
                  <MonthlyChart
                    data={zoneMonthlyData}
                  />
                ) : (
                  <div className="zone-empty">
                    No raw detections in this area
                  </div>
                )}
              </div>

              <div className="zone-widget-bottom">
                <span>
                  {isHarmonized
                    ? "Observed + reconstructed"
                    : "NASA FIRMS"}
                </span>

                <span>
                  {isHarmonized
                    ? "Expected positive cell-days"
                    : "Raw observations"}
                </span>
              </div>
            </section>

            {/* ACTIVITY STATISTICS */}

            <section className="firelens-zone-widget hotspots-widget">
              <div className="zone-widget-top">
                <div className="zone-widget-heading">
                  <span className="zone-widget-eyebrow">
                    <span className="zone-status-dot" />
                    {" "}SELECTED AREA
                  </span>

                  <h3>
                    {isHarmonized
                      ? "Harmonized activity"
                      : "Hotspots"}
                  </h3>

                  <p>
                    {isHarmonized
                      ? "Observed + estimated activity"
                      : "Total detected activity"}
                  </p>
                </div>

                <div className="zone-widget-icon flame-icon">
                  <Flame size={18} />
                </div>
              </div>

              <div className="zone-hotspot-number">
                {isHarmonized
                  ? formatNumber(
                      harmonizedZoneStats.total
                    )
                  : formatNumber(
                      zoneStats.total,
                      0
                    )}
              </div>

              <div className="zone-hotspot-caption">
                {isHarmonized
                  ? "Expected VIIRS-positive cell-days"
                  : "Raw satellite detections"}
              </div>

              <div className="zone-stat-divider" />

              {isHarmonized ? (
                <>
                  <div className="zone-mini-stat">
                    <span>
                      Observed positive cell-days
                    </span>
                    <strong>
                      {formatNumber(
                        harmonizedZoneStats.observed,
                        0
                      )}
                    </strong>
                  </div>

                  <div className="zone-mini-stat">
                    <span>
                      Estimated positive cell-days
                    </span>
                    <strong>
                      {formatNumber(
                        harmonizedZoneStats.estimated
                      )}
                    </strong>
                  </div>

                  <div className="zone-mini-stat">
                    <span>
                      Grid cells represented
                    </span>
                    <strong>
                      {formatNumber(
                        harmonizedZoneStats.activeCells,
                        0
                      )}
                    </strong>
                  </div>

                  <div className="zone-mini-stat">
                    <span>Peak month</span>
                    <strong>
                      {harmonizedZoneStats.peakMonth}
                    </strong>
                  </div>

                  <div className="zone-mini-stat">
                    <span>
                      Cell-days without values
                    </span>
                    <strong>
                      {formatNumber(
                        harmonizedZoneStats.missingDays,
                        0
                      )}
                    </strong>
                  </div>
                </>
              ) : (
                <>
                  <div className="zone-mini-stat">
                    <span>Annual average</span>
                    <strong>
                      {formatNumber(
                        zoneStats.annualAverage,
                        0
                      )}
                    </strong>
                  </div>

                  <div className="zone-mini-stat">
                    <span>Peak month</span>
                    <strong>
                      {zoneStats.peakMonth}
                    </strong>
                  </div>
                </>
              )}

              <div className="zone-widget-bottom">
                <span>
                  {isHarmonized
                    ? "Harmonized dataset"
                    : "NASA FIRMS"}
                </span>
                <span>Selected zone</span>
              </div>
            </section>
          </div>
        )}

        {/* ANALYTICS PAGES */}

        {isAnalytics && (
         
<AnalyticsPages
  key={activeNav}
  page={activeNav}
  fires={activeNav === "sensors" ? comparisonFires : (aoi ? selectedFires : filteredFires)}
  harmonizedRecords={aoi ? selectedHarmonizedRecords : filteredHarmonizedRecords}
  dataMode={dataMode}
  onBack={handleBackToMap}
/>

        )}

        {/* LEFT NAVIGATION */}

        <aside
          className={`firelens-nav firelens-nav-hover ${navOpen ? "firelens-nav-open" : ""}`}
          onMouseLeave={() => setNavOpen(false)}
        >
          <button
            type="button"
            className="firelens-nav-logo firelens-logo-button"
            aria-label={navOpen ? "Close FireLens navigation" : "Open FireLens navigation"}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}
          >
            <Flame size={19} />
            {navOpen && <strong>FireLens</strong>}
          </button>
          {navOpen && (
            <div className="firelens-nav-links">
              {NAVIGATION.map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  type="button"
                  title={label}
                  aria-label={label}
                  className={activeNav === id ? "active" : ""}
                  onClick={() => {
                    handleNavClick(id);
                    setNavOpen(false);
                  }}
                >
                  <Icon size={20} />
                  <span className="firelens-nav-label">{label}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        
        {/* IMPORT PANEL */}

        {showImport && (
          <div className="firelens-import-popover">
            <div className="firelens-import-title">
              <h3>Import satellite data</h3>

              <button
                type="button"
                onClick={() =>
                  setShowImport(false)
                }
              >
                ✕
              </button>
            </div>

            <DataImporter
              onDataLoaded={handleDataLoaded}
            />
          </div>
        )}
      </div>
    </div>
  );
}
