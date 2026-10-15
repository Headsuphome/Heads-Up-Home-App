import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FREE_CUPBOARD_LIMIT, canAddToCupboard, currentPlan, isPremium, planLabel, startTrial, trialDaysLeft } from '../src/plans.js';

const now = new Date('2026-10-15T12:00:00Z');
const items = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i) }));
const free = { plan: 'free', trialUsed: false, trialEndsAt: null, cupboard: [] };

test('free plan allows a limited cupboard', () => {
  assert.equal(currentPlan(free, now), 'free');
  assert.equal(canAddToCupboard({ ...free, cupboard: items(FREE_CUPBOARD_LIMIT - 1) }, now), true);
  assert.equal(canAddToCupboard({ ...free, cupboard: items(FREE_CUPBOARD_LIMIT) }, now), false);
  assert.equal(planLabel(free, now), 'Free');
});

test('a 14-day trial gives Premium once, then ends', () => {
  const changes = startTrial(free, now);
  const trial = { ...free, ...changes, cupboard: items(25) };
  assert.equal(trialDaysLeft(trial, now), 14);
  assert.equal(isPremium(trial, now), true);
  assert.equal(canAddToCupboard(trial, now), true);
  assert.equal(planLabel(trial, now), 'Premium trial · 14 days left');
  assert.equal(startTrial(trial, now), null, 'a trial can only be used once');

  const after = new Date('2026-10-30T12:00:01Z');
  assert.equal(trialDaysLeft(trial, after), 0);
  assert.equal(currentPlan(trial, after), 'free');
  assert.equal(canAddToCupboard(trial, after), false, 'items stay, but no more can be added');
  assert.equal(planLabel({ ...trial, trialEndsAt: '2026-10-16T11:00:00Z' }, now), 'Premium trial · 1 day left');
});

test('paid plans', () => {
  assert.equal(currentPlan({ ...free, plan: 'premium' }, now), 'premium');
  assert.equal(planLabel({ ...free, plan: 'premium' }, now), 'Premium');
  assert.equal(currentPlan({ ...free, plan: 'trade' }, now), 'trade');
  assert.equal(isPremium({ ...free, plan: 'trade', cupboard: items(99) }, now), true);
});
