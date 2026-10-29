import test from 'node:test';
import assert from 'node:assert/strict';
import { routeAgreement, summarizeDecisions } from './decision-report.mjs';

test('agreement does not turn unavailable old responses into correctness', () => {
  assert.equal(routeAgreement({ route: 'chat', legacyKind: 'unknown', legacyActionTypes: [] }), null);
  assert.equal(routeAgreement({ route: 'countdown', legacyKind: 'envelope', legacyCardTypes: ['CountdownCard'] }), true);
  assert.equal(routeAgreement({ route: 'countdown', legacyKind: 'envelope', legacyCardTypes: ['NoteCard'] }), false);
  assert.equal(routeAgreement({ route: 'arrange', legacyKind: 'envelope' }), null);
});
test('summary excludes pending timings, distinguishes abstention and reports measured quantiles', () => {
  const base = { route: 'countdown', status: 'complete', failedCount: 0, legacyKind: 'envelope', legacyCardTypes: ['CountdownCard'] };
  const rows = [100, 200, 300].map((ms, i) => ({ trace: { ...base, routeLatencyMs: ms }, outcome: 'proposed', undone: i === 1 }));
  rows.push({ trace: { ...base, route: null, status: 'pending', routeLatencyMs: 0 }, outcome: 'pending' });
  rows.push({ trace: { ...base, route: null, failedCount: 1, routeLatencyMs: 4000 }, outcome: 'error' });
  const report = summarizeDecisions(rows);
  assert.equal(report.total, 5);assert.equal(report.pending, 1);assert.equal(report.failures, 1);
  assert.equal(report.byRoute.countdown.p50_ms, 200);assert.equal(report.byRoute.countdown.p95_ms, 300);
  assert.equal(report.byRoute.countdown.agreement, 1);assert.equal(report.undone, 1);
  assert.equal(report.byRoute.pending.p50_ms, null);assert.equal(report.byRoute.unavailable.p95_ms, 4000);
});
