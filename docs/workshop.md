# Team Chat · 100분 협업 실습

총 120분 중 **100분은 실습, 20분은 인사·질문·인증·네트워크·배포 지연 여유**로 둔다. 시작할 때 모두 사전 배포된 같은 채팅방에 이름을 입력하고 실제로 대화한다. 그 앱의 작은 UI 변경 하나를 Issue → 브랜치 → PR → 동료 리뷰 → merge → 웹 확인까지 끝낸다. 공유 채팅 서버·저장은 사전 구현한다. 마지막에 **공동 develop→main PR 한 개**를 사람의 승인·CI 후 머지하고 처음 접속한 Production에서 개선 결과를 확인한다. 별도 release·hotfix 브랜치와 역반영 상세 실습은 후속 과정이다.

- 채팅방 입장: [teamchat-jet.vercel.app](https://teamchat-jet.vercel.app)
- 저장소: [eun8ang/teamChat](https://github.com/eun8ang/teamChat)
- 화면 자료: [큰 용어 화면](presenter.html) · [16:9 흐름도](git-flow.svg)
- 상세 준비·확장 과제: [전체 계획서](../git-github-workshop-plan.md)

## 교육 전 준비

진행자는 `main`·`develop`, 참가자 Write 권한, **기능 PR과 공동 릴리스 PR 모두 작성자 외 1명 승인**, required check `workshop-ci`, merge commit 허용을 확인한다. 참가자가 자동 종료를 사용하기 전에 [Issue 종료 워크플로](../.github/workflows/close-linked-issues.yml)를 `develop`에 먼저 병합한다. **교육 전에 공유 채팅 backend·저장·Vercel 배포를 완성**하고 Production 입장 URL을 준비한다. 두 브라우저가 서로 다른 이름으로 같은 방에 들어가 메시지를 주고받고, 새로고침과 UI 재배포 뒤에도 기록이 남는지 검증한다. 서버 구축·DB 설정은 100분 수업에 추가하지 않는다.

Production 관객방은 같은 backend와 안정된 데이터 prefix를 계속 사용한다. develop Preview·로컬 실습은 별도 prefix로 분리한다. 같은 backend를 쓰더라도 실습 메시지가 Production에 섞이지 않아야 한다. Preview 접근권한을 주고 기능 PR·develop→main PR 검사와 main Production 배포 시간을 측정한다. develop에는 최신 main 이력이 반영되어 있어야 한다. 실제 서버 변수명·연결 방법은 README를 따른다. 로컬 파일만으로 공유 채팅·원격 설정·배포가 완료된 것으로 보지 않는다.

참가자는 D-1에 Git·Node 24, GitHub 인증·초대 수락, 사용할 AI 도구를 확인하고 `npm ci`와 로컬 앱 실행까지 마친다. `git config user.name`, `git config user.email`이 비어 있다면 저장소 안에서 본인 값으로 설정한다. 진행자는 두 명씩 리뷰 짝을 정하고 **서로 다른 주 수정 파일**을 배정한다.

`npm run present` 후 `http://127.0.0.1:4173`을 열거나 `docs/presenter.html`을 브라우저로 직접 열고 전체 화면에서 글자 크기와 흐름도를 확인한다. 터미널·에디터·GitHub 화면도 확대한다. 자료는 외부 폰트·CDN 없이 로컬에서 열린다.

## 시간표

| 경과 | 용어 화면 | 함께 할 일 | 확인 |
| --- | --- | --- | --- |
| 00–10분 | Flow | 같은 Production 방에 이름 입력·입장·인사, 전체 흐름 | 서로의 실제 메시지 확인 |
| 10–20분 | Clone | clone, develop 전환, 앱 실행 | origin·현재 브랜치·localhost |
| 20–30분 | Branching / Checkout | Issue·담당자, 최신 develop에서 분기 | Issue 번호와 feature 브랜치 |
| 30–50분 | Commit & Push | AI와 작은 변경, diff·검증, commit·push | 작은 변경이 원격에 있음 |
| 50–75분 | PR / Review PR / Merge | develop 기능 PR·짝 리뷰·CI·승인·merge | 동료 승인과 develop 통합 |
| 75–90분 | Resolve merge conflicts | 임시 충돌 실습 중 공동 develop→main PR 검사·대표 리뷰 | 충돌 해결과 릴리스 PR 승인 |
| 90–100분 | Release PR / Deploy | 공동 PR merge·main CI/CD·Production SHA·개선 UI·대화 확인 | 처음 접속한 Production에 개선 반영 |

기능 PR은 최신 develop 반영·CI·재승인 여부를 확인해 순서대로 머지한다. **75분에 develop을 동결하고 공동 develop→main PR 한 개를 연다.** 릴리스 검사는 충돌 실습과 겹쳐 기다린다. 작성자 외 대표 리뷰어가 승인하면 가능하면 85~90분에 머지해 Production 배포 대기도 겹친다. 지연 시 90~95분에 머지하고 운영 여유를 쓴다. 20분 여유는 새 필수 과제를 넣는 데 사용하지 않는다.

## 시작 10분: 같은 채팅방에서 먼저 대화

1. [사전 배포 Production 채팅방](https://teamchat-jet.vercel.app)을 각자 기기에서 연다.
2. 표시 이름을 입력해 같은 방에 입장하고 한 문장씩 보낸다.
3. 다른 참가자의 이름과 메시지가 내 화면에 도착하는지 확인한다.
4. 새로고침해 이미 보낸 메시지가 남아 있는지 확인하고, 이 앱을 함께 개선한다는 목표를 설명한다.

배포 URL·backend 연결은 교육 전에 준비한다. UI를 배포할 때도 기존 Production backend와 prefix를 유지해 같은 방의 대화가 이어지게 한다. 기능 통합은 짝이 같은 **develop Preview 실습방**에서 중간 확인하고, 마지막에는 공동 PR로 main에 배포해 처음 입장한 Production 관객방에서 개선된 UI를 확인한다. Preview 기록을 Production으로 복사하지 않는다.

## 1. Clone — 공유 저장소를 내 컴퓨터로

```bash
git clone https://github.com/eun8ang/teamChat.git
cd teamChat
git remote -v
git status
git fetch origin
git switch develop
git pull --ff-only origin develop
npm ci
npm run dev
```

이미 clone한 참가자는 다시 복제하지 않고 해당 폴더에서 `git status`부터 확인한다. 자동 추적이 안 되어 `git switch develop`이 실패하면 `git switch --track origin/develop`을 쓴다. `http://localhost:3000`을 연다. 로컬 서버의 저장 환경은 README의 개발 안내를 따르며 Production 관객방과 분리한다. 개발 서버 터미널은 유지하고 나머지 명령은 새 터미널에서 실행한다.

## 2. Branching / Checkout — 최신 develop에서 내 작업 시작

Issue에는 목적, 수정할 파일, 수용 기준 2~3개, 확인 방법, 본인 담당 지정을 넣는다. 기존 앱을 먼저 보고 **아직 하지 않은 작은 개선**을 고른다. 아래 `12`는 실제 Issue 번호로 바꾼다.

```bash
git status
git switch develop
git pull --ff-only origin develop
git switch -c feature/12-chat-title
git branch --show-current
```

- **Branching:** 독립된 작업 이력을 만든다. `git branch <이름>`은 만들기만 한다.
- **Checkout:** 현재 작업할 브랜치를 바꾼다. 이 교육은 `git switch <이름>`을 사용한다.
- **`git switch -c`:** 브랜치를 만들고 바로 그 브랜치로 이동한다.

예시 한 명만 `src/config/chat.ts`의 제목을 바꾼다. 다른 참가자는 헤더 안내 문구, 말풍선 스타일, 이모지 버튼의 접근성, 메시지 수 표시 문구처럼 **별도 파일의 작은 수용 기준**을 맡는다. 이미 작동하는 기능 전체를 새로 구현하는 티켓으로 배정하지 않는다. 같은 파일을 만지는 PR은 진행자가 순서를 정한다. 사전 구현된 서버 API·저장·동기화 계약과 Production 데이터 prefix는 UI 티켓에서 변경하지 않는다.

## 3. AI와 구현 → Commit & Push

AI로 커밋 메시지나 PR 제목·본문·Draft를 생성하기 전에 반드시 [git-issue-pr](../.agents/skills/git-issue-pr/SKILL.md)을 읽고 적용한다. Claude Code는 `/git-issue-pr`로 호출한다. 영문 Conventional Commit 제목과 실제 Issue 번호를 사용하며, 새 기능은 `feat`, 버그 수정은 `fix`를 쓴다.

AI에 Issue 본문과 다음 범위를 준다.

```text
README.md, CONTRIBUTING.md, AGENTS.md, package.json과 관련 파일을 읽어라.
현재 브랜치와 Issue 수용 기준을 확인하고 필요한 최소 변경을 구현하라.
관련 없는 리팩터링·의존성·CI 변경은 하지 마라.
이미 동작하는 공유 채팅 API·저장·동기화와 환경별 데이터 분리를 유지하라.
실제로 실행한 검증과 미실행 검증을 구분해 보고하라.
변경 이유와 남은 한계를 설명하라. push·승인·merge는 사람이 수행한다.
```

작성자가 diff를 읽고 실행·화면 검증을 한다. 아래는 제목 변경 예시다. 실제 바꾼 파일과 관련 테스트만 stage한다.

```bash
git status
git diff
npm run lint
npm run typecheck
npm run test:ci
npm run build
git diff --check
git add src/config/chat.ts
git diff --staged
git commit -m "feat: update workshop chat title (#12)"
git push -u origin feature/12-chat-title
```

Commit은 로컬 기록이고 Push는 원격 반영이다. 검증 실패는 같은 브랜치에서 고친다. `pull --ff-only`가 실패하면 상태와 분기 이력을 확인한다.

## 4. PR → Review PR → Merge

1. GitHub에서 **base=`develop`**, compare=`feature/12-chat-title`로 PR을 만든다.
2. 완전히 해결한 실제 Issue마다 본문에 `Fixes #12`를 독립된 한 줄로 쓰고 변경 이유·수용 기준별 결과·실제 실행한 검사·화면 확인을 기록한다. 일부 작업이나 참고 연결은 `Refs #12`를 사용한다. develop push 워크플로가 실제 병합된 PR을 확인해 해결한 Issue를 completed로 종료한다. 이 종료는 develop 통합을 뜻하며 Production 배포와는 별도다.
3. 짝을 Reviewer로 지정한다. 리뷰어는 Issue·Files changed·CI를 읽고 필요한 동작을 로컬에서 확인한다.
4. AI에는 Issue·diff·CI 결과를 함께 주고 근거 있는 결함·경계 조건을 찾게 한다. 최종 리뷰 판단은 사람이 한다.
5. 질문은 **Comment**, 머지 전 수정이 필요한 결함은 **Request changes**, 검토 완료는 **Approve**로 제출한다. 작성자는 자기 PR을 승인하지 않는다.
6. 수정은 같은 브랜치에 commit·push한다. CI·변경된 diff·필요한 재승인을 확인한다.
7. 승인·`workshop-ci` 성공·충돌 없음·최신 base를 확인하고 **Create a merge commit**으로 머지한다.

**Approve는 리뷰 결과, Merge는 코드 통합이다.** Resolve conversation은 리뷰 대화를 닫는 기능이며 파일 충돌 해결과 별개다. 작성자는 무엇을, 왜 바꿨고, 무엇을 확인했는지 설명한다.

## 5. Resolve merge conflicts — 두 요구를 모두 보존

### 15분 로컬 실습

teamChat 폴더에서 실행한다. 스크립트는 OS 임시 폴더에 별도 Git 저장소를 만들고, 충돌을 재현한 뒤 **실습 폴더로 이동할 `cd` 명령**을 출력한다.

```bash
npm run workshop:conflict
```

출력된 경로로 이동한다. 이 실습은 `feature/title-emoji`의 `💬 Team Chat`을 lab의 `main`에 합친 뒤, `feature/title-room`에 main을 merge한 상태다. 파일 `src/config/chat.ts`에 충돌 표시가 있다.

```text
  <<<<<<< HEAD
export const CHAT_TITLE = "Team Chat · 실습방";
  =======
export const CHAT_TITLE = "💬 Team Chat";
  >>>>>>> main
```

HEAD는 현재 room 브랜치, incoming main은 이모지를 추가한 쪽이다. 한쪽 코드를 무조건 선택하거나 상수를 두 번 선언하지 말고 **양쪽 의도**를 합친다.

```ts
export const CHAT_TITLE = "💬 Team Chat · 실습방";
```

파일을 저장한 뒤 다음을 실행한다.

```bash
git status
git diff --check
git add src/config/chat.ts
git diff --staged
git commit -m "fix: preserve emoji and room title"
git status
git log --oneline --graph --all -8
```

충돌 표시가 없고, 💬와 실습방이 모두 있으며, merge commit과 깨끗한 작업 트리가 있으면 완료다. 임시 저장소에는 remote가 없으므로 push하지 않는다. 팀 앱 확인을 위해 원래 teamChat 폴더로 돌아간다.

### 실제 PR이 충돌했다면

실제 저장소에서는 **내 feature에 최신 develop을 합친다**. 위 임시 실습의 main은 교육용 기준 브랜치이고, 아래 명령의 대상은 `origin/develop`이다.

```bash
git status
# 먼저 미커밋 변경을 정리한 뒤 실행한다.
git fetch origin
git switch feature/12-chat-title
git merge origin/develop
# 충돌 파일을 편집 → git add <파일> → 검사 → git commit → git push
```

해결 후 CI와 동료 검토를 다시 확인한다. 병합을 중단하려면 `git merge --abort`를 사용한다.

## 6. Release PR → Deploy — 처음 접속한 Production에 반영

대표 한 쌍이 공동 릴리스 PR을 맡고 나머지는 같은 기록을 함께 확인한다. 참가자마다 main 대상 PR을 새로 만들지 않는다.

1. 기능 PR을 모두 develop에 합친 **75분경** 변경을 동결하고 **base=`main`, compare=`develop`** PR 한 개를 연다. 포함 Issue와 develop 검증 결과를 기록한다. 별도 release 브랜치를 만들지 않는다.
2. 모두 임시 충돌 실습을 하는 동안 릴리스 PR의 `workshop-ci`를 실행한다. 작성자 외 대표 리뷰어가 diff·CI·통합 검증 결과를 확인하고 **Approve**한다. AI 리뷰만으로 사람 승인을 대신하지 않는다.
3. 승인·CI 성공·충돌 없음·최신 base 조건을 만족하면 대표가 **Create a merge commit**으로 main에 머지한다. 가능하면 85~90분에 진행해 배포 대기를 겹친다.
4. **main push**의 GitHub Actions 실행에서 CI와 deploy 성공을 확인한다. PR 검사 성공만으로 Production 배포가 끝난 것은 아니다.
5. [처음 입장한 Production URL](https://teamchat-jet.vercel.app)을 새로고침한다. 화면 footer SHA를 성공한 main 배포 SHA와 비교하고 이번 Issue의 UI 개선을 확인한다.
6. 기존 Production 대화가 유지되는지 확인하고 새 메시지를 주고받는다. 서로 다른 이름의 참가자가 같은 Production에서 메시지를 받아 보는지, 새로고침 뒤에도 기록이 남는지 확인한다.

**최종 결과는 Production URL + main 배포 SHA + 개선 UI + 실제 공유 대화**다. develop 통합 Preview는 중간 확인용이다. Production은 기존 Redis 연결과 Production prefix를 계속 사용하며 실습 메시지는 별도 Preview prefix에 남는다. UI 배포를 이유로 방의 기록이나 prefix를 초기화하지 않는다.

PR 머지·Issue 종료·배포 성공·웹 동작 확인은 서로 다른 상태다. 서비스 장애나 접근 실패는 실제 상태로 기록하고 이전 배포를 새 결과로 제출하지 않는다.

```text
Issue / 내 merged 기능 PR:
내가 리뷰한 PR:
충돌 해결 commit 또는 설명:
공동 develop→main PR:
main push Actions 실행 / Production URL / main 배포 SHA:
확인한 UI 개선 / 참가자 간 새 메시지 / 기존 기록·새로고침 후 유지:
미완료·미검증 항목:
```

## 진행자 전환·지연 대응

- 화면 키: `←` / `→` / `Space` 이전·다음, `G` 흐름도, `F` 전체 화면, `Home` 처음, `End` 마지막. 클릭 가능한 이전·다음 버튼도 있다.
- 시작 전: Production 관객방·develop 실습방의 데이터 분리, 실제 상호 전송·기록 저장·UI 재배포 후 연속성을 검증한다.
- 50분: 구현이 크면 범위를 줄이고 작은 PR부터 올린다. 리뷰는 짝별로 동시에 진행한다.
- 75분: 기능 통합을 동결해 공동 develop→main PR을 연다. 참가자는 준비된 대표 충돌 사례를 보고 임시 저장소에서 해결한다. 릴리스 PR 검사는 병렬로 기다린다.
- 85~90분: 대표 리뷰어의 사람 승인·CI 후 공동 PR을 머지해 Production 배포 대기를 겹친다. 늦어지면 90~95분과 운영 여유를 쓴다.
- 인증 문제: 보조 진행자가 지원하고 필요하면 짝 환경에서 공동 참여한다. 개인 완주와 공동 참여는 구분해 기록한다.
- CI·배포 대기: 충돌 실습과 겹쳐 기다린다. 여유 20분을 쓰되 전체 120분 안에 종료한다.
- 공유 대화 실패: 같은 URL·방·데이터 prefix·backend 연결을 확인한다. 한 브라우저에서 전송 버튼이 작동한 것만으로 공유 대화 성공으로 기록하지 않는다.
- 수업 후 진행자: main 머지 이력을 sync PR로 develop에 전파한다. 모든 참가자의 추가 필수 실습으로 만들지 않는다.
- 후속 과정: 별도 `release/*` 브랜치를 통한 릴리스와 역반영 상세 실습, `main → hotfix/* → main`은 [상세 계획서 10절](../git-github-workshop-plan.md#10-선택-시연확장-과정-release와-hotfix)을 따른다.
