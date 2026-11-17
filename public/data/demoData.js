
const regions = [
  { lat: 36.7, lon: 3.1 },     // Algeria
  { lat: 37.8, lon: -120 },    // California
  { lat: -10.5, lon: -55 },    // Brazil
  { lat: -15, lon: 30 },       // Zambia
  { lat: -15, lon: 130 },      // Australia
  { lat: 55, lon: 100 },       // Siberia
];

function random(seed) {
  const x = Math.sin(seed * 127.1 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export const demoFires = Array.from({ length: 3000 }, (_, i) => {
  const region = regions[i % regions.length];
  const year = 2020 + Math.floor(random(i + 1) * 5);
  const month = 1 + Math.floor(random(i + 11) * 12);
  const day = 1 + Math.floor(random(i + 21) * 28);

  return {
    id: i,
    latitude: region.lat + (random(i + 31) - 0.5) * 12,
    longitude: region.lon + (random(i + 41) - 0.5) * 12,
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    satellite: i % 2 === 0 ? "MODIS" : "VIIRS",
    frp: Math.round(random(i + 51) * 150),
  };
});
