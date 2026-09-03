// dsh-usage-panel 路 shared host utilities (paths, json io, request fence).
import { fileURLToPath } from "node:url";
import { dirname, basename, join, resolve } from "node:path";
import { mkdir, readFile, writeFile, rename, rm, readdir, copyFile } from "node:fs/promises";
import { homedir } from "node:os";

/** Absolute path of this package root (鈥?node_modules/dsh-usage-panel/). */
export const PKG_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

/** Profile directory when installed into a profile's node_modules (hoisted).
 * Returns null when the package is linked (link:/junction) or run from source,
 * because then PKG_ROOT is not under a profile's node_modules. */
export function findProfileDir() {
  try {
    const nodeModulesDir = dirname(PKG_ROOT);
    if (basename(nodeModulesDir) === "node_modules") {
      const profile = dirname(nodeModulesDir);
      if (basename(profile)) return profile; // 鈥?profiles/<name>
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Harness home (DSH_HOME) with a conventional ~/.dsh fallback. */
export function dshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

/** Plugin-owned data dir. Resolution order:
 *   1. explicit config.dataDir override;
 *   2. <profile>/.dsh-usage when installed into a profile's node_modules;
 *   3. $DSH_HOME/dsh-usage-panel (or ~/.dsh/dsh-usage-panel) 鈥?the stable fallback
 *      that survives file:/link: installs and package reinstallation. */
export async function ensureDataDir(override) {
  const profile = findProfileDir();
  const base =
    override ||
    (profile ? join(profile, ".dsh-usage") : null) ||
    join(dshHome(), "dsh-usage-panel");
  await mkdir(base, { recursive: true });
  return base;
}

/** If the chosen data dir has no state.json yet, adopt the first legacy
 * location that does (previous plugin data dirs). Returns the copied-from path
 * or null. Lets users keep their accumulated usage when switching between
 * file:/link: installs or upgrading the host code. */
export async function migrateLegacyState(targetDir) {
  const stateFile = join(targetDir, "state.json");
  const existing = await readJson(stateFile, null);
  const hasData = existing && Array.isArray(existing.buckets) && existing.buckets.length > 0;
  if (hasData) return null;
  const home = dshHome();
  const candidates = [];
  try {
    for (const name of await readdir(join(home, "profiles"))) {
      candidates.push(join(home, "profiles", name, ".dsh-usage", "state.json"));
    }
  } catch {
    /* no profiles dir */
  }
  candidates.push(join(home, "dsh-usage-panel", "state.json"));
  for (const c of candidates) {
    if (c === stateFile) continue;
    try {
      const candidate = await readJson(c, null);
      const candidateHasData = candidate && Array.isArray(candidate.buckets) && candidate.buckets.length > 0;
      if (!candidateHasData) continue;
      await copyFile(c, stateFile);
      return c;
    } catch {
      /* next */
    }
  }
  return null;
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

export async function writeJsonAtomic(file, value) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  await writeFile(tmp, JSON.stringify(value), "utf8");
  try {
    await rename(tmp, file);
  } catch {
    // Windows rename does not overwrite an existing destination.
    await rm(file, { force: true });
    await rename(tmp, file);
  }
}

/** Local wall-clock hour start (ms). Hour buckets follow the user's local
 * time so that the HUD's hourly labels match the buckets they represent. */
export function hourStart(t) {
  const d = new Date(t);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

export function dayStartLocal(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function shortId(id) {
  if (typeof id !== "string") return "session";
  const m = id.match(/[0-9a-f]{8}/i);
  return m ? m[0] : id.length > 8 ? id.slice(0, 8) : id;
}

/**
 * Minimal same-trust fence for the plugin's localhost JSON routes:
 * allow loopback hosts / private-range peers, deny public hosts.
 */
export function fenceOk(req) {
  try {
    const host = String((req.headers && req.headers.host) || "").toLowerCase();
    const hostname = host.replace(/^\[/, "").split("]")[0].split(":")[0];
    if (!hostname || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return true;
    }
    const ip = String((req.socket && req.socket.remoteAddress) || "");
    if (!ip || ip === "::1" || ip.startsWith("127.")) return true;
    if (!ip.includes(":")) {
      const p = ip.split(".").map(Number);
      if (p[0] === 10) return true;
      if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
      if (p[0] === 192 && p[1] === 168) return true;
      if (p[0] === 169 && p[1] === 254) return true;
    }
    if (/^f[cd]/i.test(ip)) return true; // fc00::/7
    return false;
  } catch {
    return false;
  }
}

export function writeRes(res, code, payload) {
  try {
    const body = JSON.stringify(payload);
    res.writeHead(code, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    /* client gone */
  }
}

