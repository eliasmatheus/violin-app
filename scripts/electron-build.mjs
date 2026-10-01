import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const argv = process.argv.slice(2);
const target = ["mac", "win", "linux"].includes(argv[0]) ? argv.shift() : null;
const args = argv;
const requestedPlatform =
  target || args.find((arg) => ["--mac", "--win", "--linux"].includes(arg))?.slice(2);
const macBuild = requestedPlatform ? requestedPlatform === "mac" : process.platform === "darwin";
const platformArgs = target ? [`--${target}`] : [];

// The layered .icon needs actool from Xcode 26. The generated .icns also works
// for local packages on Macs that only have Command Line Tools installed.
let iconArgs = [];
if (macBuild) {
  try {
    const version = execFileSync("xcodebuild", ["-version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const major = Number(version.match(/^Xcode\s+(\d+)/m)?.[1] ?? 0);
    if (major < 26) throw new Error("Xcode 26 or newer is required for .icon");
    execFileSync("actool", ["--version"], { stdio: "ignore" });
  } catch {
    console.log("Xcode 26/actool indisponível; usando o ícone macOS estático (.icns).");
    iconArgs = ["--config.mac.icon=build/icon-mac.icns"];
  }
}

const result = spawnSync(
  process.execPath,
  [require.resolve("electron-builder/cli.js"), ...platformArgs, ...iconArgs, ...args],
  { stdio: "inherit" }
);
if (result.error) console.error(result.error);
process.exitCode = result.status ?? 1;
