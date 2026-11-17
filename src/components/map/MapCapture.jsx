
import { useEffect, useRef, useState } from "react";
import { Camera, X, Download } from "lucide-react";
import { toJpeg, toPng } from "html-to-image";
import "./MapCapture.css";

export default function MapCapture() {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState("jpg");
  const [includeHeader, setIncludeHeader] = useState(true);
  const [includeTimestamp, setIncludeTimestamp] = useState(true);
  const [includeScale, setIncludeScale] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState("");

  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event) {
      if (!panelRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function captureMap() {
    const map = document.querySelector(".firelens-map");

    if (!map) {
      setError("Map not found.");
      return;
    }

    setCapturing(true);
    setError("");

    let overlay = null;
    const widget = panelRef.current;
    const scale = map.querySelector(".leaflet-control-scale");
    const previousScaleDisplay = scale?.style.display ?? "";
    const previousWidgetVisibility = widget?.style.visibility ?? "";

    try {
      overlay = document.createElement("div");
      overlay.className = "firelens-capture-overlay";

      if (includeHeader) {
        const header = document.createElement("div");
        header.className = "firelens-capture-header";
        header.textContent = "FireLens | Wildfire Activity";
        overlay.appendChild(header);
      }

      if (includeTimestamp) {
        const timestamp = document.createElement("div");
        timestamp.className = "firelens-capture-timestamp";
        timestamp.textContent =
          "Captured: " + new Date().toLocaleString();
        overlay.appendChild(timestamp);
      }

      if (overlay.childNodes.length > 0) {
        map.appendChild(overlay);
      }

      if (widget) widget.style.visibility = "hidden";
      if (scale && !includeScale) scale.style.display = "none";

      await new Promise((resolve) => setTimeout(resolve, 250));

      const options = {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: false,
        filter: (node) =>
          !node.classList?.contains("firelens-capture-widget"),
      };

      const dataUrl =
        format === "png"
          ? await toPng(map, options)
          : await toJpeg(map, options);

      const link = document.createElement("a");
      link.download = `FireLens_${new Date()
        .toISOString()
        .slice(0, 10)}.${format}`;

      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setOpen(false);
    } catch (err) {
      console.error("Map capture failed:", err);
      setError(
        "Could not capture the map. Some map tiles may block screenshots."
      );
    } finally {
      overlay?.remove();

      if (widget) {
        widget.style.visibility = previousWidgetVisibility;
      }

      if (scale) {
        scale.style.display = previousScaleDisplay;
      }

      setCapturing(false);
    }
  }

  return (
    <div className="firelens-capture-widget" ref={panelRef}>
      <button
        type="button"
        className={`firelens-capture-trigger ${open ? "active" : ""}`}
        onClick={() => {
          setOpen((previous) => !previous);
          setError("");
        }}
        aria-label="Capture map"
        title="Capture map"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Camera size={19} strokeWidth={2} />
      </button>

      {open && (
        <div
          className="firelens-capture-panel"
          role="dialog"
          aria-label="Capture map settings"
        >
          <div className="firelens-capture-heading">
            <div>
              <strong>Capture map</strong>
              <p>Download your current map view</p>
            </div>

            <button
              type="button"
              className="firelens-capture-close"
              onClick={() => setOpen(false)}
              aria-label="Close capture panel"
            >
              <X size={17} />
            </button>
          </div>

          <div className="firelens-capture-content">
            <label
              className="firelens-capture-label"
              htmlFor="firelens-capture-format"
            >
              Image format
            </label>

            <select
              id="firelens-capture-format"
              value={format}
              onChange={(event) => setFormat(event.target.value)}
            >
              <option value="jpg">JPG</option>
              <option value="png">PNG</option>
            </select>

            <div className="firelens-capture-options">
              <label>
                <input
                  type="checkbox"
                  checked={includeHeader}
                  onChange={(event) =>
                    setIncludeHeader(event.target.checked)
                  }
                />
                Include title
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={includeTimestamp}
                  onChange={(event) =>
                    setIncludeTimestamp(event.target.checked)
                  }
                />
                Include timestamp
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={includeScale}
                  onChange={(event) =>
                    setIncludeScale(event.target.checked)
                  }
                />
                Include scale bar
              </label>
            </div>

            <button
              type="button"
              className="firelens-capture-download"
              onClick={captureMap}
              disabled={capturing}
            >
              <Download size={17} />
              {capturing ? "Capturing..." : "Download image"}
            </button>

            {error && (
              <p className="firelens-capture-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
