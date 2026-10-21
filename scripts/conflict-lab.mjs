import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";

// Every Git command runs inside this new temporary directory. Ignore inherited
// Git overrides so an existing GIT_DIR/GIT_WORK_TREE cannot target another repo.
const labDirectory = mkdtempSync(join(tmpdir(), "teamchat-conflict-"));
const labEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);
Object.assign(labEnvironment, {
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_TERMINAL_PROMPT: "0",
});

const english = process.argv.includes("--en");
const roomLabel = english ? "Workshop room" : "실습방";
const titleFile = "src/config/chat.ts";
const hooksDirectory = join(labDirectory, ".git", "workshop-empty-hooks");

function git(args, allowedStatuses = [0]) {
  const result = spawnSync(
    "git",
    [
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.autocrlf=false",
      "-c",
      `core.hooksPath=${hooksDirectory}`,
      ...args,
    ],
    { cwd: labDirectory, env: labEnvironment, encoding: "utf8" },
  );

  if (result.error) {
    throw new Error(`${english ? "Git execution failed" : "Git 실행 실패"}: ${result.error.message}`);
  }
  if (!allowedStatuses.includes(result.status)) {
    throw new Error(
      `git ${args.join(" ")}: ${english ? "failed (exit code" : "실패 (종료 코드"} ${result.status}).\n${result.stderr || result.stdout}`,
    );
  }
  return result;
}

function writeTitle(title) {
  writeFileSync(join(labDirectory, titleFile), `export const CHAT_TITLE = "${title}";\n`);
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

try {
  git(["init", "--initial-branch=main", "--template=", "."]);
  mkdirSync(hooksDirectory, { recursive: true });
  git(["config", "--local", "user.name", "Workshop Learner"]);
  git(["config", "--local", "user.email", "learner@example.invalid"]);
  // Learners run plain `git commit` later, outside this script's subprocess
  // environment. Keep their existing global signing and hooks out of the lab.
  git(["config", "--local", "commit.gpgsign", "false"]);
  git(["config", "--local", "core.hooksPath", hooksDirectory]);

  mkdirSync(join(labDirectory, "src", "config"), { recursive: true });
  writeTitle("Team Chat");
  git(["add", titleFile]);
  git(["commit", "-m", "chore: start isolated conflict exercise"]);
  const startingCommit = git(["rev-parse", "HEAD"]).stdout.trim();

  git(["switch", "-c", "feature/title-emoji"]);
  writeTitle("💬 Team Chat");
  git(["add", titleFile]);
  git(["commit", "-m", "feat: add chat title emoji"]);

  git(["switch", "-c", "feature/title-room", startingCommit]);
  writeTitle(`Team Chat · ${roomLabel}`);
  git(["add", titleFile]);
  git(["commit", "-m", "feat: label the workshop room"]);

  git(["switch", "main"]);
  git(["merge", "--no-ff", "feature/title-emoji", "-m", "Merge emoji title into main"]);
  git(["switch", "feature/title-room"]);
  const merge = git(["merge", "--no-edit", "main"], [1]);
  const conflictedFiles = git(["diff", "--name-only", "--diff-filter=U"]).stdout.trim();
  const conflict = readFileSync(join(labDirectory, titleFile), "utf8");

  if (
    merge.status !== 1 ||
    conflictedFiles !== titleFile ||
    !conflict.includes("<<<<<<< HEAD") ||
    !conflict.includes(">>>>>>> main")
  ) {
    throw new Error(english ? "Could not create the expected title conflict." : "예상한 제목 충돌을 만들지 못했습니다.");
  }

  if (english) {
    console.log(`\nConflict exercise ready. Branch: feature/title-room`);
    console.log(`Temporary repository: ${labDirectory}`);
    console.log("This isolated repository has no remote. Your project is unchanged.");
    console.log(`\n1. cd ${shellQuote(labDirectory)}`);
    console.log("   git status\n   git diff");
    console.log(`\n2. Edit ${titleFile}, remove all conflict markers, and keep both changes:`);
    console.log('   export const CHAT_TITLE = "💬 Team Chat · Workshop room";');
    console.log("   HEAD adds the room label; main adds the emoji.");
    console.log(`\n3. git add ${titleFile}`);
    console.log('   git commit -m "fix: preserve both chat title changes"');
    console.log("   git status\n   git log --oneline --graph --all --decorate");
    console.log("\nExit code 0 means setup succeeded. The conflict is left for you to resolve.");
    console.log("Each run creates a new temporary repository. Remove it when finished.");
  } else {
    console.log(`\n충돌 실습 준비 완료. 현재 브랜치: feature/title-room`);
    console.log(`임시 저장소: ${labDirectory}`);
    console.log("실습 저장소는 원래 프로젝트와 분리되어 있으며 원격 저장소가 없습니다.\n");
    console.log("1. 아래 명령으로 임시 저장소에 들어가 충돌을 확인하세요.");
    console.log(`   cd ${shellQuote(labDirectory)}`);
    console.log("   git status");
    console.log("   git diff\n");
    console.log(`2. 편집기에서 ${titleFile}을 열어 충돌 표시를 모두 지우고 한 줄로 저장하세요.`);
    console.log('   export const CHAT_TITLE = "💬 Team Chat · 실습방";\n');
    console.log("   HEAD 쪽은 실습방 문구, main 쪽은 이모지 변경입니다. 두 요구를 함께 보존합니다.\n");
    console.log("3. 해결한 파일을 커밋하고 합쳐진 이력을 확인하세요.");
    console.log(`   git add ${titleFile}`);
    console.log('   git commit -m "fix: preserve both chat title changes"');
    console.log("   git status");
    console.log("   git log --oneline --graph --all --decorate\n");
    console.log("준비 명령이 종료 코드 0으로 끝난 것은 정상입니다. 충돌은 학습자가 해결하도록 남겨 두었습니다.");
    console.log("다시 실행하면 별도의 새 임시 저장소를 만듭니다. 연습을 끝낸 임시 폴더는 직접 삭제해도 됩니다.");
  }
} catch (error) {
  console.error(`${english ? "Conflict exercise setup failed" : "충돌 실습 준비 실패"}: ${error.message}`);
  console.error(`${english ? "Created temporary directory" : "생성된 임시 경로"}: ${labDirectory}`);
  process.exitCode = 1;
}
