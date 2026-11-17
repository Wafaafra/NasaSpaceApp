
export function compareWithHistoricalMedian(
  rows,
  selectedRow
) {
  if (!selectedRow || selectedRow.count === null) {
    return null;
  }

  // Compare only the same calendar month.
  // Exclude the selected year from the baseline.
  const historicalCounts = rows
    .filter(row =>
      row.monthNumber === selectedRow.monthNumber &&
      row.year !== selectedRow.year &&
      row.count !== null
    )
    .map(row => row.count)
    .sort((a, b) => a - b);

  // Require at least 3 comparison years.
  if (historicalCounts.length < 3) {
    return null;
  }

  const middle = Math.floor(historicalCounts.length / 2);

  const median = historicalCounts.length % 2 === 0
    ? (historicalCounts[middle - 1] +
       historicalCounts[middle]) / 2
    : historicalCounts[middle];

  const difference = selectedRow.count - median;

  const percentage = median > 0
    ? (difference / median) * 100
    : null;

  return {
    median,
    difference,
    percentage,
    yearsCompared: historicalCounts.length,
    status:
      difference > 0
        ? "Above historical median"
        : difference < 0
          ? "Below historical median"
          : "Equal to historical median"
  };
}
