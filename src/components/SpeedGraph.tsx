import React from 'react';
import { formatSpeed } from '../utils/formatBytes';

interface SpeedGraphProps {
  speedHistory: number[]; // Array of speeds in bytes per second
  currentSpeed: number;
}

export const SpeedGraph: React.FC<SpeedGraphProps> = ({ speedHistory, currentSpeed }) => {
  const width = 300;
  const height = 48;

  // Use at least 2 points to draw
  const data = speedHistory.length < 2 ? [0, currentSpeed] : speedHistory;
  const maxSpeed = Math.max(...data, 1024 * 1024); // at least 1 MB/s max scale

  // Compute SVG polyline points
  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = height - (val / maxSpeed) * (height - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pointsString = points.join(' ');
  const areaPointsString = `0,${height} ${pointsString} ${width},${height}`;

  return (
    <div className="w-full bg-slate-50/80 border border-slate-200/70 rounded-xl p-2.5 my-3">
      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5 font-medium">
        <span>Transfer Speed History</span>
        <span className="font-mono text-slate-700">
          Peak: <strong className="text-brand-700">{formatSpeed(maxSpeed)}</strong>
        </span>
      </div>

      <div className="relative h-12 w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Area under curve */}
          <polygon
            points={areaPointsString}
            fill="url(#speedGradient)"
          />

          {/* Speed line */}
          <polyline
            fill="none"
            stroke="#0284c7"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={pointsString}
          />

          {/* Current point pulse */}
          {data.length > 0 && (
            <circle
              cx={width}
              cy={height - (currentSpeed / maxSpeed) * (height - 6) - 3}
              r="3.5"
              fill="#0284c7"
              className="animate-pulse"
            />
          )}
        </svg>
      </div>
    </div>
  );
};
