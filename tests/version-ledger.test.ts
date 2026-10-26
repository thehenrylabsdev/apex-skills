import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { satisfies } from "../src/semver.js";
import { executeVersionCommand } from "../src/version-cli.js";
import {
  openVersionLedger,
  resolvePackageVersion,
  type RegistryClient,
} from "../src/version-ledger.js";
import {
  cadenceDaysFromReleases,
  evaluateHosts,
  isCadenceExpired,
  selectCompatibleVersion,
  type PackageConstraints,
  type RegistrySnapshot,
} from "../src/version-policy.js";

const NOW = new Date("2026-10-26T00:00:00.000Z");

function constraints(
  engines: Readonly<Record<string, string>> = {},
  developedAgainst: Readonly<Record<string, string>> = {},
  peers: Readonly<Record<string, string>> = {},
): PackageConstraints {
  return {
    peers,
    optionalPeers: [],
    engines,
    developedAgainst,
  };
}

function snapshot(overrides: Partial<RegistrySnapshot> = {}): RegistrySnapshot {
  const base: RegistrySnapshot = {
    ecosystem: "npm",
    name: "vitest",
    releases: [
      { version: "4.9.0", publishedAt: "2026-09-01T00:00:00.000Z" },
      { version: "5.0.0", publishedAt: "2026-10-01T00:00:00.000Z" },
    ],
    distTags: { latest: "5.0.0" },
    ltsVersions: [],
    constraintsByVersion: {
      "5.0.0": constraints({ node: ">=22" }),
      "4.9.0": constraints({ node: ">=18" }),
    },
    supportUntil: null,
    source: "npm",
  };
  return { ...base, ...overrides };
}

function countingClient(
  body: RegistrySnapshot | null,
  loads: Readonly<Record<string, PackageConstraints | null>> = {},
): RegistryClient & { readonly fetches: () => number; readonly loads: () => number } {
  let fetchCount = 0;
  let loadCount = 0;
  return {
    fetches(): number {
      return fetchCount;
    },
    loads(): number {
      return loadCount;
    },
    fetchSnapshot(): RegistrySnapshot | null {
      fetchCount += 1;
      return body;
    },
    fetchConstraints(_ecosystem, _name, version): PackageConstraints | null {
      loadCount += 1;
      return Object.hasOwn(loads, version) ? (loads[version] ?? null) : null;
    },
  };
}

void describe("release channel policy", () => {
  void it("compares numeric semver and accepts npm-style engine ranges", () => {
    assert.equal(satisfies("1.10.0", "^1.2.3"), true);
    assert.equal(satisfies("2.0.0", "^1.2.3"), false);
    assert.equal(satisfies("0.2.9", "^0.2.3"), true);
    assert.equal(satisfies("0.3.0", "^0.2.3"), false);
    assert.equal(satisfies("1.2.9", "~1.2.3"), true);
    assert.equal(satisfies("1.3.0", "~1.2.3"), false);
    assert.equal(satisfies("22.14.0", "^20.0.0 || ^22.0.0 || >=24.0.0"), true);
    assert.equal(satisfies("24.1.0", "^20.0.0 || ^22.0.0 || >=24.0.0"), true);
    assert.equal(satisfies("18.20.0", "^20.0.0 || ^22.0.0 || >=24.0.0"), false);
    assert.equal(satisfies("23.5.0", "^20.0.0 || ^22.0.0 || >=24.0.0"), false);
    assert.equal(satisfies("7.1.0-beta", "^7.0.0"), false);
    assert.equal(satisfies("5.9.3", ">=5.4.5"), true);
    assert.equal(satisfies("5.4.0", ">=5.4.5"), false);
  });

  void it("treats an exact developed-against pin as a minimum", () => {
    const evaluation = evaluateHosts(
      constraints({}, { typescript: "5.4.5" }, {}),
      [{ ecosystem: "npm", name: "typescript", version: "5.9.3" }],
    );
    assert.equal(evaluation.ok, true);
    const tooOld = evaluateHosts(
      constraints({}, { typescript: "5.4.5" }, {}),
      [{ ecosystem: "npm", name: "typescript", version: "5.0.4" }],
    );
    assert.equal(tooOld.ok, false);
  });

  void it("measures cadence from recent stable publishes and expires on that boundary", () => {
    const days = cadenceDaysFromReleases([
      { version: "1.0.0", publishedAt: "2026-09-01T00:00:00.000Z" },
      { version: "1.1.0-beta.1", publishedAt: "2026-09-02T00:00:00.000Z" },
      { version: "1.2.0", publishedAt: "2026-10-01T00:00:00.000Z" },
    ]);
    assert.equal(days, 30);
    assert.equal(
      isCadenceExpired("2026-09-26T00:00:00.000Z", 30, NOW),
      true,
    );
    assert.equal(
      isCadenceExpired("2026-09-26T00:00:01.000Z", 30, NOW),
      false,
    );
  });

  void it("walks back to the newest stable release the hosts accept", () => {
    const body = snapshot();
    const selected = selectCompatibleVersion({
      releases: body.releases,
      recommended: "5.0.0",
      hosts: [{ ecosystem: "node-runtime", name: "node", version: "20.11.0" }],
      known: body.constraintsByVersion,
      load: () => null,
    });
    assert.equal(selected.status, "selected");
    assert.equal(selected.version, "4.9.0");
    assert.equal(selected.walkedBack, true);
  });
});

