
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

export default function AOIDrawing({ onAOIChange }) {
  const map = useMap();

  const activeLayerRef = useRef(null);
  const onAOIChangeRef = useRef(onAOIChange);

  // Always use the latest callback.
  useEffect(() => {
    onAOIChangeRef.current = onAOIChange;
  }, [onAOIChange]);

  useEffect(() => {
    if (!map.pm) {
      console.error(
        "Leaflet Geoman is not initialized."
      );
      return;
    }

    // Enable AOI drawing controls.
    map.pm.addControls({
      position: "topleft",

      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawCircle: false,
      drawText: false,

      drawPolygon: true,
      drawRectangle: true,

      editMode: true,
      dragMode: false,
      cutPolygon: false,
      removalMode: true,
      rotateMode: false,
    });

    // Send the selected area to Dashboard.
    function updateAOI() {
      const layer = activeLayerRef.current;

      if (!layer) {
        onAOIChangeRef.current?.(null);
        return;
      }

      const geojson = layer.toGeoJSON();

      onAOIChangeRef.current?.(geojson);
    }

    // When the user draws a new region.
    function handleCreate(event) {
      const layer = event.layer;

      // Remove the previous region.
      const previous = activeLayerRef.current;

      if (previous && map.hasLayer(previous)) {
        map.removeLayer(previous);
      }

      activeLayerRef.current = layer;

      // Style the selected region.
      if (layer.setStyle) {
        layer.setStyle({
          color: "#ff4500",
          weight: 3,
          fillColor: "#ff4500",
          fillOpacity: 0.12,
        });
      }

      updateAOI();
    }

    // When the user edits the polygon.
    function handleEdit(event) {
      if (
        event.layer === activeLayerRef.current
      ) {
        updateAOI();
      }
    }

    // When the user removes the region.
    function handleRemove(event) {
      if (
        event.layer === activeLayerRef.current
      ) {
        activeLayerRef.current = null;

        onAOIChangeRef.current?.(null);
      }
    }

    // Register Geoman events.
    map.on("pm:create", handleCreate);
    map.on("pm:edit", handleEdit);
    map.on("pm:remove", handleRemove);

    // Cleanup.
    return () => {
      map.off("pm:create", handleCreate);
      map.off("pm:edit", handleEdit);
      map.off("pm:remove", handleRemove);

      map.pm.removeControls();
    };
  }, [map]);

  return null;
}
