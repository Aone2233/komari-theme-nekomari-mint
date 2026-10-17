export function chartSegments(
  points: { time: string; value: number | null }[],
  start: number,
  end: number,
  max: number,
  gapMs: number,
): string[] {
  const paths: string[] = [];
  let path = "",
    last = -Infinity;
  for (const point of [...points].sort(
    (a, b) => Date.parse(a.time) - Date.parse(b.time),
  )) {
    const time = Date.parse(point.time);
    if (!Number.isFinite(time) || time < start || time > end) continue;
    if (
      point.value === null ||
      !Number.isFinite(point.value) ||
      point.value < 0
    ) {
      if (path) paths.push(path);
      path = "";
      last = -Infinity;
      continue;
    }
    if (time - last > gapMs && path) {
      paths.push(path);
      path = "";
    }
    const x = ((time - start) / (end - start)) * 400,
      y = 89 - Math.min(1, point.value / max) * 83;
    path += `${path ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    // A second tiny segment keeps isolated real samples visible without bridging gaps.
    path += `L${(x + 0.2).toFixed(1)},${y.toFixed(1)}`;
    last = time;
  }
  if (path) paths.push(path);
  return paths;
}
