
import { useEffect, useMemo, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

// ==========================================
// PROBABILITY COLORS
// ==========================================



function activityColor(value) {
  if (value >= 100) return "#750000"; // Deep crimson
  if (value >= 50) return "#c00000";  // Dark red
  if (value >= 20) return "#ff0000";  // Bright red
  if (value >= 5) return "#ff4500";   // Red-orange
  return "#ff8c00";                   // Strong orange
}


// ==========================================
// HARMONIZED LAYER
// ==========================================

export default function HarmonizedLayer({
  records = [],
  startDate,
  endDate,
}) {
  const map = useMap();

  // Track the visible map area.
  const [viewport, setViewport] = useState(() =>
    map.getBounds()
  );

  // ========================================
  // UPDATE VIEWPORT ON MAP MOVEMENT
  // ========================================

  useEffect(() => {
    function updateViewport() {
      setViewport(map.getBounds());
    }

    map.on("moveend", updateViewport);
    map.on("zoomend", updateViewport);

    updateViewport();

    return () => {
      map.off("moveend", updateViewport);
      map.off("zoomend", updateViewport);
    };
  }, [map]);

  // ========================================
  // AGGREGATE PREDICTIONS BY CELL
  // ========================================

  
const cells = useMemo(() => {
  const grouped = new Map();

  for (const row of records) {
    if (row.date < startDate || row.date > endDate) continue;

    let contribution = null;
    let source = null;

    // Use actual VIIRS observations when available.
    if (
      row.viirsPresent === 0 ||
      row.viirsPresent === 1
    ) {
      contribution = row.viirsPresent;
      source = "observed";
    }

    // Otherwise use model predictions.
    else if (
      row.probability != null &&
      Number.isFinite(row.probability) &&
      row.probability >= 0 &&
      row.probability <= 1
    ) {
      contribution = row.probability;
      source = "predicted";
    }

    // Never interpret missing values as zero.
    if (contribution === null) continue;

    const id = row.cellId;

    if (!grouped.has(id)) {
      grouped.set(id, {
        cellId: id,
        latMin: Number(row.latMin),
        latMax: Number(row.latMax),
        lonMin: Number(row.lonMin),
        lonMax: Number(row.lonMax),
        activity: 0,
        observedActivity: 0,
        predictedActivity: 0,
        observedDays: 0,
        predictedDays: 0,
      });
    }

    const cell = grouped.get(id);

    cell.activity += contribution;

    if (source === "observed") {
      cell.observedActivity += contribution;
      cell.observedDays++;
    } else {
      cell.predictedActivity += contribution;
      cell.predictedDays++;
    }
  }

  return Array.from(grouped.values()).filter(
    (cell) =>
      Number.isFinite(cell.latMin) &&
      Number.isFinite(cell.latMax) &&
      Number.isFinite(cell.lonMin) &&
      Number.isFinite(cell.lonMax) &&
      cell.latMin < cell.latMax &&
      cell.lonMin < cell.lonMax
  );
}, [records, startDate, endDate]);

  // ========================================
  // FILTER CELLS BY MAP VIEWPORT
  // ========================================

  const visibleCells = useMemo(() => {
    if (!viewport || !viewport.isValid()) {
      return [];
    }

    return cells.filter((cell) => {
      const cellBounds = L.latLngBounds(
        [cell.latMin, cell.lonMin],
        [cell.latMax, cell.lonMax]
      );

      return viewport.intersects(cellBounds);
    });
  }, [cells, viewport]);

  // ========================================
  // RENDER VISIBLE CELLS
  // ========================================

  useEffect(() => {
    const renderer = L.canvas({
      padding: 0.5,
    });

    const layer = L.layerGroup().addTo(map);

    let cancelled = false;
    let timer = null;
    let index = 0;

    const CHUNK_SIZE = 500;

    function addChunk() {
      if (cancelled) return;

      const end = Math.min(
        index + CHUNK_SIZE,
        visibleCells.length
      );

      for (; index < end; index++) {
        const cell = visibleCells[index];

        const color = activityColor(cell.activity);
        const rectangle = L.rectangle(
          [
            [cell.latMin, cell.lonMin],
            [cell.latMax, cell.lonMax],
          ],
          {
            renderer,
            color,
            fillColor: color,
            fillOpacity: 0.75,
            weight: 0.5,
            interactive: true,
          }
        );

        // Popup content
        const popup = document.createElement("div");
        popup.style.minWidth = "210px";

        const heading = document.createElement("strong");
        heading.textContent = "Harmonized Activity";
        popup.appendChild(heading);

        
const details = [
  ["Cell ID", cell.cellId],
  [
    "Total expected positive cell-days",
    cell.activity.toFixed(2),
  ],
  [
    "Observed positive cell-days",
    cell.observedActivity.toFixed(0),
  ],
  [
    "Estimated positive cell-days",
    cell.predictedActivity.toFixed(2),
  ],
  ["Observed cell-days", String(cell.observedDays)],
  ["Predicted cell-days", String(cell.predictedDays)],
];


        for (const [label, value] of details) {
          const line = document.createElement("div");
          line.style.marginTop = "5px";
          line.textContent = `${label}: ${value}`;
          popup.appendChild(line);
        }

        rectangle.bindPopup(popup);
        rectangle.addTo(layer);
      }

      if (index < visibleCells.length) {
        timer = window.setTimeout(addChunk, 0);
      }
    }

    addChunk();

    return () => {
      cancelled = true;

      if (timer !== null) {
        window.clearTimeout(timer);
      }

      map.removeLayer(layer);
    };
  }, [map, visibleCells]);

  // ========================================
  // DEBUG INFORMATION
  // ========================================

  useEffect(() => {
    console.log(
      "[FireLens] Total predicted cells:",
      cells.length
    );

    console.log(
      "[FireLens] Visible predicted cells:",
      visibleCells.length
    );
  }, [cells, visibleCells]);

  return null;
}
