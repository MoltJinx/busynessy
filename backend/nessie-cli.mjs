#!/usr/bin/env node
/**
 * Minimal CLI for the Nessie REST API.
 * Usage: NESSIE_API_KEY=... node backend/nessie-cli.mjs GET /customers
 */

const HELP = `
Nessie API CLI

Usage:
  NESSIE_API_KEY=<key> node backend/nessie-cli.mjs <METHOD> <PATH> [--data '<json>']

Examples:
  node backend/nessie-cli.mjs GET /customers
  node backend/nessie-cli.mjs GET /customers/<customer_id>/accounts
  node backend/nessie-cli.mjs POST /accounts/<account_id>/deposits --data '{"medium":"balance","amount":500,"description":"Invoice payment"}'
  node backend/nessie-cli.mjs GET /accounts/<account_id>/withdrawals

Environment:
  NESSIE_API_KEY   Required API key from nessieisreal.com
  NESSIE_BASE_URL  Optional override; defaults to https://prod-api.nessieisreal.com
`;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseArgs(args) {
  const [method, path, ...flags] = args;
  let body;

  for (let index = 0; index < flags.length; index += 1) {
    if (flags[index] === "--data") {
      const raw = flags[index + 1];
      if (!raw) fail("--data requires a JSON value.");
      try {
        body = JSON.parse(raw);
      } catch {
        fail("--data must be valid JSON.");
      }
      index += 1;
    } else {
      fail(`Unknown option: ${flags[index]}`);
    }
  }

  return { method: method?.toUpperCase(), path, body };
}

function toJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  const [first] = process.argv.slice(2);
  if (!first || first === "--help" || first === "-h") {
    console.log(HELP.trim());
    return;
  }

  const { method, path, body } = parseArgs(process.argv.slice(2));
  if (!["GET", "POST", "PUT", "DELETE"].includes(method)) {
    fail("METHOD must be GET, POST, PUT, or DELETE.");
  }
  if (!path?.startsWith("/")) {
    fail("PATH must start with /, for example /customers.");
  }

  const apiKey = process.env.NESSIE_API_KEY;
  if (!apiKey) fail("Set NESSIE_API_KEY before calling Nessie.");

  const baseUrl = (process.env.NESSIE_BASE_URL || "https://prod-api.nessieisreal.com").replace(/\/$/, "");
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const result = toJson(await response.text());
  if (!response.ok) {
    console.error(JSON.stringify({ status: response.status, error: result }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => fail(error.message));
