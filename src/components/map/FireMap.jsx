import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  MapContainer,
  TileLayer,
  WMSTileLayer,
  ZoomControl,
  ScaleControl,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";

import L from "leaflet";

import MapGraticule from "./MapGraticule";
import MapCapture from "./MapCapture";
import AOIDrawing from "./AOIDrawing";
import HotspotLayer from "./HotspotLayer";
import HarmonizedLayer from "./HarmonizedLayer";
import { Layers, Grid3X3, Upload } from "lucide-react";

import "leaflet/dist/leaflet.css";
import "./FireMapToolbar.css";

const MemoHotspotLayer = memo(HotspotLayer);
const MemoHarmonizedLayer = memo(HarmonizedLayer);
const MemoGraticule = memo(MapGraticule);

const MAP_CENTER = [28, 3];
const MAP_STYLE = { width: "100%", height: "100%" };

function BackgroundLayer({ background }) {
  switch (background) {
    case "firefly":
      return (
        <TileLayer
          key="firefly"
          attribution="Imagery &copy; Esri and contributors"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={18}
          className="firefly-tiles"
        />
      );

    case "blueMarble":
      return (
        <WMSTileLayer
          key="blueMarble"
          url="https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi"
          layers="BlueMarble_NextGeneration"
          format="image/jpeg"
          transparent={false}
          version="1.1.1"
          attribution="NASA GIBS / Blue Marble"
          maxZoom={18}
        />
      );

    case "satellite":
      return (
        <TileLayer
          key="satellite"
          attribution="Imagery &copy; Esri and contributors"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={18}
        />
      );

    default:
      return (
        <TileLayer
  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  attribution='&copy; OpenStreetMap contributors'
  maxZoom={19}
/>
      );
  }
}

const MemoBackgroundLayer = memo(BackgroundLayer);

function CountryZoom({ country }) {
  const map = useMap();

  useEffect(() => {
    if (!country) return;

    try {
      const bounds = L.geoJSON(country).getBounds();

      if (bounds.isValid()) {
        map.flyToBounds(bounds, {
          padding: [60, 60],
          maxZoom: 8,
          duration: 1.4,
        });
      }
    } catch (error) {
      console.error("Country zoom failed:", error);
    }
  }, [country, map]);

  return null;
}

const MemoCountryZoom = memo(CountryZoom);

function LocationNavigation({ location }) {
  const map = useMap();

  useEffect(() => {
    if (!location) return;

    const lat = Number(location.lat);
    const lng = Number(location.lng);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return;
    }

    const bbox = location.bbox;

    if (
      Array.isArray(bbox) &&
      bbox.length === 4 &&
      bbox.every((value) => Number.isFinite(Number(value)))
    ) {
      const bounds = L.latLngBounds(
        [Number(bbox[0]), Number(bbox[1])],
        [Number(bbox[2]), Number(bbox[3])]
      );

      if (bounds.isValid()) {
        map.flyToBounds(bounds, {
          padding: [45, 45],
          maxZoom: 12,
          duration: 1.2,
        });
        return;
      }
    }

    const requestedZoom = Number(location.zoom);

    const zoom =
      Number.isFinite(requestedZoom) && requestedZoom > 0
        ? requestedZoom
        : 11;

    map.flyTo([lat, lng], zoom, { duration: 1.2 });
  }, [location, map]);

  return null;
}

const MemoLocationNavigation = memo(LocationNavigation);

