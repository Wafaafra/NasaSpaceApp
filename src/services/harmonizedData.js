
const parseNumber = (value) => {
  if (value == null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].replace(/^\uFEFF/, "").split(",");

  return lines.slice(1).filter(Boolean).map((line) => {
    const values = line.split(",");
    return Object.fromEntries(
      headers.map((header, index) => [
        header.trim(),
        (values[index] ?? "").trim(),
      ])
    );
  });
}

export async function loadHarmonizedData() {
  const [dailyResponse, gridResponse] = await Promise.all([
    fetch("/data/cell_day_algeria.csv"),
    fetch("/data/grid_cells_algeria.csv"),
  ]);

  if (!dailyResponse.ok || !gridResponse.ok) {
    throw new Error("Could not load harmonization CSV files");
  }

  const [dailyText, gridText] = await Promise.all([
    dailyResponse.text(),
    gridResponse.text(),
  ]);

  const gridRows = parseCSV(gridText);
  const dailyRows = parseCSV(dailyText);

  const gridById = new Map(
    gridRows.map((row) => [
      row.cell_id,
      {
        latMin: parseNumber(row.lat_min),
        latMax: parseNumber(row.lat_max),
        lonMin: parseNumber(row.lon_min),
        lonMax: parseNumber(row.lon_max),
      },
    ])
  );

  return dailyRows
    .map((row) => {
      const grid = gridById.get(row.cell_id);

      return {
        date: row.date,
        cellId: row.cell_id,
        modisCount: parseNumber(row.modis_rows),
        viirsPresent: parseNumber(row.viirs_present),
        viirsRawRows: parseNumber(row.viirs_raw_rows),
        probability: parseNumber(row.p_viirs),
        predictedScaled: parseNumber(row.pred_scaled),
        split: row.split,
        ...grid,
      };
    })
    .filter(
      (row) =>
        row.latMin != null &&
        row.latMax != null &&
        row.lonMin != null &&
        row.lonMax != null
    );
}
