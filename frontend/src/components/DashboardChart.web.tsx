import React, { useState, useRef, useMemo } from 'react';
import { View } from 'react-native';
import { DashboardChartProps } from './DashboardChart';

/**
 * Helper to compute smooth cubic Bezier curve points
 */
function getBezierPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const controlX1 = current.x + (next.x - current.x) * 0.4;
    const controlY1 = current.y;
    const controlX2 = current.x + (next.x - current.x) * 0.6;
    const controlY2 = next.y;
    path += ` C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${next.x} ${next.y}`;
  }
  return path;
}

function formatCurrency(val: number): string {
  if (val >= 1000000) {
    const m = (val / 1000000).toFixed(1).replace(/\.0$/, '');
    return `${m}M ₫`;
  }
  if (val >= 1000) {
    const k = Math.round(val / 1000);
    return `${k}k ₫`;
  }
  return `${val} ₫`;
}

/**
 * Web implementation of DashboardChart
 * - Replaces react-native-chart-kit SVG on Web to eliminate React 19 DOM warnings:
 *   - No 'transform-origin' (uses valid camelCase transformOrigin or standard SVG coordinates)
 *   - No native PanResponder handlers forwarded to DOM (onStartShouldSetResponder, onResponderMove, etc.)
 *   - No onPressIn forwarded to DOM elements
 * - Uses standard Web Pointer Events (onPointerDown, onPointerMove, onPointerUp, onPointerCancel)
 * - Supports responsive hover / drag data inspection with interactive tooltip
 */
