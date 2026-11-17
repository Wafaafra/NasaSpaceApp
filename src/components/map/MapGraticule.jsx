
import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

function getGridStep(zoom) {
  if (zoom <= 3) return 30;
  if (zoom <= 5) return 10;
  if (zoom <= 7) return 5;
  if (zoom <= 9) return 1;
  if (zoom <= 11) return 0.25;
  return 0.1;
}

function formatCoordinate(value, type) {
  const direction =
    type === "lat"
      ? value >= 0 ? "N" : "S"
      : value >= 0 ? "E" : "W";

  return `${Math.abs(value).toFixed(2)}° ${direction}`;
}

export default function MapGraticule({
  visible = true,
}) {
  const map = useMap();

  useEffect(() => {
    if (!visible) return;

    const layer = L.layerGroup().addTo(map);

    function drawGrid() {
      layer.clearLayers();

      const bounds = map.getBounds();
      const zoom = map.getZoom();
      const step = getGridStep(zoom);

      const south = Math.max(-85, bounds.getSouth());
      const north = Math.min(85, bounds.getNorth());

      const west = Math.max(-180, bounds.getWest());
      const east = Math.min(180, bounds.getEast());

      const startLat =
        Math.ceil(south / step) * step;

      const startLng =
        Math.ceil(west / step) * step;

      // Latitude lines
      for (
        let lat = startLat;
        lat <= north;
        lat += step
      ) {
        L.polyline(
          [
            [lat, west],
            [lat, east],
          ],
          {
            color: "#ffffff",
            weight: 1,
            opacity: 0.7,
            dashArray: "3,5",
            interactive: false,
          }
        ).addTo(layer);

        L.marker([lat, west], {
          icon: L.divIcon({
            className: "firelens-grid-label",
            html: formatCoordinate(lat, "lat"),
            iconSize: [80, 20],
          }),
          interactive: false,
        }).addTo(layer);
      }

      // Longitude lines
      for (
        let lng = startLng;
        lng <= east;
        lng += step
      ) {
        L.polyline(
          [
            [south, lng],
            [north, lng],
          ],
          {
            color: "#ffffff",
            weight: 1,
            opacity: 0.7,
            dashArray: "3,5",
            interactive: false,
          }
        ).addTo(layer);

        L.marker([north, lng], {
          icon: L.divIcon({
            className: "firelens-grid-label",
            html: formatCoordinate(lng, "lng"),
            iconSize: [80, 20],
          }),
          interactive: false,
        }).addTo(layer);
      }
    }

    drawGrid();

    map.on("moveend zoomend", drawGrid);

    return () => {
      map.off("moveend zoomend", drawGrid);
      map.removeLayer(layer);
    };
  }, [map, visible]);

  return null;
}
