
import { useEffect, useRef, useState } from "react";
import { Layers, ChevronDown, Check } from "lucide-react";
import "./MapBackgroundSelector.css";

const backgrounds = [
  {
    id: "streets",
    label: "Streets",
    image:
      "https://a.tile.openstreetmap.org/5/16/11.png",
  },
  {
    id: "satellite",
    label: "Satellite",
    image:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/5/11/16",
  },
  {
    id: "firefly",
    label: "Firefly",
    image:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/5/11/16",
  },
  {
    id: "blueMarble",
    label: "Blue Marble",
    image: null,
  },
];

export default function MapBackgroundSelector({
  value = "streets",
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;

    const handleOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className="map-layers-widget" ref={ref}>
      <button
        type="button"
        className={`map-layers-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
      >
        <Layers size={17} />
        <span>Layers</span>
        <ChevronDown size={15} />
      </button>

      {open && (
        <div className="map-layers-dropdown">
          <div className="map-layers-dropdown-header">
            Map backgrounds
          </div>

          {backgrounds.map((background) => (
            <button
              key={background.id}
              type="button"
              className={`map-layers-option ${
                value === background.id ? "active" : ""
              }`}
              onClick={() => {
                onChange(background.id);
                setOpen(false);
              }}
            >
              <span
                className={`map-layer-preview ${
                  background.id === "firefly"
                    ? "firefly-preview"
                    : ""
                } ${
                  background.id === "blueMarble"
                    ? "blue-marble-preview"
                    : ""
                }`}
                style={
                  background.image
                    ? {
                        backgroundImage: `url("${background.image}")`,
                      }
                    : {}
                }
              />

              <span className="map-layer-label">
                {background.label}
              </span>

              {value === background.id && (
                <Check size={16} className="map-layer-check" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