export default function DashboardChartWeb({
  data,
  width,
  height,
  chartConfig,
  bezier = true,
  style
}: DashboardChartProps) {
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const paddingTop = 45;
  const paddingBottom = 40;
  const paddingLeft = 65;
  const paddingRight = 25;

  const chartWidth = Math.max(width, 300);
  const chartHeight = Math.max(height, 200);

  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  const labels = data.labels || [];
  const datasets = data.datasets || [];
  const legend = data.legend || [];

  // Compute min & max values
  const { maxValue, tickValues } = useMemo(() => {
    let max = 0;
    datasets.forEach(ds => {
      (ds.data || []).forEach(v => {
        if (typeof v === 'number' && !isNaN(v) && v > max) {
          max = v;
        }
      });
    });

    if (max <= 0) max = 100000;
    // Round up max to nice interval
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
    const normalized = max / magnitude;
    let roundedMax: number;
    if (normalized <= 1.2) roundedMax = 1.2 * magnitude;
    else if (normalized <= 2) roundedMax = 2 * magnitude;
    else if (normalized <= 5) roundedMax = 5 * magnitude;
    else roundedMax = 10 * magnitude;

    const ticks = [0, roundedMax * 0.25, roundedMax * 0.5, roundedMax * 0.75, roundedMax];
    return { maxValue: roundedMax, tickValues: ticks };
  }, [datasets]);

  // Compute coordinate points for each dataset
  const datasetPoints = useMemo(() => {
    return datasets.map(ds => {
      const vals = ds.data || [];
      return vals.map((v, i) => {
        const x = labels.length > 1
          ? paddingLeft + (i / (labels.length - 1)) * plotWidth
          : paddingLeft + plotWidth / 2;
        const val = typeof v === 'number' && !isNaN(v) ? v : 0;
        const y = paddingTop + plotHeight - (val / maxValue) * plotHeight;
        return { x, y, value: val };
      });
    });
  }, [datasets, labels, maxValue, plotWidth, plotHeight]);

  // Handle pointer interactions (Web pointer events)
  const handlePointerInteraction = (clientX: number) => {
    if (!svgRef.current || labels.length <= 1) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = clientX - rect.left - paddingLeft;
    const ratio = Math.max(0, Math.min(1, relX / plotWidth));
    const closestIdx = Math.round(ratio * (labels.length - 1));
    setActivePointIndex(closestIdx);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    handlePointerInteraction(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.buttons > 0 || activePointIndex !== null) {
      handlePointerInteraction(e.clientX);
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  const onPointerCancel = () => {
    setActivePointIndex(null);
  };

  const onMouseEnter = (e: React.MouseEvent<SVGSVGElement>) => {
    handlePointerInteraction(e.clientX);
  };

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    handlePointerInteraction(e.clientX);
  };

  const onMouseLeave = () => {
    setActivePointIndex(null);
  };

  const activeLabel = activePointIndex !== null ? labels[activePointIndex] : null;
  const activeDatasetVals = activePointIndex !== null ? datasets.map(ds => ds.data?.[activePointIndex] ?? 0) : [];

  return (
    <View style={[{ alignItems: 'center', width: '100%' }, style]}>
      <svg
        ref={svgRef}
        width={chartWidth}
        height={chartHeight}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        style={{
          userSelect: 'none',
          touchAction: 'pan-y',
          display: 'block',
          overflow: 'visible',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onMouseEnter={onMouseEnter}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        {/* Background */}
        <rect x="0" y="0" width={chartWidth} height={chartHeight} fill="#ffffff" />

        {/* Legend */}
        {legend && legend.length > 0 && (
          <g transform={`translate(${paddingLeft}, 16)`}>
            {legend.map((item: string, idx: number) => {
              const ds = datasets[idx] || {};
              const color = ds.color ? ds.color(1) : (idx === 0 ? 'rgba(156, 163, 175, 1)' : 'rgba(0, 0, 0, 1)');
              const xOffset = idx * 120;
              return (
                <g key={`legend-${idx}`} transform={`translate(${xOffset}, 0)`}>
                  <rect x="0" y="2" width="12" height="12" fill={color} rx="2" />
                  <text x="18" y="12" fill="#525252" fontSize="11" fontWeight="600">
                    {item}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* Horizontal Grid Lines & Y-Axis Labels */}
        {tickValues.map((val, idx) => {
          const y = paddingTop + plotHeight - (val / maxValue) * plotHeight;
          return (
            <g key={`grid-y-${idx}`}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={chartWidth - paddingRight}
                y2={y}
                stroke="rgba(0, 0, 0, 0.08)"
                strokeDasharray="4, 4"
                strokeWidth="1"
              />
              <text
                x={paddingLeft - 8}
                y={y + 4}
                textAnchor="end"
                fill="rgba(82, 82, 82, 1)"
                fontSize="10"
                fontWeight="500"
              >
                {formatCurrency(val)}
              </text>
            </g>
          );
        })}

        {/* X-Axis Labels */}
        {labels.map((lbl, idx) => {
          const x = labels.length > 1
            ? paddingLeft + (idx / (labels.length - 1)) * plotWidth
            : paddingLeft + plotWidth / 2;
          const y = paddingTop + plotHeight + 18;
          return (
            <text
              key={`label-x-${idx}`}
              x={x}
              y={y}
              textAnchor="middle"
              fill="rgba(82, 82, 82, 1)"
              fontSize="10"
              fontWeight="600"
            >
              {lbl}
            </text>
          );
        })}

        {/* Data Paths (Curves / Polylines) */}
        {datasetPoints.map((pts, dsIdx) => {
          const ds = datasets[dsIdx];
          const color = ds.color ? ds.color(1) : (dsIdx === 0 ? 'rgba(156, 163, 175, 1)' : 'rgba(0, 0, 0, 1)');
          const strokeWidth = ds.strokeWidth || (dsIdx === 0 ? 2 : 3);
          const pathD = bezier ? getBezierPath(pts) : pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

          return (
            <g key={`dataset-${dsIdx}`}>
              <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Dots */}
              {pts.map((p, pIdx) => {
                const isSelected = activePointIndex === pIdx;
                return (
                  <circle
                    key={`dot-${dsIdx}-${pIdx}`}
                    cx={p.x}
                    cy={p.y}
                    r={isSelected ? 5 : (chartConfig.propsForDots?.r ?? 3)}
                    fill={color}
                    stroke={isSelected ? '#ffffff' : (chartConfig.propsForDots?.stroke ?? '#000')}
                    strokeWidth={isSelected ? 2 : (chartConfig.propsForDots?.strokeWidth ?? 1)}
                    style={{
                      transition: 'r 0.15s ease',
                      cursor: 'pointer'
                    }}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Active Inspection Crosshair & Tooltip */}
        {activePointIndex !== null && datasetPoints[0]?.[activePointIndex] && (
          <g>
            {/* Vertical crosshair guide */}
            <line
              x1={datasetPoints[0][activePointIndex].x}
              y1={paddingTop}
              x2={datasetPoints[0][activePointIndex].x}
              y2={paddingTop + plotHeight}
              stroke="rgba(0, 0, 0, 0.25)"
              strokeDasharray="3, 3"
              strokeWidth="1.5"
            />

            {/* Tooltip Box */}
            {(() => {
              const xPos = datasetPoints[0][activePointIndex].x;
              const boxWidth = 140;
              const boxHeight = 56;
              const boxX = Math.max(10, Math.min(chartWidth - boxWidth - 10, xPos - boxWidth / 2));
              const boxY = Math.max(5, paddingTop - boxHeight - 8);

              return (
                <g transform={`translate(${boxX}, ${boxY})`} style={{ pointerEvents: 'none' }}>
                  <rect
                    width={boxWidth}
                    height={boxHeight}
                    rx="4"
                    fill="#0f172a"
                    fillOpacity="0.95"
                    stroke="#334155"
                    strokeWidth="1"
                  />
                  <text x="8" y="16" fill="#94a3b8" fontSize="10" fontWeight="700">
                    {activeLabel}
                  </text>
                  <text x="8" y="32" fill="#e2e8f0" fontSize="10">
                    {legend?.[0] || 'Kỳ trước'}: <tspan fontWeight="bold" fill="#ffffff">{formatCurrency(activeDatasetVals[0] || 0)}</tspan>
                  </text>
                  <text x="8" y="47" fill="#e2e8f0" fontSize="10">
                    {legend?.[1] || 'Kỳ này'}: <tspan fontWeight="bold" fill="#38bdf8">{formatCurrency(activeDatasetVals[1] || 0)}</tspan>
                  </text>
                </g>
              );
            })()}
          </g>
        )}
      </svg>
    </View>
  );
}
