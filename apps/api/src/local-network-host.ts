import { isIP } from "node:net";

const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "host.docker.internal",
  "host.containers.internal",
]);

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map((part) => Number(part));
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab][0-9a-f]:/u.test(normalized)) return true;
  if (normalized.startsWith("::ffff:")) {
    return isPrivateIpv4(normalized.slice("::ffff:".length));
  }
  return false;
}

export function isPrivateNetworkHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/gu, "");
  if (!normalized) return false;
  if (
    LOCAL_HOSTNAMES.has(normalized) ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }
  const version = isIP(normalized);
  return version === 4
    ? isPrivateIpv4(normalized)
    : version === 6
      ? isPrivateIpv6(normalized)
      : false;
}

export function isPrivateNetworkHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      !parsed.username &&
      !parsed.password &&
      isPrivateNetworkHostname(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function requirePrivateNetworkHttpUrl(value: string, label: string): string {
  if (!isPrivateNetworkHttpUrl(value)) {
    throw new Error(
      `${label} must use a loopback, private-LAN IP address, or .local hostname.`,
    );
  }
  return value;
}
