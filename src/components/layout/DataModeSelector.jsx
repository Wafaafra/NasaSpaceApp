
import "./DataModeSelector.css";

export default function DataModeSelector({
  value = "raw",
  onChange,
  harmonizedAvailable = false,
}) {
  return (
    <div className="firelens-data-mode">
      <button
        type="button"
        className={value === "raw" ? "active" : ""}
        onClick={() => onChange("raw")}
      >
        Raw detections
      </button>

      <button
        type="button"
        className={
          value === "harmonized" ? "active" : ""
        }
        onClick={() => onChange("harmonized")}
        disabled={!harmonizedAvailable}
        title={
          harmonizedAvailable
            ? "View harmonized burning activity"
            : "Waiting for harmonization model output"
        }
      >
        Harmonized activity
        {!harmonizedAvailable && (
          <span className="firelens-mode-soon">
            Soon
          </span>
        )}
      </button>
    </div>
  );
}
