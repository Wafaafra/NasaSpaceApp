
import { memo, useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

/* ==========================================
   FIRELENS — OPTIMIZED HOTSPOT LAYER
   Leaflet Canvas rendering
========================================== */

// Shared styles: don't create new objects for every fire.
const VIIRS_STYLE = {
  radius: 3,
  color: "#ff6b35",
  fillColor: "#ff6b35",
  fillOpacity: 0.7,
  weight: 0,
  interactive: true,
};

const MODIS_STYLE = {
  radius: 4,
  color: "#ffd166",
  fillColor: "#ffd166",
  fillOpacity: 0.7,
  weight: 0,
  interactive: true,
};

// Avoid generating thousands of React components.
const CHUNK_SIZE = 1500;

function getSensor(fire) {
  const sensor = String(
    fire.sensor ||
    fire.instrument ||
    fire.satellite ||
    ""
  ).toUpperCase();

  if (
    sensor.includes("VIIRS") ||
    sensor.includes("SNPP") ||
    sensor.includes("S-NPP") ||
    sensor.includes("NOAA") ||
    sensor === "N"
  ) {
    return "VIIRS";
  }

  return "MODIS";
}

function getCoordinates(fire) {
  const lat = Number(fire.latitude ?? fire.lat);
  const lng = Number(
    fire.longitude ?? fire.lng ?? fire.lon
  );

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  return [lat, lng];
}

function getFireDate(fire) {
  return String(
    fire.date || fire.acq_date || "Unavailable"
  );
}

function getFRP(fire) {
  if (
    fire.frp === null ||
    fire.frp === undefined ||
    fire.frp === ""
  ) {
    return "Unavailable";
  }

  const frp = Number(fire.frp);

  return Number.isFinite(frp)
    ? `${frp.toFixed(2)} MW`
    : "Unavailable";
}

// Escape imported text before inserting it into popup HTML.
function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createPopupContent(fire, sensor, lat, lng) {
  return `
    <div style="
      min-width: 190px;
      font-family: Inter, system-ui, sans-serif;
      color: #243547;
    ">
      <strong style="
        font-size: 14px;
        color: #f47735;
      ">
        ${escapeHTML(sensor)} Detection
      </strong>

      <p style="margin: 9px 0 5px;">
        <b>Date:</b> ${escapeHTML(getFireDate(fire))}
      </p>

      <p style="margin: 5px 0;">
        <b>FRP:</b> ${escapeHTML(getFRP(fire))}
      </p>

      <p style="margin: 5px 0;">
        <b>Coordinates:</b><br/>
        ${lat.toFixed(4)}, ${lng.toFixed(4)}
      </p>
    </div>
  `;
}

function HotspotLayer({ fires = [] }) {
  const map = useMap();

  const groupRef = useRef(null);
  const rendererRef = useRef(null);

  // Create the Canvas renderer and layer group only once.
  useEffect(() => {
    const renderer = L.canvas({
      padding: 0.5,
      tolerance: 5,
    });

    const group = L.layerGroup();

    renderer.addTo(map);
    group.addTo(map);

    rendererRef.current = renderer;
    groupRef.current = group;

    return () => {
      group.clearLayers();
      map.removeLayer(group);
      map.removeLayer(renderer);

      groupRef.current = null;
      rendererRef.current = null;
    };
  }, [map]);

  // Update hotspots only when fire data changes.
  useEffect(() => {
    const group = groupRef.current;
    const renderer = rendererRef.current;

    if (!group || !renderer) return;

    group.clearLayers();

    if (!Array.isArray(fires) || fires.length === 0) {
      return;
    }

    let cancelled = false;
    let frameId = null;
    let index = 0;

    function addChunk() {
      if (cancelled) return;

      const end = Math.min(
        index + CHUNK_SIZE,
        fires.length
      );

      const layers = [];

      for (; index < end; index++) {
        const fire = fires[index];
        const coordinates = getCoordinates(fire);

        if (!coordinates) continue;

        const [lat, lng] = coordinates;
        const sensor = getSensor(fire);

        const style =
          sensor === "VIIRS"
            ? VIIRS_STYLE
            : MODIS_STYLE;

        const marker = L.circleMarker(
          [lat, lng],
          {
            ...style,
            renderer,
          }
        );

        // Create popup HTML only when the marker is clicked.
        marker.on("click", () => {
          marker.bindPopup(
            createPopupContent(
              fire,
              sensor,
              lat,
              lng
            ),
            {
              maxWidth: 300,
            }
          );

          marker.openPopup();
        });

        layers.push(marker);
      }

      for (const layer of layers) {
        group.addLayer(layer);
      }

      // Render the next batch without blocking the browser.
      if (index < fires.length && !cancelled) {
        frameId = requestAnimationFrame(addChunk);
      }
    }

    frameId = requestAnimationFrame(addChunk);

    return () => {
      cancelled = true;

      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      group.clearLayers();
    };
  }, [fires, map]);

  return null;
}

export default memo(HotspotLayer);
