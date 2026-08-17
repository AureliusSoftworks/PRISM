import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { advertise, type AdvertiseOptions } from "dnssd-advertise";
import type { AppConfig } from "@localai/config";
import { PRISM_API_VERSION, PRISM_SERVER_VERSION } from "./health.ts";

export const PRISM_DISCOVERY_TYPE = "prism";
export const PRISM_DISCOVERY_PROTOCOL = "tcp";

export interface DiscoveryServiceDescriptor {
  serviceType: "_prism._tcp";
  options: AdvertiseOptions;
}

export type StopDiscovery = () => Promise<void>;

export type DiscoveryRuntime = {
  platform?: NodeJS.Platform;
  desktopMode?: boolean;
  nativeDnsSdAvailable?: boolean;
  spawnNative?: typeof spawn;
  execFileSyncNative?: typeof execFileSync;
};

export function buildDiscoveryTxt(): Record<string, string> {
  return {
    api: String(PRISM_API_VERSION),
    version: PRISM_SERVER_VERSION,
    pairing: "disabled",
    tls: "optional",
  };
}

export function buildDiscoveryServiceDescriptor(
  config: AppConfig
): DiscoveryServiceDescriptor {
  const serverName = config.serverName ?? process.env.PRISM_SERVER_NAME ?? "Prism Server";
  return {
    serviceType: "_prism._tcp",
    options: {
      name: serverName,
      type: PRISM_DISCOVERY_TYPE,
      protocol: PRISM_DISCOVERY_PROTOCOL,
      port: config.apiPort,
      txt: buildDiscoveryTxt(),
    },
  };
}

/**
 * Reap `dns-sd` advertisers left behind by a previous Prism instance.
 *
 * A healthy advertiser always has a live API parent, so any that has been
 * reparented to init (ppid 1) is definitionally leaked — the API was killed
 * with a signal it could not catch (SIGKILL, force quit, crash) and its
 * shutdown path never ran. Those orphans keep advertising `_prism._tcp`
 * forever and accumulate one per launch.
 *
 * Restricting to ppid 1 is what makes this safe: a concurrently running Prism
 * owns its advertiser, so this can never disturb a live sibling instance.
 * Best-effort throughout — discovery is optional and must never block startup.
 */
function reapOrphanedNativeAdvertisers(
  descriptor: DiscoveryServiceDescriptor,
  runSync: typeof execFileSync,
): void {
  let listing: string;
  try {
    listing = runSync("/bin/ps", ["-eo", "pid=,ppid=,args="], {
      encoding: "utf8",
      timeout: 2_000,
    });
  } catch {
    return;
  }

  for (const line of listing.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/u.exec(line);
    if (!match) continue;
    const [, pidRaw, ppidRaw, args] = match;
    if (ppidRaw !== "1") continue;
    if (!args.includes("dns-sd") || !args.includes(descriptor.serviceType)) {
      continue;
    }
    // Only our own service name, so unrelated `_prism._tcp` advertisers on the
    // machine (an older install, a different server name) are left alone.
    if (!args.includes(descriptor.options.name)) continue;
    const pid = Number(pidRaw);
    if (!Number.isInteger(pid) || pid <= 1) continue;
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already gone, or not ours to signal.
    }
  }
}

function startNativeMacDiscovery(
  descriptor: DiscoveryServiceDescriptor,
  spawnNative: typeof spawn,
  runSync: typeof execFileSync = execFileSync,
): StopDiscovery | null {
  // Clear leaked advertisers from prior runs before adding another.
  reapOrphanedNativeAdvertisers(descriptor, runSync);

  let child: ChildProcess;
  try {
    child = spawnNative(
      "/usr/bin/dns-sd",
      [
        "-R",
        descriptor.options.name,
        descriptor.serviceType,
        "local.",
        String(descriptor.options.port),
        ...Object.entries(descriptor.options.txt ?? {}).map(
          ([key, value]) => `${key}=${String(value)}`,
        ),
      ],
      { stdio: "ignore" },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Prism native LAN discovery failed to start: ${message}`);
    return null;
  }

  const stopOnParentExit = () => {
    if (child.exitCode === null) child.kill("SIGTERM");
  };
  process.once("exit", stopOnParentExit);
  child.once("error", (error) => {
    console.warn(`Prism native LAN discovery stopped: ${error.message}`);
  });

  return async () => {
    process.removeListener("exit", stopOnParentExit);
    if (child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(finish, 500);
      timeout.unref?.();
      child.once("exit", finish);
      if (!child.kill("SIGTERM")) finish();
    });
  };
}

export function startPrismDiscovery(
  config: AppConfig,
  advertiseService: typeof advertise = advertise,
  runtime: DiscoveryRuntime = {},
): StopDiscovery | null {
  // Discovery is a sub-behavior of local-network access: it must never advertise
  // while the server is private to the host machine, and it can still be opted
  // out independently via PRISM_DISCOVERY_ENABLED even when LAN access is on.
  if (config.lanAccessEnabled !== true) {
    console.log("Prism LAN discovery disabled (local-only mode).");
    return null;
  }
  if (config.discoveryEnabled === false) {
    console.log("Prism LAN discovery disabled.");
    return null;
  }

  const descriptor = buildDiscoveryServiceDescriptor(config);
  const platform = runtime.platform ?? process.platform;
  const desktopMode =
    runtime.desktopMode ?? process.env.PRISM_DESKTOP_MODE === "1";
  const nativeDnsSdAvailable =
    runtime.nativeDnsSdAvailable ?? existsSync("/usr/bin/dns-sd");
  if (platform === "darwin" && desktopMode && nativeDnsSdAvailable) {
    const stop = startNativeMacDiscovery(
      descriptor,
      runtime.spawnNative ?? spawn,
      runtime.execFileSyncNative ?? execFileSync,
    );
    if (stop) {
      console.log(
        `Prism LAN discovery advertising ${descriptor.serviceType} natively as "${descriptor.options.name}" on port ${config.apiPort}`,
      );
    }
    return stop;
  }
  try {
    const stop = advertiseService(descriptor.options);
    console.log(
      `Prism LAN discovery advertising ${descriptor.serviceType} as "${descriptor.options.name}" on port ${config.apiPort}`
    );
    return stop;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Prism LAN discovery failed to start: ${message}`);
    return null;
  }
}
