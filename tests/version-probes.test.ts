import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRegistryClient,
  parseAdoptiumReleases,
  parseAdoptiumVersion,
  parseCrates,
  parseGoVersionList,
  parseMavenSearch,
  parseNodeIndex,
  parseNpmCatalog,
  parseNpmConstraints,
  parsePypi,
  parsePythonEol,
  parseRustStableChannel,
  parseUvPythonList,
  type ProbeIo,
} from "../src/version-probes.js";

function fakeIo(handlers: {
  readonly run?: (command: string, args: readonly string[]) => string | null;
  readonly fetchText?: (url: string) => string | null;
  readonly commands?: readonly string[];
}): ProbeIo & { readonly runs: () => number } {
  let runs = 0;
  return {
    runs(): number {
      return runs;
    },
    commandExists(command: string): boolean {
      return (handlers.commands ?? []).includes(command);
    },
    run(command: string, args: readonly string[]): string | null {
      runs += 1;
      return handlers.run?.(command, args) ?? null;
    },
    fetchText(url: string): string | null {
      return handlers.fetchText?.(url) ?? null;
    },
  };
}

void describe("registry probe parsers", () => {
  void it("reads npm dist-tags, publish times, and peer metadata", () => {
    const catalog = parseNpmCatalog(
      JSON.stringify({
        versions: ["5.0.0", "5.0.1-rc.1", "5.1.0"],
        time: {
          created: "2020-01-01T00:00:00.000Z",
          modified: "2026-10-01T00:00:00.000Z",
          "5.0.0": "2026-08-01T00:00:00.000Z",
          "5.1.0": "2026-10-01T00:00:00.000Z",
        },
        "dist-tags": { latest: "5.1.0", next: "5.0.1-rc.1" },
      }),
      "vitest",
    );
    assert.ok(catalog !== null);
    assert.equal(catalog.distTags["latest"], "5.1.0");
    assert.equal(catalog.releases.length, 3);
    const constraints = parseNpmConstraints(
      JSON.stringify({
        peerDependencies: { vite: "^6.0.0 || ^7.0.0" },
        engines: { node: "^20.0.0 || ^22.0.0 || >=24.0.0" },
        devDependencies: { typescript: "5.4.5" },
        peerDependenciesMeta: { vite: { optional: true } },
      }),
    );
    assert.ok(constraints !== null);
    assert.equal(constraints.peers["vite"], "^6.0.0 || ^7.0.0");
    assert.equal(constraints.developedAgainst["typescript"], "5.4.5");
    assert.deepEqual(constraints.optionalPeers, ["vite"]);
  });

  void it("separates Node.js current and LTS lines", () => {
    const snapshot = parseNodeIndex(
      JSON.stringify([
        { version: "v26.12.1", date: "2026-10-21", lts: false },
        { version: "v24.11.0", date: "2026-09-01", lts: "Krypton" },
        { version: "v25.0.0-rc.1", date: "2026-08-01", lts: false },
      ]),
    );
    assert.ok(snapshot !== null);
    assert.deepEqual(
      snapshot.releases.map((release) => release.version),
      ["26.12.1", "24.11.0"],
    );
    assert.deepEqual(snapshot.ltsVersions, ["24.11.0"]);
  });

  void it("reads Maven Central, PyPI, crates, and Go module versions", () => {
    const maven = parseMavenSearch(
      JSON.stringify({
        response: {
          docs: [
            { v: "4.0.0-M3", timestamp: 1_700_000_000_000 },
            { v: "4.1.2", timestamp: 1_760_000_000_000 },
          ],
        },
      }),
      "org.springframework.boot:spring-boot",
    );
    assert.ok(maven !== null);
    assert.deepEqual(
      maven.releases.map((release) => release.version),
      ["4.1.2"],
    );

    const pypi = parsePypi(
      JSON.stringify({
        info: {
          version: "0.115.0",
          requires_python: ">=3.8",
          requires_dist: ["pydantic>=2.0", "uvicorn[standard]>=0.12"],
        },
        releases: {
          "0.115.0": [
            {
              upload_time_iso_8601: "2026-01-01T00:00:00.000Z",
              requires_python: ">=3.8",
              yanked: false,
            },
          ],
        },
      }),
      "fastapi",
    );
    assert.ok(pypi !== null);
    const fastapi = pypi.constraintsByVersion["0.115.0"];
    assert.ok(fastapi !== undefined);
    assert.equal(pypi.distTags["latest"], "0.115.0");
    assert.equal(fastapi.engines["python"], ">=3.8");
    assert.equal(fastapi.developedAgainst["pydantic"], ">=2.0");

    const crates = parseCrates(
      JSON.stringify({
        crate: { max_stable_version: "1.0.0" },
        versions: [
          { num: "1.0.0", created_at: "2026-01-01T00:00:00.000Z", yanked: false },
          { num: "0.9.0", created_at: "2025-01-01T00:00:00.000Z", yanked: true },
        ],
      }),
      "serde",
    );
    assert.ok(crates !== null);
    assert.equal(crates.releases.length, 1);

    const go = parseGoVersionList(
      "github.com/gin-gonic/gin v1.9.1 v1.10.0\n",
      "github.com/gin-gonic/gin",
      "go-list",
    );
    assert.ok(go !== null);
    assert.deepEqual(
      go.releases.map((release) => release.version),
      ["1.9.1", "1.10.0"],
    );
  });

  void it("reads Rust, Python, and Java runtime metadata", () => {
    const rust = parseRustStableChannel(`
manifest-version = "2"
date = "2026-10-15"

[pkg.cargo]
version = "0.100.0 (abc 2026-08-27)"

[pkg.rust]
version = "1.99.1 (def 2026-10-15)"
`);
    assert.ok(rust !== null);
    const rustRelease = rust.releases[0];
    assert.ok(rustRelease !== undefined);
    assert.equal(rustRelease.version, "1.99.1");
    assert.equal(rustRelease.publishedAt, "2026-10-15");

    assert.deepEqual(parseUvPythonList("cpython-3.13.2-linux\ncpython-3.12.7-linux\n"), [
      "3.13.2",
      "3.12.7",
    ]);
    const python = parsePythonEol(
      JSON.stringify([
        { cycle: "3.13", latest: "3.13.2", eol: "2029-10-01", lts: false, releaseDate: "2024-10-07" },
        { cycle: "3.12", latest: "3.12.7", eol: "2028-10-01", lts: true, releaseDate: "2023-10-02" },
      ]),
    );
    assert.ok(python !== null);
    assert.deepEqual(python.ltsVersions, ["3.12.7"]);
    assert.equal(python.supportUntil, "2028-10-01");

    const majors = parseAdoptiumReleases(
      JSON.stringify({ most_recent_lts: 25, most_recent_feature_release: 27 }),
    );
    assert.ok(majors !== null);
    assert.equal(majors.ltsMajor, 25);
    assert.equal(
      parseAdoptiumVersion(
        JSON.stringify([
          { version: { openjdk_version: "25.0.5+8-LTS", semver: "25.0.5+8.0.LTS" } },
        ]),
      ),
      "25.0.5",
    );
  });

  void it("does not invoke a package manager for a flag-like package name", () => {
    const io = fakeIo({
      commands: ["npm"],
      run: () => {
        throw new Error("registry should not be called");
      },
    });
    const client = createRegistryClient(io);
    assert.equal(client.fetchSnapshot("npm", "-vitest"), null);
    assert.equal(io.runs(), 0);
  });

  void it("resolves an npm snapshot through the package manager client", () => {
    const io = fakeIo({
      commands: ["npm"],
      run(_command, args) {
        if (args.includes("versions")) {
          return JSON.stringify({
            versions: ["5.0.5"],
            time: { "5.0.5": "2026-10-20T00:00:00.000Z" },
            "dist-tags": { latest: "5.0.5" },
          });
        }
        return JSON.stringify({
          peerDependencies: { vite: "^6.0.0 || ^7.0.0" },
          engines: { node: ">=20" },
        });
      },
    });
    const snapshot = createRegistryClient(io).fetchSnapshot("npm", "vitest");
    assert.ok(snapshot !== null);
    const vitestConstraints = snapshot.constraintsByVersion["5.0.5"];
    assert.ok(vitestConstraints !== undefined);
    assert.equal(snapshot.source, "npm");
    assert.equal(snapshot.distTags["latest"], "5.0.5");
    assert.equal(vitestConstraints.peers["vite"], "^6.0.0 || ^7.0.0");
    assert.equal(io.runs(), 2);
  });
});
