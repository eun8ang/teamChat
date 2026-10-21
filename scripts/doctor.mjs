import { spawnSync } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = fileURLToPath(new URL("..", import.meta.url));
const gitEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);
let failures = 0;

function report(level, message) {
  console.log(`[${level}] ${message}`);
  if (level === "FAIL") failures += 1;
}

function run(command, args, env = process.env) {
  return spawnSync(command, args, {
    cwd: projectDirectory,
    env,
    encoding: "utf8",
    timeout: 15_000,
    windowsHide: true,
  });
}

function npm(args) {
  // npm run supplies its JS entry point, avoiding shell command interpolation.
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) {
    return run(process.execPath, [process.env.npm_execpath, ...args]);
  }
  if (process.platform === "win32") {
    return run("cmd.exe", ["/d", "/s", "/c", "npm", ...args]);
  }
  return run("npm", args);
}

console.log("Team Chat workshop environment check (read-only)\n");

const nodeMajor = Number(process.versions.node.split(".")[0]);
report(
  nodeMajor === 24 ? "OK" : "FAIL",
  `Node.js ${process.versions.node}${nodeMajor === 24 ? "" : " — Use 24.x (see .nvmrc)."}`,
);

const gitVersion = run("git", ["--version"], gitEnvironment);
const hasGit = !gitVersion.error && gitVersion.status === 0;
report(hasGit ? "OK" : "FAIL", hasGit ? "Git is available" : "Install Git and reopen your terminal.");

const npmVersion = npm(["--version"]);
const hasNpm = !npmVersion.error && npmVersion.status === 0;
report(hasNpm ? "OK" : "FAIL", hasNpm ? "npm is available" : "npm failed — Check your Node.js 24 installation.");

if (hasNpm) {
  const npmRegistry = npm(["config", "get", "registry"]);
  report(
    !npmRegistry.error && npmRegistry.status === 0 ? "OK" : "WARN",
    !npmRegistry.error && npmRegistry.status === 0
      ? "Optional: npm registry configuration is readable (value hidden)"
      : "Optional: cannot read npm registry configuration. Check it if npm ci fails.",
  );
}

const modulesDirectory = resolve(projectDirectory, "node_modules");
const hasDependencies = existsSync(modulesDirectory) && statSync(modulesDirectory).isDirectory();
report(
  hasDependencies ? "OK" : "FAIL",
  hasDependencies ? "Project node_modules exists" : "Dependencies missing — Run npm ci in this directory.",
);

if (hasGit) {
  const repository = run("git", ["rev-parse", "--show-toplevel"], gitEnvironment);
  if (!repository.error && repository.status === 0) {
    const repositoryDirectory = repository.stdout.trim();
    const isProjectRepository =
      existsSync(repositoryDirectory) &&
      realpathSync(repositoryDirectory) === realpathSync(projectDirectory);
    if (isProjectRepository) {
      const remotes = run("git", ["remote"], gitEnvironment);
      const remoteCount = remotes.stdout?.trim().split(/\r?\n/).filter(Boolean).length ?? 0;
      report(
        !remotes.error && remotes.status === 0 && remoteCount > 0 ? "OK" : "WARN",
        remoteCount > 0
          ? `Found ${remoteCount} Git remote(s) (URLs and credentials hidden)`
          : "No Git remote — Check that you cloned the workshop repository.",
      );
    } else {
      report("WARN", "Project is inside a parent Git repository. Check your workshop clone directory.");
    }
  } else {
    report("WARN", "This directory is not a Git repository. Use your workshop clone directory.");
  }
}

console.log(`\n${failures === 0 ? "Basic environment checks passed" : `${failures} required check(s) failed`}.`);
console.log("This command does not verify remote authentication, network access, or installed package versions.");
process.exitCode = failures === 0 ? 0 : 1;
