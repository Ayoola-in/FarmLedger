// Small, dependency-free SVG charts, kept light for slow connections. Every chart
// has a hover or touch readout, a legend for two or more series, and a table view.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface Series {
  name: string;
  /** CSS colour. Series colours follow the entity, never its rank. */
  color: string;
  values: number[];
}

interface ChartProps {
  labels: string[];
  /** Full label for the readout and table, when the axis label is abbreviated. */
  fullLabels?: string[];
  series: Series[];
  height?: number;
  format?: (value: number) => string;
  axisFormat?: (value: number) => string;
  caption: string;
}

const PAD = { top: 12, right: 12, bottom: 24, left: 46 };

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth || 600);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Rounded axis maximum and ticks a person would choose by hand. */
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(v);
  return ticks;
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="legend" style={{ marginBottom: 8 }}>
      {series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}
    </div>
  );
}

function TableView({ labels, fullLabels, series, format }: Pick<ChartProps, 'labels' | 'fullLabels' | 'series' | 'format'>) {
  const f = format ?? String;
  return (
    <details className="table-view">
      <summary>View as table</summary>
      <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
        <table>
          <thead><tr><th>Period</th>{series.map((s) => <th key={s.name} className="r">{s.name}</th>)}</tr></thead>
          <tbody>
            {labels.map((label, i) => (
              <tr key={label + i}>
                <td>{fullLabels?.[i] ?? label}</td>
                {series.map((s) => <td key={s.name} className="r">{f(s.values[i] ?? 0)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Readout({ x, width, title, rows }: { x: number; width: number; title: string; rows: ReactNode }) {
  const flip = x > width / 2;
  return (
    <div className="chart-tip" style={flip ? { right: width - x + 12, top: 4 } : { left: x + 12, top: 4 }}>
      <b>{title}</b>
      {rows}
    </div>
  );
}

function Frame({ children, ticks, plotW, y, axisFormat }: { children: ReactNode; ticks: number[]; plotW: number; y: (v: number) => number; axisFormat: (v: number) => string }) {
  return (
    <>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
          <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end">{axisFormat(t)}</text>
        </g>
      ))}
      {children}
    </>
  );
}

function xLabels(labels: string[], plotW: number, centreOf: (i: number) => number, baseline: number) {
  const every = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(plotW / 62))));
  return labels.map((label, i) =>
    i % every === 0 ? (
      <text key={label + i} x={centreOf(i)} y={baseline + 17} textAnchor="middle">{label}</text>
    ) : null,
  );
}

export function LineChart({ labels, fullLabels, series, height = 220, format = String, axisFormat, caption }: ChartProps) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const plotW = Math.max(40, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] ?? max;
  const x = (i: number) => PAD.left + (labels.length < 2 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const move = (clientX: number, rect: DOMRect) => {
    const ratio = (clientX - rect.left - PAD.left) / plotW;
    setActive(Math.max(0, Math.min(labels.length - 1, Math.round(ratio * (labels.length - 1)))));
  };
  return (
    <div>
      <Legend series={series} />
      <div className="chart" ref={ref} style={{ height }}>
        <svg
          role="img"
          aria-label={caption}
          viewBox={`0 0 ${width} ${height}`}
          onPointerMove={(e) => move(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => move(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setActive(null)}
        >
          <Frame ticks={ticks} plotW={plotW} y={y} axisFormat={axisFormat ?? format}>
            {xLabels(labels, plotW, x, PAD.top + plotH)}
            {active !== null && <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--line-strong)" />}
            {series.map((s) => (
              <g key={s.name}>
                <path
                  d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('')}
                  fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                />
                {active !== null && (
                  <circle cx={x(active)} cy={y(s.values[active] ?? 0)} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                )}
              </g>
            ))}
          </Frame>
        </svg>
        {active !== null && (
          <Readout
            x={x(active)}
            width={width}
            title={fullLabels?.[active] ?? labels[active] ?? ''}
            rows={series.map((s) => <div className="v" key={s.name}><span>{s.name}</span><span>{format(s.values[active] ?? 0)}</span></div>)}
          />
        )}
      </div>
      <TableView labels={labels} fullLabels={fullLabels} series={series} format={format} />
    </div>
  );
}

export function BarChart({ labels, fullLabels, series, height = 240, format = String, axisFormat, caption }: ChartProps) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const plotW = Math.max(40, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] ?? max;
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const band = plotW / Math.max(1, labels.length);
  const gap = 2;
  const barW = Math.max(3, Math.min(26, (band * 0.72 - gap * (series.length - 1)) / series.length));
  const groupW = barW * series.length + gap * (series.length - 1);
  const centre = (i: number) => PAD.left + band * i + band / 2;
  return (
    <div>
      <Legend series={series} />
      <div className="chart" ref={ref} style={{ height }} onPointerLeave={() => setActive(null)}>
        <svg role="img" aria-label={caption} viewBox={`0 0 ${width} ${height}`}>
          <Frame ticks={ticks} plotW={plotW} y={y} axisFormat={axisFormat ?? format}>
            {xLabels(labels, plotW, centre, PAD.top + plotH)}
            {labels.map((label, i) => (
              <g key={label + i}>
                {active === i && <rect x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} fill="var(--surface-2)" />}
                {series.map((s, si) => {
                  const value = s.values[i] ?? 0;
                  const h = PAD.top + plotH - y(value);
                  if (h <= 0) return null;
                  const bx = centre(i) - groupW / 2 + si * (barW + gap);
                  const r = Math.min(4, barW / 2, h);
                  return (
                    <path
                      key={s.name}
                      fill={s.color}
                      d={`M${bx} ${y(0)}V${y(value) + r}Q${bx} ${y(value)} ${bx + r} ${y(value)}H${bx + barW - r}Q${bx + barW} ${y(value)} ${bx + barW} ${y(value) + r}V${y(0)}Z`}
                    />
                  );
                })}
                {/* Hit target bigger than the bars, so thin ones are easy to tap. */}
                <rect
                  x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} fill="transparent"
                  onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)}
                />
              </g>
            ))}
          </Frame>
        </svg>
        {active !== null && (
          <Readout
            x={centre(active)}
            width={width}
            title={fullLabels?.[active] ?? labels[active] ?? ''}
            rows={series.map((s) => <div className="v" key={s.name}><span>{s.name}</span><span>{format(s.values[active] ?? 0)}</span></div>)}
          />
        )}
      </div>
      <TableView labels={labels} fullLabels={fullLabels} series={series} format={format} />
    </div>
  );
}

/** Ranked horizontal bars. One hue, because rank and length already carry the meaning. */
export function RankedBars({ items, format }: { items: { label: string; value: number }[]; format: (v: number) => string }) {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...sorted.map((i) => i.value));
  return (
    <div className="hbars">
      {sorted.map((item) => (
        <div className="hbar-row" key={item.label}>
          <div className="row between small">
            <span>{item.label}</span>
            <span className="num">{format(item.value)}</span>
          </div>
          <div className="hbar-track" aria-hidden="true">
            <div className="hbar-fill" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
