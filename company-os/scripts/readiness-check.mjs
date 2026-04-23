#!/usr/bin/env node
/*
  Readiness check script aimed at ops workflows:
  - Verifies intake API health
  - Verifies alerting/monitoring health
  - Asserts BULK_EVENT_ORDERS_ENABLED remains false

  Usage:
    node company-os/scripts/readiness-check.mjs
  Environment variables (optional):
    INTAKE_API_URL   (defaults to http://localhost:3000/intake/health)
    ALERTING_URL     (defaults to http://localhost:3000/alerting/health)
    TIMEOUT_MS       (defaults to 5000)
*/
import { setTimeout as delay } from 'timers/promises';
import featureFlags from '../config/featureFlags.mjs';

const DEFAULT_INTAKE = 'http://localhost:3000/intake/health';
const DEFAULT_ALERT = 'http://localhost:3000/alerting/health';
const intakeUrl = process.env.INTAKE_API_URL || DEFAULT_INTAKE;
const alertUrl = process.env.ALERTING_URL || DEFAULT_ALERT;
const timeoutMs = parseInt(process.env.TIMEOUT_MS || '5000', 10);

async function fetchWithTimeout(url, timeout) {
  // Use global fetch when available (Node 18+). If not available, provide a clear error.
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available in this Node runtime. Use Node 18+ or set up a small HTTP check alternative.');
  }

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return { ok: res.ok, status: res.status, statusText: res.statusText };
  } catch (err) {
    return { ok: false, error: err && err.message ? String(err.message) : String(err) };
  } finally {
    clearTimeout(id);
  }
}

async function run() {
  console.log('Readiness check started');
  console.log(`Intake URL: ${intakeUrl}`);
  console.log(`Alerting URL: ${alertUrl}`);
  console.log(`Timeout (ms): ${timeoutMs}`);

  try {
    const [intakeRes, alertRes] = await Promise.all([
      fetchWithTimeout(intakeUrl, timeoutMs),
      fetchWithTimeout(alertUrl, timeoutMs),
    ]);

    if (!intakeRes.ok) {
      console.error('Intake health check failed:', intakeRes);
    } else {
      console.log('Intake health check OK:', intakeRes.status);
    }

    if (!alertRes.ok) {
      console.error('Alerting health check failed:', alertRes);
    } else {
      console.log('Alerting health check OK:', alertRes.status);
    }

    if (!intakeRes.ok || !alertRes.ok) {
      console.error('Readiness check: upstream dependencies unreachable or unhealthy');
      process.exitCode = 2;