function MapLocationPicker({ onPick }) {
  const map = useMap();

  useMapEvents({
    click(event) {
      if (!onPick) return;

      const target = event.originalEvent?.target;

      if (
        typeof Element !== "undefined" &&
        target instanceof Element &&
        target.closest(
          ".leaflet-marker-icon, .leaflet-interactive, .leaflet-control, .leaflet-popup"
        )
      ) {
        return;
      }

      if (
        map._toolbars &&
        Object.values(map._toolbars).some(
          (toolbar) => toolbar?._activeMode
        )
      ) {
        return;
      }

      const { lat, lng } = event.latlng;

      onPick({
        id: `map-${Date.now()}`,
        name: `Selected point (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        lat,
        lng,
        zoom: map.getZoom(),
      });
    },
  });

  return null;
}

const MemoLocationPicker = memo(MapLocationPicker);

const locationIcon = L.divIcon({
  className: "firelens-location-marker",
  html: `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M15 1.5C7.5 1.5 1.5 7.5 1.5 15c0 10.4 13.5 23 13.5 23s13.5-12.6 13.5-23C28.5 7.5 22.5 1.5 15 1.5Z" fill="#f47735" stroke="white" stroke-width="2.5"/><circle cx="15" cy="15" r="5" fill="white"/></svg>`,
  iconSize: [30, 40], iconAnchor: [15, 39], popupAnchor: [0, -36],
});

function MapResize() {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(timer);
  }, [map]);

  return null;
}

export default function FireMap({
  fires = [],
  country = null,
  onAOIChange,
  selectedLocation = null,
  onSelectLocation,
  onOpenImport,

  // New harmonization properties
  dataMode = "raw",
  harmonizedData = [],
  startDate,
  endDate,
}) {
  const [background, setBackground] = useState("firefly");
  const [layersOpen, setLayersOpen] = useState(false);
  const [showGrid, setShowGrid] = useState(false);


  const handleAOIChange = useCallback(
    (geojson) => {
      onAOIChange?.(geojson);
    },
    [onAOIChange]
  );

  const validSelectedLocation = useMemo(() => {
    if (!selectedLocation) return null;

    const lat = Number(selectedLocation.lat);
    const lng = Number(selectedLocation.lng);

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

    return { ...selectedLocation, lat, lng };
  }, [selectedLocation]);

  return (
    <div
      className="firelens-map"
      style={{ position: "relative", ...MAP_STYLE }}
    >
      <MapContainer
        center={MAP_CENTER}
        zoom={5}
        minZoom={2}
        maxZoom={18}
        zoomControl={false}
        scrollWheelZoom
        preferCanvas
        style={MAP_STYLE}
      >
        <MemoBackgroundLayer background={background} />
        <MemoGraticule visible={showGrid} />

        <MemoCountryZoom country={country} />
        <MemoLocationNavigation location={validSelectedLocation} />
        <MemoLocationPicker onPick={onSelectLocation} />

        {validSelectedLocation && (
          <Marker
            position={[
              validSelectedLocation.lat,
              validSelectedLocation.lng,
            ]}
            icon={locationIcon}
          >
            <Popup>
              <div style={{ minWidth: "170px" }}>
                <strong>
                  {validSelectedLocation.name || "Selected location"}
                </strong>

                <p style={{ marginBottom: 0 }}>
                  Latitude: {validSelectedLocation.lat.toFixed(5)}
                  <br />
                  Longitude: {validSelectedLocation.lng.toFixed(5)}
                </p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Switch between raw hotspots and AI predictions */}
        {dataMode === "harmonized" ? (
          <MemoHarmonizedLayer
            records={harmonizedData}
            startDate={startDate}
            endDate={endDate}
          />
        ) : (
          <MemoHotspotLayer fires={fires} />
        )}

        <AOIDrawing onAOIChange={handleAOIChange} />

        <ZoomControl position="bottomright" />
        <ScaleControl position="bottomleft" />
        <MapResize />
      </MapContainer>

      {/* Unified vertical map toolbar */}
      <div className="firelens-compact-map-tools firelens-tools-unified">
        <div className="firelens-map-layers-control firelens-tools-layers">
          <button
            type="button"
            className={`firelens-layers-icon-button ${layersOpen ? "active" : ""}`}
            title="Map backgrounds"
            aria-label="Map backgrounds"
            aria-expanded={layersOpen}
            onClick={() => setLayersOpen((open) => !open)}
          >
            <Layers size={19} strokeWidth={2} />
          </button>

          {layersOpen && (
            <div className="firelens-map-layers-menu firelens-tools-layers-menu">
              <span className="firelens-layers-heading">MAP BACKGROUNDS</span>
              {[
                { id: "streets", label: "Streets", preview: "https://tile.openstreetmap.org/5/16/11.png" },
                { id: "firefly", label: "Imagery", preview: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/4/6/8" },
                { id: "blueMarble", label: "Blue Marble", preview: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/3/4/3.jpg" },
              ].map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={background === item.id ? "selected" : ""}
                  onClick={() => {
                    setBackground(item.id);
                    setLayersOpen(false);
                  }}
                >
                  <img src={item.preview} alt="" loading="lazy" />
                  <span>{item.label}</span>
                  {background === item.id && (
                    <span className="firelens-layer-check">✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="firelens-capture-compact" title="Capture map">
          <MapCapture />
        </div>

        <button
          type="button"
          title="Toggle latitude and longitude grid"
          aria-label="Toggle latitude and longitude grid"
          aria-pressed={showGrid}
          className={showGrid ? "active" : ""}
          onClick={() => setShowGrid((value) => !value)}
        >
          <Grid3X3 size={19} />
        </button>

        <button
          type="button"
          className="firelens-import-tool"
          title="Import MODIS / VIIRS data"
          aria-label="Import MODIS or VIIRS data"
          onClick={() => onOpenImport?.()}
        >
          <Upload size={19} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
