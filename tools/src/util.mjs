// Shared helpers for the Freegma tools.

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`error: environment variable ${name} is required`);
    process.exit(2);
  }
  return value;
}

export function step(msg) {
  console.log(`\n==> ${msg}`);
}

export function ok(msg) {
  console.log(`  ok  ${msg}`);
}

export function fail(err) {
  console.error(`\nFAILED: ${err && err.message ? err.message : err}`);
  if (process.env.FREEGMA_DEBUG && err && err.stack) console.error(err.stack);
  process.exit(1);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