void describe("version ledger", () => {
  void it("prefers the current LTS release for a greenfield runtime", () => {
    const ledger = openVersionLedger(":memory:");
    const client = countingClient(
      snapshot({
        ecosystem: "node-runtime",
        name: "node",
        releases: [
          { version: "24.11.0", publishedAt: "2026-01-01T00:00:00.000Z" },
          { version: "26.12.1", publishedAt: "2026-10-01T00:00:00.000Z" },
        ],
        distTags: { latest: "26.12.1" },
        ltsVersions: ["24.11.0"],
        constraintsByVersion: {},
      }),
    );
    try {
      const resolution = resolvePackageVersion(
        ledger,
        client,
        {
          ecosystem: "node-runtime",
          name: "node",
          mode: "scaffold",
          requestedVersion: null,
          hosts: [],
          force: false,
        },
        NOW,
      );
      assert.equal(resolution.action, "use");
      assert.equal(resolution.selectedVersion, "24.11.0");
      assert.equal(resolution.channel, "lts");
      assert.equal(resolution.latestVersion, "26.12.1");
    } finally {
      ledger.close();
    }
  });

  void it("falls through to latest stable when LTS support has ended", () => {
    const ledger = openVersionLedger(":memory:");
    const client = countingClient(
      snapshot({
        releases: [
          { version: "24.11.0", publishedAt: "2026-01-01T00:00:00.000Z" },
          { version: "26.12.1", publishedAt: "2026-10-01T00:00:00.000Z" },
        ],
        distTags: { latest: "26.12.1", lts: "24.11.0" },
        ltsVersions: ["24.11.0"],
        constraintsByVersion: {},
        supportUntil: "2020-01-01T00:00:00.000Z",
      }),
    );
    try {
      const resolution = resolvePackageVersion(
        ledger,
        client,
        {
          ecosystem: "npm",
          name: "vitest",
          mode: "scaffold",
          requestedVersion: null,
          hosts: [],
          force: false,
        },
        NOW,
      );
      assert.equal(resolution.selectedVersion, "26.12.1");
      assert.equal(resolution.reason, "lts-support-ended");
    } finally {
      ledger.close();
    }
  });

  void it("selects the newest library release compatible with the host toolchain", () => {
    const ledger = openVersionLedger(":memory:");
    const client = countingClient(snapshot());
    try {
      const resolution = resolvePackageVersion(
        ledger,
        client,
        {
          ecosystem: "npm",
          name: "vitest",
          mode: "add",
          requestedVersion: null,
          hosts: [
            { ecosystem: "node-runtime", name: "node", version: "20.11.0" },
            { ecosystem: "npm", name: "typescript", version: "5.9.3" },
          ],
          force: false,
        },
        NOW,
      );
      assert.equal(resolution.action, "use");
      assert.equal(resolution.selectedVersion, "4.9.0");
      assert.equal(resolution.walkedBack, true);
      assert.equal(resolution.reason, "walked-back-for-host-compatibility");
      assert.equal(resolution.compatible, true);
    } finally {
      ledger.close();
    }
  });

  void it("reuses a fresh ledger entry and refreshes a cadence-expired one", () => {
    const ledger = openVersionLedger(":memory:");
    const client = countingClient(snapshot({ constraintsByVersion: {} }));
    const request = {
      ecosystem: "npm" as const,
      name: "vitest",
      mode: "scaffold" as const,
      requestedVersion: null,
      hosts: [],
      force: false,
    };
    try {
      resolvePackageVersion(ledger, client, request, NOW);
      resolvePackageVersion(ledger, client, request, NOW);
      assert.equal(client.fetches(), 1);
      resolvePackageVersion(
        ledger,
        client,
        { ...request, force: true },
        NOW,
      );
      assert.equal(client.fetches(), 2);
    } finally {
      ledger.close();
    }
  });

  void it("refreshes a ledger entry once its release cadence has elapsed", () => {
    const ledger = openVersionLedger(":memory:");
    const body = snapshot({ constraintsByVersion: {} });
    const client = countingClient(body);
    try {
      ledger.write({
        ecosystem: "npm",
        name: "vitest",
        latestVersion: "5.0.0",
        ltsVersion: null,
        cadenceDays: 30,
        supportUntil: null,
        updatedAt: "2026-09-01T00:00:00.000Z",
        source: "npm",
        releases: body.releases,
        distTags: body.distTags,
        ltsVersions: [],
        constraintsByVersion: {},
      });
      const resolution = resolvePackageVersion(
        ledger,
        client,
        {
          ecosystem: "npm",
          name: "vitest",
          mode: "scaffold",
          requestedVersion: null,
          hosts: [],
          force: false,
        },
        NOW,
      );
      assert.equal(client.fetches(), 1);
      assert.equal(resolution.action, "use");
      assert.equal(resolution.selectedVersion, "5.0.0");
      assert.equal(resolution.stale, false);
    } finally {
      ledger.close();
    }
  });

  void it("asks for a web search when the registry probe is unavailable", () => {
    const ledger = openVersionLedger(":memory:");
    const client = countingClient(null);
    try {
      const resolution = resolvePackageVersion(
        ledger,
        client,
        {
          ecosystem: "npm",
          name: "vitest",
          mode: "add",
          requestedVersion: null,
          hosts: [],
          force: false,
        },
        NOW,
      );
      assert.equal(resolution.action, "needs-websearch");
      assert.equal(resolution.selectedVersion, null);
      assert.match(resolution.recordHint ?? "", /versions record/);
      assert.match(resolution.suggestedQuery ?? "", /vitest npm/);
    } finally {
      ledger.close();
    }
  });

  void it("honors an explicit version and holds an installed manifest version", () => {
    const ledger = openVersionLedger(":memory:");
    const client = countingClient(null);
    try {
      const pinned = resolvePackageVersion(
        ledger,
        client,
        {
          ecosystem: "npm",
          name: "vitest",
          mode: "add",
          requestedVersion: "3.2.4",
          hosts: [],
          force: false,
        },
        NOW,
      );
      const held = resolvePackageVersion(
        ledger,
        client,
        {
          ecosystem: "npm",
          name: "typescript",
          mode: "hold",
          requestedVersion: "5.9.3",
          hosts: [],
          force: false,
        },
        NOW,
      );
      assert.equal(pinned.action, "pin");
      assert.equal(pinned.selectedVersion, "3.2.4");
      assert.equal(held.action, "hold");
      assert.equal(held.selectedVersion, "5.9.3");
      assert.equal(held.channel, "installed");
      assert.equal(client.fetches(), 0);
    } finally {
      ledger.close();
    }
  });

  void it("reports incompatibility instead of installing a rejected release", () => {
    const ledger = openVersionLedger(":memory:");
    const client = countingClient(
      snapshot({
        constraintsByVersion: {
          "5.0.0": constraints({ node: ">=22" }),
          "4.9.0": constraints({ node: ">=22" }),
        },
      }),
    );
    try {
      const resolution = resolvePackageVersion(
        ledger,
        client,
        {
          ecosystem: "npm",
          name: "vitest",
          mode: "add",
          requestedVersion: null,
          hosts: [{ ecosystem: "node-runtime", name: "node", version: "18.20.4" }],
          force: false,
        },
        NOW,
      );
      assert.equal(resolution.action, "incompatible");
      assert.equal(resolution.selectedVersion, null);
      assert.equal(resolution.compatible, false);
    } finally {
      ledger.close();
    }
  });
});

