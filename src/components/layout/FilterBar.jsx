
export default function FilterBar({
  from,
  to,
  sensor,
  onFromChange,
  onToChange,
  onSensorChange,
}) {
  return (
    <section className="filter-bar">
      <div className="filter-group">
        <label>LOCATION</label>
        <input
          placeholder="Draw an AOI on the map"
          disabled
        />
      </div>

      <div className="filter-group">
        <label>FROM</label>
        <input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
        />
      </div>

      <div className="filter-group">
        <label>TO</label>
        <input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
        />
      </div>

      <div className="filter-group">
        <label>DATA VIEW</label>
        <select
          value={sensor}
          onChange={(e) => onSensorChange(e.target.value)}
        >
          <option value="raw">Both sensors</option>
          <option value="modis">MODIS only</option>
          <option value="viirs">VIIRS only</option>
        </select>
      </div>
    </section>
  );
}
