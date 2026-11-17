
import { useState } from "react";
import { Upload, CheckCircle2 } from "lucide-react";
import { parseFirmsCSV } from "../../services/firmsParser";

export default function DataImporter({ onDataLoaded }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleUpload(event, satellite) {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage(`Reading ${satellite} observations...`);

    try {
      const detections = await parseFirmsCSV(file, satellite);

      if (detections.length === 0) {
        throw new Error("No valid FIRMS detections found.");
      }

      onDataLoaded(satellite, detections);

      setMessage(
        `${satellite}: ${detections.length.toLocaleString()} detections loaded`
      );
    } catch (error) {
      console.error(error);
      setMessage(`Import failed: ${error.message}`);
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  return (
    <div className="data-importer">
      <label className="upload-button">
        <Upload size={15} />
        Import MODIS
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={loading}
          onChange={(e) => handleUpload(e, "MODIS")}
          hidden
        />
      </label>

      <label className="upload-button">
        <Upload size={15} />
        Import VIIRS
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={loading}
          onChange={(e) => handleUpload(e, "VIIRS")}
          hidden
        />
      </label>

      {message && (
        <div className="import-message">
          {!loading && <CheckCircle2 size={14} />}
          {message}
        </div>
      )}
    </div>
  );
}