void describe("versions CLI", () => {
  void it("records a web-search result and serves it until the cadence expires", () => {
    const dbPath = path.join(
      mkdtempSync(path.join(tmpdir(), "apex-versions-")),
      "ledger.sqlite",
    );
    const stdout: string[] = [];
    const client = countingClient(null);
    const recordCode = executeVersionCommand(
      [
        "record",
        "--ecosystem",
        "npm",
        "--name",
        "vitest",
        "--latest",
        "5.0.5",
        "--cadence-days",
        "21",
        "--source",
        "websearch",
        "--constraints-json",
        JSON.stringify({
          "5.0.5": {
            peers: { vite: "^6.0.0 || ^7.0.0" },
            engines: { node: "^20.0.0 || ^22.0.0 || >=24.0.0" },
            developedAgainst: { typescript: "5.4.5" },
            optionalPeers: [],
          },
        }),
      ],
      {
        ledgerPath: dbPath,
        now: NOW,
        stdout: (chunk) => {
          stdout.push(chunk);
        },
        stderr: () => undefined,
      },
    );
    const resolveCode = executeVersionCommand(
      [
        "resolve",
        "--ecosystem",
        "npm",
        "--name",
        "vitest",
        "--mode",
        "add",
        "--host",
        "node-runtime:node@22.14.0",
        "--host",
        "npm:typescript@5.9.3",
        "--host",
        "npm:vite@7.0.0",
      ],
      {
        ledgerPath: dbPath,
        now: NOW,
        client,
        stdout: (chunk) => {
          stdout.push(chunk);
        },
        stderr: () => undefined,
      },
    );
    assert.equal(recordCode, 0);
    assert.equal(resolveCode, 0);
    assert.equal(client.fetches(), 0);
    const recorded = JSON.parse(stdout[0] ?? "{}") as { action?: string };
    const resolved = JSON.parse(stdout[1] ?? "{}") as {
      action?: string;
      selectedVersion?: string;
      source?: string;
    };
    assert.equal(recorded.action, "recorded");
    assert.equal(resolved.action, "use");
    assert.equal(resolved.selectedVersion, "5.0.5");
    assert.equal(resolved.source, "websearch");
  });

  void it("rejects a resolve invocation that omits the mode", () => {
    const stderr: string[] = [];
    const code = executeVersionCommand(
      ["resolve", "--ecosystem", "npm", "--name", "vitest"],
      {
        ledgerPath: ":memory:",
        stderr: (chunk) => {
          stderr.push(chunk);
        },
        stdout: () => undefined,
      },
    );
    assert.equal(code, 2);
    assert.match(stderr.join(""), /--mode/);
  });
});
