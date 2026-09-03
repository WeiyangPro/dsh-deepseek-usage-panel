// dsh-usage-hud · resolve the DeepSeek API key + base URL on the host.
//
// The key is never stored by this plugin and never sent to the browser. Lookup
// order (first hit wins):
//   1. env DSH_USAGE_HUD_API_KEY (explicit override for this plugin)
//   2. direct read of the refs map in $DSH_HOME/.credentials.yaml (or
//      ~/.dsh/.credentials.yaml) — the PRIMARY path for third-party plugins,
//      because the harness credentials SERVICE gates resolve() behind
//      config-declared credential roles that bundles do not carry;
//   3. the same name as an environment variable (process.env[ref]);
//   4. a hard fallback to the conventional ref name "DEEPSEEK_API_KEY" (file,
//      then env).
//
// baseURL order: row config baseURL → env DEEPSEEK_BASE_URL → `llm-deepseek`
// settings baseURL → https://api.deepseek.com
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Candidate credential-store locations. When DSH_HOME is exported (the
 * normal case for a dsh-spawned process) it is authoritative; only fall back
 * to the conventional ~/.dsh when the variable is absent. */
export function credentialHomes() {
  if (process.env.DSH_HOME) return [process.env.DSH_HOME];
  return [join(homedir(), ".dsh")];
}

/** Read `ref: value` from a credentials YAML text (flat refs map). */
function parseRef(text, ref) {
  const re = new RegExp(`^\\s*${escapeRegExp(ref)}\\s*:\\s*(.*?)\\s*$`, "m");
  const m = text.match(re);
  if (!m || m[1] === undefined) return null;
  let value = m[1].trim();
  if (value.startsWith("#") || value === "" || value === "null" || value === "~") return null;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (!value) return null;
  return value;
}

/** Search every candidate home for `ref`; returns { value, file } or null. */
export async function readCredentialFromFile(ref) {
  for (const home of credentialHomes()) {
    let text;
    try {
      text = await readFile(join(home, ".credentials.yaml"), "utf8");
    } catch {
      continue;
    }
    const value = parseRef(text, ref);
    if (value) return { value, file: join(home, ".credentials.yaml") };
  }
  return null;
}

export async function resolveApiKey(ctx, config = {}) {
  const out = {
    apiKey: null,
    baseURL: config.baseURL || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    ref: null,
    source: null,
  };

  if (process.env.DSH_USAGE_HUD_API_KEY) {
    out.apiKey = process.env.DSH_USAGE_HUD_API_KEY;
    out.source = "env:DSH_USAGE_HUD_API_KEY";
    return out;
  }

  let ns = null;
  const settings = ctx && ctx.get ? ctx.get("settings") : undefined;
  if (settings && typeof settings.get === "function") {
    try {
      const value = await settings.get("llm-deepseek");
      if (value && typeof value === "object") ns = value;
    } catch {
      /* namespace not registered */
    }
  }
  const ref = (config.apiKeyRef || (ns && ns.apiKeyEnv) || "DEEPSEEK_API_KEY").trim();
  out.ref = ref;
  if (ns && typeof ns.baseURL === "string" && ns.baseURL) out.baseURL = ns.baseURL;

  // settings can also carry a literal key
  if (ns && typeof ns.apiKey === "string" && ns.apiKey) {
    out.apiKey = ns.apiKey;
    out.source = "settings:llm-deepseek.apiKey";
    return out;
  }

  // 1) preferred ref via service (only when the service is willing to resolve)
  const creds = ctx && ctx.get ? ctx.get("credentials") : undefined;
  if (creds && typeof creds.resolve === "function") {
    try {
      const r = await creds.resolve(ref);
      if (r && r.value) {
        out.apiKey = r.value;
        out.source = `credentials:${ref}`;
        return out;
      }
    } catch {
      /* fall through */
    }
  }

  // 2) direct file read (primary, robust)
  const fromFile = await readCredentialFromFile(ref);
  if (fromFile) {
    out.apiKey = fromFile.value;
    out.source = `credentials-file:${ref}`;
    return out;
  }

  // 3) environment
  if (process.env[ref]) {
    out.apiKey = process.env[ref];
    out.source = `env:${ref}`;
    return out;
  }

  // 4) conventional-name fallback (covers a custom apiKeyRef that points
  //    elsewhere while the real key sits under DEEPSEEK_API_KEY)
  if (ref !== "DEEPSEEK_API_KEY") {
    const fbFile = await readCredentialFromFile("DEEPSEEK_API_KEY");
    if (fbFile) {
      out.apiKey = fbFile.value;
      out.source = "credentials-file:DEEPSEEK_API_KEY";
      return out;
    }
    if (process.env.DEEPSEEK_API_KEY) {
      out.apiKey = process.env.DEEPSEEK_API_KEY;
      out.source = "env:DEEPSEEK_API_KEY";
      return out;
    }
  }

  return out;
}
