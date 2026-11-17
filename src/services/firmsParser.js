
import Papa from "papaparse";

export function parseFirmsCSV(file, satellite) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,

      complete: (results) => {
        const detections = results.data
          .map((row, index) => {
            const latitude = Number(row.latitude);
            const longitude = Number(row.longitude);
            const frp = Number(row.frp);
            const date = String(row.acq_date || "").trim();

            const typeValue = String(row.type ?? "").trim();
            const type = typeValue === "" ? null : Number(typeValue);

            const confidence = String(row.confidence ?? "")
              .trim()
              .toLowerCase();

            if (
              !Number.isFinite(latitude) ||
              !Number.isFinite(longitude) ||
              latitude < -90 ||
              latitude > 90 ||
              longitude < -180 ||
              longitude > 180 ||
              !/^\d{4}-\d{2}-\d{2}$/.test(date)
            ) {
              return null;
            }

            // Keep vegetation fires only
            if (type !== 0) return null;

            // Apply sensor-specific confidence filters
            if (satellite.toUpperCase() === "VIIRS") {
              if (!["n", "h"].includes(confidence)) return null;
            }

            if (satellite.toUpperCase() === "MODIS") {
              const score = Number(confidence);
              if (!Number.isFinite(score) || score <= 30) {
                return null;
              }
            }

            return {
              id: `${satellite}-${index}`,
              latitude,
              longitude,
              date,
              satellite,
              type,
              frp: Number.isFinite(frp) ? frp : null,
              confidence,
              acquisitionTime: row.acq_time,
            };
          })
          .filter(Boolean);

        resolve(detections);
      },

      error: reject,
    });
  });
}
