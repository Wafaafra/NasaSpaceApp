
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapPin,
  Search,
  Crosshair,
  Bookmark,
  Trash2,
  X,
  ChevronDown,
  Navigation,
  Save,
  Globe2,
} from "lucide-react";


import L from "leaflet";
import { countries } from "../../services/countries";
import "./LocationWidget.css";

const STORAGE_KEY = "firelens-saved-locations";

function readSavedLocations() {
  try {
    const data = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]"
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function countryName(country) {
  if (typeof country === "string") return country;

  return String(
    country.name ||
    country.properties?.name ||
    country.properties?.ADMIN ||
    country.label ||
    country.country ||
    country.id ||
    "Unknown country"
  );
}

function countryGeometry(country) {
  if (!country || typeof country !== "object") {
    return null;
  }

  const candidates = [
    country,
    country.geojson,
    country.feature,
    country.geometry,
  ];

  return (
    candidates.find(
      (item) =>
        item &&
        typeof item === "object" &&
        ["Feature", "FeatureCollection", "Polygon", "MultiPolygon"]
          .includes(item.type)
    ) || null
  );
}

export default function LocationWidget({
  selectedLocation = null,
  onSelectLocation,
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("find");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [saved, setSaved] = useState(readSavedLocations);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCountries, setShowCountries] = useState(true);

  const rootRef = useRef(null);
  const requestRef = useRef(null);

  const filteredCountries = useMemo(() => {
    const list = Array.isArray(countries) ? countries : [];
    const search = query.trim().toLowerCase();

    return [...list]
      .filter((country) =>
        countryName(country).toLowerCase().includes(search)
      )
      .sort((a, b) =>
        countryName(a).localeCompare(countryName(b))
      );
  }, [query]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(saved)
      );
    } catch (err) {
      console.error("Could not save locations:", err);
    }
  }, [saved]);

  useEffect(() => {
    if (!open) return;

    function handleOutside(event) {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener(
        "pointerdown",
        handleOutside
      );
      document.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, [open]);

  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

  function selectLocation(location) {
    onSelectLocation?.(location);
    setError("");
    setOpen(false);
  }

  async function fetchLocations(text, controller) {
    const params = new URLSearchParams({
      q: text,
      format: "jsonv2",
      limit: "5",
      addressdetails: "1",
    });

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      }
    );

    if (!response.ok) {
      throw new Error(
        "Location search is temporarily unavailable."
      );
    }

    const data = await response.json();

    return data
      .map((item) => ({
        id: `osm-${item.place_id}`,
        name: item.display_name,
        lat: Number(item.lat),
        lng: Number(item.lon),
        bbox: item.boundingbox
          ? [
              Number(item.boundingbox[0]),
              Number(item.boundingbox[2]),
              Number(item.boundingbox[1]),
              Number(item.boundingbox[3]),
            ]
          : null,
      }))
      .filter(
        (item) =>
          Number.isFinite(item.lat) &&
          Number.isFinite(item.lng)
      );
  }

  async function searchLocation(event) {
    event.preventDefault();

    const text = query.trim();
    if (text.length < 2 || loading) return;

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setLoading(true);
    setError("");
    setResults([]);

    try {
      const locations = await fetchLocations(
        text,
        controller
      );

      setResults(locations);

      if (!locations.length) {
        setError("No locations found. Try another name.");
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.message || "Search failed.");
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }

  async function selectCountry(country) {
    const name = countryName(country);
    const geometry = countryGeometry(country);

    // Use local country geometry when available.
    if (geometry) {
      try {
        const bounds = L.geoJSON(geometry).getBounds();

        if (bounds.isValid()) {
          const center = bounds.getCenter();

          selectLocation({
            id: `country-${name}`,
            name,
            lat: center.lat,
            lng: center.lng,
            bbox: [
              bounds.getSouth(),
              bounds.getWest(),
              bounds.getNorth(),
              bounds.getEast(),
            ],
          });
          return;
        }
      } catch (err) {
        console.warn("Country geometry unavailable:", err);
      }
    }

    // Fall back to place search for name-only countries.
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setLoading(true);
    setError("");

    try {
      const matches = await fetchLocations(
        name,
        controller
      );

      if (!matches.length) {
        setError(`Could not locate ${name}.`);
        return;
      }

      selectLocation({
        ...matches[0],
        id: `country-${name}`,
        name,
      });
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.message || "Country lookup failed.");
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }

  function detectCurrentLocation() {
    if (!navigator.geolocation) {
      setError("Your browser does not support geolocation.");
      return;
    }

    setLoading(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        selectLocation({
          id: "current-location",
          name: "My current location",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          zoom: 12,
        });

        setLoading(false);
      },
      (err) => {
        setError(
          err.code === 1
            ? "Location permission denied. Enable it in your browser."
            : "Could not determine your location."
        );
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      }
    );
  }

  function saveLocation(location = selectedLocation) {
    if (!location) return;

    const lat = Number(location.lat);
    const lng = Number(location.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    setSaved((previous) => {
      const exists = previous.some(
        (item) =>
          Number(item.lat).toFixed(5) === lat.toFixed(5) &&
          Number(item.lng).toFixed(5) === lng.toFixed(5)
      );

      if (exists) return previous;

      return [
        ...previous,
        {
          ...location,
          lat,
          lng,
          id: `saved-${Date.now()}`,
        },
      ];
    });
  }

  function removeLocation(id) {
    setSaved((previous) =>
      previous.filter((location) => location.id !== id)
    );
  }

  return (
    <div className="fl-location-widget" ref={rootRef}>
      <button
        type="button"
        className={`fl-location-trigger fl-location-icon-only ${open ? "active" : ""}`}
        onClick={() => setOpen((previous) => !previous)}
        aria-label="Open Location Explorer"
        title="Location"
        aria-expanded={open}
        aria-controls="firelens-location-explorer"
      >
        <MapPin size={20} strokeWidth={2.2} aria-hidden="true" />
      </button>

      {open && (
        <div id="firelens-location-explorer" className="fl-location-panel">
          <div className="fl-location-heading">
            <div>
              <strong>Location Explorer</strong>
              <p>Search, discover and save places</p>
            </div>

            <button
              type="button"
              className="fl-location-close"
              onClick={() => setOpen(false)}
              aria-label="Close location explorer"
            >
              <X size={17} />
            </button>
          </div>

          <div className="fl-location-tabs">
            <button
              type="button"
              className={tab === "find" ? "active" : ""}
              onClick={() => {
                setTab("find");
                setError("");
              }}
            >
              <Search size={15} />
              Find
            </button>

            <button
              type="button"
              className={tab === "current" ? "active" : ""}
              onClick={() => {
                setTab("current");
                setError("");
              }}
            >
              <Crosshair size={15} />
              Current
            </button>

            <button
              type="button"
              className={tab === "saved" ? "active" : ""}
              onClick={() => {
                setTab("saved");
                setError("");
              }}
            >
              <Bookmark size={15} />
              Saved
            </button>
          </div>

          {/* FIND LOCATION */}
          {tab === "find" && (
            <div className="fl-location-content">
              <form
                className="fl-location-search"
                onSubmit={searchLocation}
              >
                <Search size={17} />

                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setResults([]);
                    setError("");
                  }}
                  placeholder="Country, city, or place..."
                  aria-label="Search for a location"
                />

                <button
                  type="submit"
                  disabled={
                    loading || query.trim().length < 2
                  }
                >
                  {loading ? "..." : "Go"}
                </button>
              </form>

              {/* SEARCH RESULTS */}
              {results.length > 0 && (
                <div className="fl-location-results">
                  {results.map((location) => (
                    <button
                      type="button"
                      key={location.id}
                      className="fl-location-result"
                      onClick={() => selectLocation(location)}
                    >
                      <MapPin size={17} />
                      <span>{location.name}</span>
                      <Navigation size={15} />
                    </button>
                  ))}
                </div>
              )}

              {/* ALL COUNTRIES */}
              <div className="fl-countries-section">
                <button
                  type="button"
                  className="fl-countries-heading"
                  onClick={() =>
                    setShowCountries((value) => !value)
                  }
                >
                  <span>
                    <Globe2 size={16} />
                    All countries
                    <small>
                      ({filteredCountries.length})
                    </small>
                  </span>

                  <ChevronDown
                    size={16}
                    style={{
                      transform: showCountries
                        ? "rotate(180deg)"
                        : "rotate(0deg)",
                    }}
                  />
                </button>

                {showCountries && (
                  <div className="fl-countries-list">
                    {filteredCountries.length === 0 ? (
                      <p className="fl-location-empty">
                        No matching countries.
                      </p>
                    ) : (
                      filteredCountries.map((country, index) => {
                        const name = countryName(country);

                        return (
                          <button
                            key={`${name}-${index}`}
                            type="button"
                            className="fl-country-item"
                            onClick={() =>
                              selectCountry(country)
                            }
                            disabled={loading}
                          >
                            <MapPin size={15} />
                            <span>{name}</span>
                            <Navigation size={14} />
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <p className="fl-location-hint">
                Search for any country, city, or place,
                or select a country from the list.
              </p>
            </div>
          )}

          {/* CURRENT LOCATION */}
          {tab === "current" && (
            <div className="fl-location-content">
              <div className="fl-location-current-icon">
                <Crosshair size={29} />
              </div>

              <h4>Find your current location</h4>

              <p className="fl-location-description">
                Allow your browser to access your location
                and the map will zoom to your position.
              </p>

              <button
                type="button"
                className="fl-location-primary"
                onClick={detectCurrentLocation}
                disabled={loading}
              >
                <Crosshair size={17} />
                {loading
                  ? "Locating..."
                  : "Detect my location"}
              </button>
            </div>
          )}

          {/* SAVED LOCATIONS */}
          {tab === "saved" && (
            <div className="fl-location-content">
              {selectedLocation && (
                <button
                  type="button"
                  className="fl-location-primary"
                  onClick={() => saveLocation()}
                >
                  <Save size={16} />
                  Save selected location
                </button>
              )}

              {saved.length === 0 ? (
                <p className="fl-location-empty">
                  No saved locations yet. Search for a
                  place or click on the map, then save
                  it here.
                </p>
              ) : (
                <div className="fl-location-saved-list">
                  {saved.map((location) => (
                    <div
                      className="fl-location-saved-item"
                      key={location.id}
                    >
                      <button
                        type="button"
                        className="fl-location-saved-name"
                        onClick={() =>
                          selectLocation(location)
                        }
                      >
                        <MapPin size={16} />
                        <span>{location.name}</span>
                      </button>

                      <button
                        type="button"
                        className="fl-location-delete"
                        onClick={() =>
                          removeLocation(location.id)
                        }
                        aria-label={`Delete ${location.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SELECTED LOCATION */}
          {selectedLocation && (
            <div className="fl-location-selected">
              <div>
                <strong>Selected location</strong>
                <p>{selectedLocation.name}</p>

                <small>
                  {Number(selectedLocation.lat).toFixed(4)},
                  {" "}
                  {Number(selectedLocation.lng).toFixed(4)}
                </small>
              </div>

              <button
                type="button"
                onClick={() => saveLocation()}
                title="Save location"
                aria-label="Save selected location"
              >
                <Bookmark size={18} />
              </button>
            </div>
          )}

          {error && (
            <p className="fl-location-error">
              {error}
            </p>
          )}

          <div className="fl-location-footer">
            Click on the map to select any location.
            <span> Search by OpenStreetMap</span>
          </div>
        </div>
      )}
    </div>
  );
}
