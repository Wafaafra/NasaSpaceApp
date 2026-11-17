
export function getAvailableYears(fires) {
  return [...new Set(
    fires.map(fire => Number(fire.date.slice(0, 4)))
  )].sort((a, b) => a - b);
}

export function getDailyActivity(fires, year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();

  const counts = Array(daysInMonth).fill(0);

  fires.forEach(fire => {
    const [y, m, d] = fire.date.split("-").map(Number);

    if (y === year && m === month) {
      counts[d - 1]++;
    }
  });

  return counts.map((count, index) => ({
    day: index + 1,
    count
  }));
}

export function getYearlyActivity(fires) {
  const yearly = {};

  fires.forEach(fire => {
    const year = Number(fire.date.slice(0, 4));
    yearly[year] = (yearly[year] || 0) + 1;
  });

  return Object.entries(yearly)
    .map(([year, count]) => ({
      year: Number(year),
      count
    }))
    .sort((a, b) => a.year - b.year);
}
