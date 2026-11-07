import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * fetch() wrapper that refuses to talk to private / internal addresses (SSRF guard)
 * and re-checks every redirect hop.
 */

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast + reserved
  );
}

function isPrivateIP(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateIPv4(ip);
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  if (v6.startsWith("::ffff:")) return isPrivateIPv4(v6.slice(7));
  return (
    v6.startsWith("fc") ||
    v6.startsWith("fd") || // unique local
    v6.startsWith("fe8") ||
    v6.startsWith("fe9") ||
    v6.startsWith("fea") ||
    v6.startsWith("feb") || // link-local
    v6.startsWith("ff") // multicast
  );
}

export async function assertPublicUrl(raw: string | URL): Promise<URL> {
  const url = typeof raw === "string" ? new URL(raw) : raw;
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("อนุญาตเฉพาะ URL แบบ http/https");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new Error("ไม่อนุญาตให้เรียก URL ภายในระบบ");
  }
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIP(a.address))) {
    throw new Error("ไม่อนุญาตให้เรียก URL ภายในเครือข่าย");
  }
  return url;
}

export async function safeFetch(
  input: string | URL,
  init: RequestInit & { maxRedirects?: number } = {}
): Promise<Response> {
  const { maxRedirects = 5, ...rest } = init;
  let current = await assertPublicUrl(input);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetch(current, { ...rest, redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      const next = new URL(res.headers.get("location")!, current);
      current = await assertPublicUrl(next);
      continue;
    }
    return res;
  }
  throw new Error("Redirect มากเกินไป");
}
