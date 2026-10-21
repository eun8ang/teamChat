# 함께 작업하기

[English](CONTRIBUTING.md) | **한국어**

이 저장소는 Team Chat 화면을 작은 Issue 단위로 개선하는 Git·GitHub 실습용 프로젝트입니다. 기능 작업은 최신 `develop`에서 시작하고 `develop`을 대상으로 PR을 만듭니다. `main`과 `develop`에는 직접 push하지 않습니다.

참가자는 미리 배포된 공유 채팅방에서 함께 메시지를 보냅니다. 이름은 각자가 정한 표시 이름이며 계정 인증을 뜻하지 않습니다. UI 티켓은 관련 컴포넌트·스타일을 중심으로 수정하고, 공유 메시지 API 계약과 Production·Preview·로컬의 데이터 분리 설정을 보존합니다.

## 필수 Git 스킬과 작성 규칙

AI로 커밋 메시지·PR 제목·본문·Draft PR을 생성하기 전에 반드시 [git-issue-pr](.agents/skills/git-issue-pr/SKILL.md)을 읽고 적용합니다. Claude Code에서는 `/git-issue-pr`로 호출할 수 있습니다. 제안 문구만 작성할 때도 적용하며, 스킬 사용 자체가 게시·병합을 허가하지는 않습니다.

커밋 제목과 PR 제목은 영문 `<type>(optional-scope): imperative description (#actual-issue-number)` 형식을 사용합니다. 허용 type은 `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`입니다. 새 기능은 `feat`, 버그 수정은 `fix`를 쓰며 Issue를 해결한다는 이유만으로 모두 `fix`를 쓰지 않습니다. 예: `feat: add emoji picker (#12)`. `CHAT-01` 같은 목록 ID 대신 실제 GitHub Issue 번호를 사용합니다.

## 준비

진행자가 스타터를 원격에 게시한 뒤 다음 명령으로 준비하세요. 이미 clone했다면 해당 `teamChat` 폴더에서 `git status`부터 실행합니다. Node.js는 `.nvmrc`와 같은 **24.x**를 사용합니다. 로컬 공유 채팅용 환경 변수는 [README](README.md)의 안내에 따라 준비하고, 진행자가 제공한 개발 환경을 사용하세요.

```bash
git clone https://github.com/eun8ang/teamChat.git
cd teamChat
git status
git config --local user.name "본인 이름"
git config --local user.email "GitHub에 연결된 본인 이메일"
npm ci
npm run doctor
npm run dev
```

`git config --local`은 현재 저장소에만 적용합니다. GitHub 인증이 끝났는지는 `doctor`로 검증하지 않습니다. 브라우저에서 `http://127.0.0.1:3000`을 열어 메시지 전송을 확인하세요. 개발 서버는 별도 터미널에서 실행해 둡니다.

## Issue → 작업 브랜치

GitHub **Issues → New issue → Workshop task**에서 배경, 수정 범위, 확인 가능한 수용 기준과 재현 순서를 작성합니다. Assignees에 본인을 지정하고 짝과 수정 파일이 겹치는지 확인하세요. 라벨과 마일스톤은 진행자가 저장소에 준비한 경우에만 선택합니다.

아래는 **실제 Issue가 #12이고 채팅 제목 문구 변경을 맡았을 때**의 예시입니다. 자신의 번호와 작업에 맞게 브랜치 이름을 바꾸세요.

```bash
git status
git fetch origin
git switch develop
git pull --ff-only origin develop
git switch -c feature/12-chat-title
```

로컬 `develop`이 없고 전환에 실패하면 `git switch --track origin/develop`으로 추적 브랜치를 만듭니다. 원격에도 `develop`이 없다면 진행자에게 준비 상태를 확인하세요. `git status`에 미완료 변경이 있으면 먼저 현재 작업을 정리합니다. `pull --ff-only`가 실패하면 원인을 확인하고 진행자와 해결합니다.

- 기능·디자인 개선: `feature/12-chat-title`
- 일반 버그 수정: `fix/13-blank-message`
- PR의 base: `develop`
- PR의 compare: 자신의 `feature/*` 또는 `fix/*` 브랜치

## 구현·확인·커밋

Issue의 수용 기준에 맞는 최소 변경을 하고 관련 파일을 직접 읽으세요. AI가 만든 코드도 작성자가 동작과 변경 이유를 설명할 수 있어야 합니다.

```bash
npm run lint
npm run typecheck
npm run test:ci
npm run build
git diff
git status --short
```

