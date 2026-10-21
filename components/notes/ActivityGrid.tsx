'use client';

import { useId } from 'react';
import {
  dayLabel, gridLevel, gridSummary, keyToDate, monthLabels, weekTotals, type CreatedGrid, type DayKey, type GridLevel,
} from '@/lib/metrics';

// Shades of the one accent on the card; both themes redefine these tokens (CNOTE-15)
const LEVEL_FILL: Record<GridLevel, string> = {
  0: 'fill-canvas-soft',
  1: 'fill-primary-pale',
  2: 'fill-primary/50',
  3: 'fill-primary/75',
  4: 'fill-primary',
};

const CELL = 14;
const STEP = 17;
const LEFT = 28;
const TOP = 16;
const WEEKDAY_LABELS: [number, string][] = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']];

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const shortDate = (key: DayKey) => keyToDate(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// Notes created per day, GitHub-style: a column per week, Sunday at the top, today last.
// Hand-rolled SVG with design-token fills; the per-week table carries the same data as text.
export function ActivityGrid({ grid }: { grid: CreatedGrid }) {
  const id = useId();
  const width = LEFT + grid.weeks.length * STEP - (STEP - CELL);
  const height = TOP + 7 * STEP - (STEP - CELL);
  const summary = gridSummary(grid);
  const totals = weekTotals(grid);

  return (
    <div className="flex flex-col gap-3">
      <p id={`${id}-summary`} className="text-body-sm text-body">{summary}</p>
      <svg
        role="img"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-summary`}
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full max-w-md"
      >
        <title id={`${id}-title`}>Notes created per day</title>
        <g className="fill-current text-body" fontSize={10}>
          {monthLabels(grid).map(({ column, label }) => (
            <text key={column} x={LEFT + column * STEP} y={TOP - 5}>
              {label}
            </text>
          ))}
          {WEEKDAY_LABELS.map(([row, label]) => (
            <text key={label} x={0} y={TOP + row * STEP + CELL - 3}>
              {label}
            </text>
          ))}
        </g>
        {grid.weeks.map((week, column) =>
          week.map((cell, row) =>
            cell === null ? null : (
              <rect
                key={cell.key}
                x={LEFT + column * STEP}
                y={TOP + row * STEP}
                width={CELL}
                height={CELL}
                rx={3}
                className={LEVEL_FILL[gridLevel(cell.count, grid.max)]}
              >
                <title>{`${dayLabel(cell.key)}: ${plural(cell.count, 'note', 'notes')} created`}</title>
              </rect>
            ),
          ),
        )}
      </svg>
      <div aria-hidden className="flex items-center gap-1.5 text-caption text-body">
        Less
        <svg viewBox={`0 0 ${5 * STEP - (STEP - CELL)} ${CELL}`} className="h-3.5 w-auto">
          {([0, 1, 2, 3, 4] as const).map((level) => (
            <rect key={level} x={level * STEP} width={CELL} height={CELL} rx={3} className={LEVEL_FILL[level]} />
          ))}
        </svg>
        More
      </div>
      <details className="text-body-sm text-body">
        <summary className="flex min-h-11 cursor-pointer items-center rounded-sm font-semibold text-ink">
          Notes created per week
        </summary>
        <table className="mt-2 w-full max-w-xs text-left">
          <thead>
            <tr className="text-caption text-body">
              <th scope="col" className="py-1 font-semibold">Week of</th>
              <th scope="col" className="py-1 text-right font-semibold">Notes created</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((week) => (
              <tr key={week.start} className="border-t border-canvas-soft">
                <th scope="row" className="py-1 font-normal">{shortDate(week.start)}</th>
                <td className="py-1 text-right text-ink tabular-nums">{week.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
