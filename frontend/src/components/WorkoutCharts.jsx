import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';

// Maps flag keys from Python to display labels and their theme colour.
const FLAG_META = {
  jerk_spike:       { label: ' Jerk Spike',    color: '#ef4444' },
  asymmetric_tempo: { label: ' Uneven Tempo',   color: '#f97316' },
  partial_rom:      { label: ' Partial ROM',    color: '#eab308' },
  instability:      { label: ' Instability',    color: '#8b5cf6' },
};

// Returns a colour string based on numeric score 
const scoreColor = (score) => {
  if (score >= 80) return '#10b981';
  if (score >= 55) return '#f97316';
  return '#ef4444';
};

// ─── Rep Card ────────────────────────────────────────────────────────────────
const RepCard = ({ rep }) => {
  const isOutlier = rep.is_iqr_outlier || rep.is_ml_outlier;

  const outlierStyle = isOutlier
    ? { border: '2px solid #ef4444', boxShadow: '0 0 0 3px rgba(239,68,68,0.15)' }
    : {};

  return (
    <div className="rep-card" style={outlierStyle}>

      <div className="rep-card__header">
        <span className="rep-card__label">Rep {rep.rep_number}</span>
        {/* Score colour is dynamic*/}
        <span className="rep-card__score" style={{ color: scoreColor(rep.score) }}>
          {rep.score}
        </span>
      </div>

      <div className="rep-card__stats">
        <div>ROM: <strong>{rep.rom}°</strong></div>
        <div>Duration: <strong>{rep.duration}s</strong></div>
      </div>

      {(rep.is_iqr_outlier || rep.is_ml_outlier) && (
        <div className="rep-card__badges">
          {rep.is_iqr_outlier && <span className="badge badge--iqr">IQR outlier</span>}
          {rep.is_ml_outlier  && <span className="badge badge--ml">ML outlier</span>}
        </div>
      )}

      {rep.form_flags && rep.form_flags.length > 0 && (
        <div className="rep-card__flags">
          {rep.form_flags.map((flag) => {
            const meta = FLAG_META[flag] || { label: flag, color: '#6b7280' };
            return (
              <span
                key={flag}
                className="flag-badge"
                style={{
                  background: `${meta.color}15`,
                  color: meta.color,
                  border: `1px solid ${meta.color}40`,
                }}
              >
                {meta.label}
              </span>
            );
          })}
        </div>
      )}

    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const WorkoutCharts = ({ data }) => {

  const { angleData, gyroData } = useMemo(() => {
    if (!data?.chart_data) return { angleData: [], gyroData: [] };
    const { time, angle_smooth, gyro_mag } = data.chart_data;

    const anglePoints = time.map((t, i) => ({
      time:  parseFloat(t.toFixed(2)),
      angle: parseFloat(angle_smooth[i].toFixed(1)),
    }));

    const gyroPoints = time.map((t, i) => ({
      time: parseFloat(t.toFixed(2)),
      gyro: parseFloat(gyro_mag[i].toFixed(3)),
    }));

    return { angleData: anglePoints, gyroData: gyroPoints };
  }, [data]);

  const repBoundaries = useMemo(() => {
    if (!data?.rep_details || !data?.chart_data) return [];
    const time = data.chart_data.time;
    return data.rep_details.map((rep) => ({
      peakTime:  parseFloat(time[rep.indexes.peak].toFixed(2)),
      isOutlier: rep.is_iqr_outlier || rep.is_ml_outlier,
      repNumber: rep.rep_number,
    }));
  }, [data]);

  const flagCounts   = data?.summary?.flag_counts || {};
  const hasFlagCounts = Object.keys(flagCounts).length > 0;

  if (!data) return null;

  return (
    <div className="workout-charts-container">

      {/* ── Session Flag Summary ── */}
      {hasFlagCounts && (
        <div className="chart-card chart-card--compact">
          <h3 className="chart-title">Session Form Issues</h3>
          <div className="flag-summary-list">
            {Object.entries(flagCounts).map(([flag, count]) => {
              const meta = FLAG_META[flag] || { label: flag, color: '#6b7280' };
              return (
                <div
                  key={flag}
                  className="flag-pill"
                  style={{
                    background: `${meta.color}12`,
                    border: `1px solid ${meta.color}40`,
                  }}
                >
                  <span className="flag-pill__count" style={{ color: meta.color }}>{count}×</span>
                  <span className="flag-pill__label" style={{ color: meta.color }}>{meta.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Rep Breakdown ── */}
      {data.rep_details && data.rep_details.length > 0 && (
        <div className="chart-card">
          <h3 className="chart-title">Rep Breakdown</h3>
          <p className="rep-breakdown-hint">
            Score colour:{' '}
            <span className="score-good">green ≥ 80</span> ·{' '}
            <span className="score-ok">orange ≥ 55</span> ·{' '}
            <span className="score-bad">red &lt; 55</span>.{' '}
            Red-bordered cards are statistical outlier reps.
          </p>
          <div className="rep-cards-grid">
            {data.rep_details.map((rep) => (
              <RepCard key={rep.rep_number} rep={rep} />
            ))}
          </div>
        </div>
      )}

      {/* ── Chart 1: Elbow Angle ── */}
      <div className="chart-card">
        <h3 className="chart-title">Form Analysis (Elbow Angle)</h3>
        <p className="chart-hint">Vertical lines mark rep peaks. Red lines = outlier reps.</p>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={angleData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 11 }}
                label={{ value: 'Time (s)', position: 'insideBottomRight', offset: -5 }}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 11 }}
                label={{ value: 'Angle (°)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip formatter={(v) => [`${v}°`, 'Elbow Angle']} />
              <Line type="monotone" dataKey="angle" stroke="#2c3e50" strokeWidth={2.5} dot={false} name="Elbow Angle" />
              {repBoundaries.map(({ peakTime, isOutlier, repNumber }) => (
                <ReferenceLine
                  key={repNumber}
                  x={peakTime}
                  stroke={isOutlier ? '#ef4444' : '#10b981'}
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                  label={{ value: `R${repNumber}`, position: 'top', fontSize: 10, fill: isOutlier ? '#ef4444' : '#10b981' }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Chart 2: Gyroscope ── */}
      <div className="chart-card">
        <h3 className="chart-title">Gyroscope Magnitude</h3>
        <p className="chart-hint">Jerk spikes appear as sharp peaks. Outlier rep windows are marked with red lines.</p>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={gyroData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 11 }}
                label={{ value: 'Time (s)', position: 'insideBottomRight', offset: -5 }}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                label={{ value: 'Gyro (rad/s)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip formatter={(v) => [`${v} rad/s`, 'Gyro Magnitude']} />
              <Legend />
              <Line type="monotone" dataKey="gyro" stroke="#ff7f0e" strokeWidth={2} dot={false} name="Gyro Magnitude" />
              {repBoundaries.map(({ peakTime, isOutlier, repNumber }) => (
                <ReferenceLine
                  key={repNumber}
                  x={peakTime}
                  stroke={isOutlier ? '#ef4444' : '#10b981'}
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
};

export default WorkoutCharts;