브라우저에서도 정상 흐름과 해당 변경의 경계 조건을 확인합니다. 제목 변경이라면 진행자와 정한 문구가 보이는지, 모바일에서 긴 제목이 레이아웃을 깨지 않는지, 기존 메시지 전송이 유지되는지 확인하세요. 실제 수정한 파일만 stage합니다. 아래 경로는 제목 문구를 변경했을 때의 예시입니다.

```bash
git add src/config/chat.ts
git diff --staged
git commit -m "feat: label our team chat (#12)"
git push -u origin feature/12-chat-title
```

관련 테스트 파일을 수정했다면 그 파일도 함께 stage합니다. 환경 파일·토큰·불필요한 lockfile 변경이 섞이지 않았는지 staged diff에서 확인하세요.

## PR·동료 리뷰·병합

1. GitHub에서 PR을 열고 **base `develop` / compare 내 작업 브랜치**를 확인합니다.
2. 완전히 해결한 Issue마다 본문에 `Fixes #12`를 독립된 한 줄로 쓰고, 변경 이유·수용 기준·실행 결과·직접 확인한 내용을 기록합니다. 일부 작업이나 참고 연결은 `Refs #12`를 사용하며 자동 종료 대상이 아닙니다. 예시 번호를 실제 GitHub Issue 번호로 바꾸세요.
3. Reviewers에 짝을 지정합니다. 검증 중에는 Draft로 두고 준비되면 Ready for review로 바꿉니다.
4. 리뷰어는 Issue·diff·검사 결과를 보고 직접 동작을 확인합니다. 설명은 **Comment**, 병합 전에 필요한 수정은 **Request changes**로 남깁니다. 파일·재현 조건·기대 결과를 함께 적으세요.
5. 작성자는 같은 브랜치에서 수정하고 같은 PR에 push합니다. 검사를 다시 확인하고 재리뷰를 요청합니다.
6. 작성자 외 동료가 **Approve**를 제출합니다. AI의 의견을 확인하고 승인 판단은 사람이 합니다.
7. 진행자가 정한 병합 담당자가 필수 검사 성공·동료 승인·충돌 없음·최신 base 반영을 확인하고 **Create a merge commit**으로 병합합니다.
8. 진행자가 제공한 `develop` Preview에서 변경을 확인하고 Issue에 결과를 남깁니다. develop push 워크플로가 실제 병합된 PR을 확인하고 완전히 해결한 `Fixes` Issue를 completed 상태로 종료합니다. Issue 종료는 `develop` 통합을 뜻하며 Production 배포는 별도 릴리스 안내를 따릅니다.

참가자가 자동 종료를 사용하기 전에 해당 워크플로를 먼저 `develop`에 병합해야 합니다. GitHub 기본 종료 키워드는 기본 브랜치(`main`)에 적용되므로, 이 저장소는 develop push 워크플로로 통합 시 종료를 처리합니다. PR 생성·미병합 종료·feature 브랜치 push·`Refs` 참조로는 이 워크플로가 Issue를 종료하지 않습니다.

Approve는 리뷰 결과이고 Merge는 코드를 합치는 동작입니다. **Resolve conversation**은 리뷰 대화를 닫는 기능입니다.

PR에 최신 `develop`을 반영해야 할 때는 내 작업 브랜치에서 실행합니다.

```bash
git switch feature/12-chat-title
git fetch origin
git merge origin/develop
# 충돌이 있으면 파일을 편집해 해결하고 git add <해결한 파일> 후 git commit
npm run lint
npm run typecheck
npm run test:ci
npm run build
git push
```

기능 브랜치는 병합 뒤 재사용하지 않습니다. 다음 작업은 갱신한 `develop`에서 새로 만듭니다.

## 로컬 충돌 연습

```bash
npm run workshop:conflict
```

이 명령은 운영체제의 임시 폴더에 별도의 저장소를 만들고, `feature/title-emoji`와 `feature/title-room`이 같은 `src/config/chat.ts` 한 줄을 바꿔 충돌한 상태를 준비합니다. 출력된 `cd` 명령을 따라 임시 폴더로 이동하세요. 현재 프로젝트의 브랜치와 작업 파일에는 손대지 않으며 원격으로 push하지 않습니다.

충돌 표시를 지우고 두 요구가 남도록 다음 한 줄로 해결합니다.

```ts
export const CHAT_TITLE = "💬 Team Chat · 실습방";
```

```bash
git add src/config/chat.ts
git commit -m "fix: preserve both chat title changes"
git status
git log --oneline --graph --all --decorate
```

`git status`가 깨끗하고 병합 커밋에 두 제목 변경이 보이면 완료입니다. 연습 폴더를 나온 뒤 원래 프로젝트에서 실습을 이어가세요. `npm run workshop:conflict`를 다시 실행하면 새 임시 저장소가 생깁니다.
