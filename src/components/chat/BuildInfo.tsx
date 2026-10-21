import { version } from "../../../package.json";

export function BuildInfo() {
  const buildSha = process.env.NEXT_PUBLIC_BUILD_SHA;

  return (
    <span className="build-info" title={buildSha ? `Build commit: ${buildSha}` : "No build commit was supplied"}>
      <span aria-label={`Version ${version}`}><code>v{version}</code></span>
      <span aria-hidden="true">·</span>
      <span className="build-symbol" aria-hidden="true">⌘</span>
      Build <code>{buildSha ? buildSha.slice(0, 7) : "local"}</code>
    </span>
  );
}
