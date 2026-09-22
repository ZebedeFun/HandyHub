import React from 'react';
import { Sparkles, Gauge, Spline, MoveVertical, BarChart3, TrendingUp, Crosshair } from 'lucide-react';
import {
  scriptStats, cleanUp, fitToHandy, simplify, fitToRange, strokeHeightMatch, driftFix,
  DEVICE_MAX_UNITS_PER_SEC,
} from '../../services/scriptTools';

const fmtSec = (ms) => `${(ms / 1000).toFixed(1)}s`;

// Repairs for the loaded script, generated here or not. Every tool works on the
// current timeline/heatmap selection if there is one, otherwise on the whole
// script, and lands in the edit history so Undo reverses it.
export default function ScriptToolbox({ actions, selection, onApply, Hint, SectionTitle }) {
  const [useSelection, setUseSelection] = React.useState(true);
  const [result, setResult] = React.useState(null); // { tool, before, after } | { tool, error }

  const [clean, setClean] = React.useState({ wobble: 8, tolerance: 3, amplify: 100, fitDevice: true });
  const [handy, setHandy] = React.useState({ maxSpeed: Math.round(DEVICE_MAX_UNITS_PER_SEC), minGapMs: 100, trim: 'both' });
  const [simp, setSimp] = React.useState({ tolerance: 3 });
  const [fit, setFit] = React.useState({ min: 0, max: 100 });
  const [height, setHeight] = React.useState({ targetMedian: 75, strength: 100 });
  const [drift, setDrift] = React.useState({ windowSec: 8 });

  const hasScript = actions && actions.length >= 2;
  const range = selection && useSelection ? selection : null;
  const stats = React.useMemo(() => (hasScript ? scriptStats(actions, range) : null), [actions, range, hasScript]);

  // A new selection is almost always the thing you want to work on next.
  React.useEffect(() => { if (selection) setUseSelection(true); }, [selection]);

  const run = (tool, fn, { needsSelection = false, emptyMessage } = {}) => {
    if (!hasScript) return;
    if (needsSelection && !range) {
      setResult({ tool, error: 'Select a section first — drag across it in Select mode on the timeline, or on the heatmap.' });
      return;
    }
    const before = scriptStats(actions, range);
    const next = fn(actions, range);
    if (!next) {
      setResult({ tool, error: emptyMessage || 'Nothing to change here.' });
      return;
    }
    onApply(next);
    setResult({ tool, before, after: scriptStats(next, range), next, range });
  };

  const slider = (label, value, onChange, { min, max, step = 1, unit = '', accent = 'accent-teal-500', lowHint, highHint, display } = {}) => (
    <div>
      <div className="flex justify-between mb-1">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
        <span className="text-[10px] font-mono text-teal-600 dark:text-teal-400">{display ?? `${value}${unit}`}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`w-full ${accent} h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer`}
      />
      {(lowHint || highHint) && <Hint low={lowHint} high={highHint} />}
    </div>
  );

  const applyButton = (label, onClick, disabled = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!hasScript || disabled}
      className="w-full mt-3 py-1.5 text-xs font-bold rounded-lg transition-colors bg-teal-600 hover:bg-teal-500 text-white disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  );

  const card = (icon, title, blurb, children) => (
    <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50">
      <SectionTitle icon={icon} title={title} />
      <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight -mt-1 mb-3">{blurb}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );

  const statRow = (label, key, fmt = (v) => v) => {
    const now = stats?.[key];
    // Only while the script is still the one the tool produced — after an Undo
    // or another edit the "before" figure would be describing something else.
    const r = result && !result.error && result.next === actions && result.range === range ? result : null;
    return (
      <div className="flex justify-between text-[11px]">
        <span className="text-gray-500 dark:text-gray-400">{label}</span>
        <span className="font-mono text-gray-800 dark:text-gray-200">
          {r && r.before[key] !== r.after[key] && (
            <span className="text-gray-400 dark:text-gray-500">{fmt(r.before[key])} → </span>
          )}
          <span className={key === 'tooFast' && now > 0 ? 'text-red-500' : ''}>{fmt(now)}</span>
        </span>
      </div>
    );
  };

  if (!hasScript) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50">
        <SectionTitle icon={Sparkles} title="Script Toolbox" />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Generate a script, or drop a .funscript onto the page, and the repair tools appear here. They work on
          scripts from anywhere — this app, AI generators or other scripters.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Scope + stats */}
      <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50">
        <SectionTitle icon={Crosshair} title="Working On" />
        <div className="flex bg-gray-200 dark:bg-gray-700 p-1 rounded-lg mb-2">
          {[[true, selection ? `Selection ${fmtSec(selection.startMs)}–${fmtSec(selection.endMs)}` : 'Selection (none)'], [false, 'Whole script']].map(([val, label]) => (
            <button
              key={String(val)}
              type="button"
              disabled={val && !selection}
              onClick={() => setUseSelection(val)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                (val ? !!range : !range)
                  ? 'bg-white dark:bg-gray-600 shadow-sm text-teal-700 dark:text-teal-300'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Hint>
          Drag across a section in Select mode on the timeline, or on the heatmap, to work on just that part.
          Every tool can be undone.
        </Hint>

        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700/50 space-y-1">
          {statRow('Points', 'points')}
          {statRow('Points per second', 'perSec')}
          {statRow('Strokes', 'strokes')}
          {statRow('Typical stroke height', 'medianHeight')}
          {statRow('Top speed (units/s)', 'topSpeed')}
          {statRow('Too fast for the Handy', 'tooFast')}
        </div>
        {result && (result.error || result.next === actions) && (
          <p className={`mt-2 text-[10px] leading-tight ${result.error ? 'text-amber-600 dark:text-amber-400' : 'text-teal-700 dark:text-teal-300'}`}>
            {result.error ? `${result.tool}: ${result.error}` : `${result.tool} applied — Undo reverses it.`}
          </p>
        )}
      </div>

      {card(Sparkles, 'Clean Up', 'One click for a messy or AI-made script: removes tracker glitches, drops redundant points, removes small wobbles, then fits it to the Handy.', <>
        {slider('Remove wobbles under', clean.wobble, v => setClean(c => ({ ...c, wobble: v })), { min: 0, max: 20, unit: ' units', lowHint: '0: keep every reversal', highHint: '20: only clear strokes survive' })}
        {slider('Simplify tolerance', clean.tolerance, v => setClean(c => ({ ...c, tolerance: v })), { min: 0, max: 10, unit: ' units' })}
        {slider('Amplify', clean.amplify, v => setClean(c => ({ ...c, amplify: v })), { min: 100, max: 200, step: 5, unit: '%', lowHint: '100%: heights unchanged', highHint: '200%: strokes doubled about the middle' })}
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <input type="checkbox" checked={clean.fitDevice} onChange={e => setClean(c => ({ ...c, fitDevice: e.target.checked }))} />
          Finish with Fit to Handy
        </label>
        {applyButton('Clean Up', () => run('Clean Up', (a, r) => cleanUp(a, r, { ...clean, amplify: clean.amplify / 100 })))}
      </>)}

      {card(Gauge, 'Fit to Handy', 'Clears the red "too fast" marks: drops points closer together than the device can reverse, and shortens strokes it cannot travel in time. Timing is kept.', <>
        {slider('Max speed', handy.maxSpeed, v => setHandy(h => ({ ...h, maxSpeed: v })), { min: 100, max: 500, step: 10, display: `${handy.maxSpeed} units/s${handy.maxSpeed === Math.round(DEVICE_MAX_UNITS_PER_SEC) ? ' (Handy max)' : ''}`, lowHint: 'Gentler', highHint: 'Above ~360 the Handy smears' })}
        {slider('Closest points', handy.minGapMs, v => setHandy(h => ({ ...h, minGapMs: v })), { min: 50, max: 200, step: 10, unit: 'ms' })}
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">When a stroke is too fast, shorten</label>
          <div className="flex bg-gray-200 dark:bg-gray-700 p-1 rounded-lg">
            {[['both', 'Its far end'], ['top', 'The top'], ['bottom', 'The bottom']].map(([val, label]) => (
              <button key={val} type="button" onClick={() => setHandy(h => ({ ...h, trim: val }))}
                className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors ${handy.trim === val ? 'bg-white dark:bg-gray-600 shadow-sm text-teal-700 dark:text-teal-300' : 'text-gray-500 dark:text-gray-400'}`}>
                {label}
              </button>
            ))}
          </div>
          <Hint>"The top" keeps full depth; "The bottom" keeps the tip strokes intact.</Hint>
        </div>
        {applyButton('Fit to Handy', () => run('Fit to Handy', (a, r) => fitToHandy(a, r, handy)))}
      </>)}

      {card(Spline, 'Simplify', 'Keeps every change of direction and drops the points in between that only repeat the line the device would draw anyway.', <>
        {slider('Tolerance', simp.tolerance, v => setSimp({ tolerance: v }), { min: 0, max: 10, unit: ' units', lowHint: '0: only perfectly in-line points', highHint: '10: aggressive; flattens easing' })}
        {applyButton('Simplify', () => run('Simplify', (a, r) => simplify(a, r, simp)))}
      </>)}

      {card(MoveVertical, 'Fit to Range', 'Stretches (or squeezes) the positions so the lowest point lands on Min and the highest on Max.', <>
        <div className="flex gap-4">
          <div className="flex-1">{slider('Min', fit.min, v => setFit(f => ({ ...f, min: Math.min(v, f.max) })), { min: 0, max: 100, unit: '%' })}</div>
          <div className="flex-1">{slider('Max', fit.max, v => setFit(f => ({ ...f, max: Math.max(v, f.min) })), { min: 0, max: 100, unit: '%' })}</div>
        </div>
        {applyButton('Fit to Range', () => run('Fit to Range', (a, r) => fitToRange(a, r, fit), { emptyMessage: 'The section is flat — nothing to stretch.' }))}
      </>)}

      {card(BarChart3, 'Stroke Height Match', 'AI-made scripts tend to stroke about half as tall as a person would. This resizes strokes to a hand-made spread of heights, so big strokes stay rare instead of everything slamming 0 to 100. Timing is untouched.', <>
        {slider('Typical stroke height', height.targetMedian, v => setHeight(h => ({ ...h, targetMedian: v })), { min: 30, max: 95, lowHint: 'Subtle', highHint: 'Hand-made scripts sit around 75' })}
        {slider('Strength', height.strength, v => setHeight(h => ({ ...h, strength: v })), { min: 0, max: 100, step: 5, unit: '%' })}
        <Hint>Taller strokes are faster strokes — follow with Fit to Handy if red marks appear.</Hint>
        {applyButton('Match Stroke Heights', () => run('Stroke Height Match', (a, r) => strokeHeightMatch(a, r, { targetMedian: height.targetMedian, strength: height.strength / 100 }), { emptyMessage: 'Needs at least 8 clear strokes to learn from.' }))}
      </>)}

      {card(TrendingUp, 'Drift Fix', 'For a section where the whole stroke band slowly creeps up or down — typical of camera-tracked scripts. Recentres it while keeping every stroke’s height.', <>
        {slider('Smoothing window', drift.windowSec, v => setDrift({ windowSec: v }), { min: 3, max: 30, unit: 's', lowHint: 'Follows faster wander', highHint: 'Only slow creep' })}
        <Hint>Works on a selection only: across a whole script it cannot tell drift from deliberate high or low sections, like tip teasing.</Hint>
        {applyButton(range ? 'Fix Drift in Selection' : 'Select a section first', () => run('Drift Fix', (a, r) => driftFix(a, r, drift), { needsSelection: true, emptyMessage: 'Needs a few clear strokes in the selection.' }), !range)}
      </>)}
    </>
  );
}
