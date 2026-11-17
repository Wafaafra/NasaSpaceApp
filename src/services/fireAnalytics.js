
import { booleanPointInPolygon, point } from "@turf/turf";

export function filterFires(fires, aoi, from, to, sensor) {
  return fires.filter((fire) => {
    const matchesDate =
      (!from || fire.date >= from) &&
      (!to || fire.date <= to);

    const matchesSensor =
      sensor === "raw" ||
      (sensor === "modis" && fire.satellite === "MODIS") ||
      (sensor === "viirs" && fire.satellite === "VIIRS");

    const matchesArea =
      !aoi ||
      booleanPointInPolygon(
        point([fire.longitude, fire.latitude]),
        aoi
      );

    return matchesDate && matchesSensor && matchesArea;
  });
}

export function calculateStats(fires) {
  if (fires.length === 0) {
    return {
      total: 0,
      annualAverage: 0,
      peakMonth: "—",
    };
  }

  const yearly = {};
  const monthly = {};

  fires.forEach((fire) => {
    const year = fire.date.slice(0, 4);
    const month = fire.date.slice(5, 7);

    yearly[year] = (yearly[year] || 0) + 1;
    monthly[month] = (monthly[month] || 0) + 1;
  });

  const peak = Object.entries(monthly)
    .sort((a, b) => b[1] - a[1])[0];

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr",
    "May", "Jun", "Jul", "Aug",
    "Sep", "Oct", "Nov", "Dec",
  ];

  return {
    total: fires.length,
    annualAverage: Math.round(
      fires.length / Object.keys(yearly).length
    ),
    peakMonth: monthNames[Number(peak[0]) - 1],
  };
}

export function getMonthlyActivity(fires) {
  const counts = Array(12).fill(0);

  fires.forEach((fire) => {
    const month = Number(fire.date.slice(5, 7)) - 1;
    counts[month]++;
  });

  const names = [
    "Jan", "Feb", "Mar", "Apr",
    "May", "Jun", "Jul", "Aug",
    "Sep", "Oct", "Nov", "Dec",
  ];

  return names.map((month, index) => ({
    month,
    hotspots: counts[index],
  }));
}
