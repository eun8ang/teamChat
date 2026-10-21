# Team Chat Lab

[English](README.md) | **한국어**

Git·GitHub 협업을 **본 실습 100분 + 소개·질문·지연 여유 20분**으로 진행하는 워크숍 스타터입니다. 사전 배포한 공유 채팅에 청중이 함께 접속하고, Next.js 채팅 UI를 바꾸며 Clone → Branching / Checkout → Commit → Push → PR → Review PR → Merge → Resolve merge conflicts → Deploy를 실습합니다.

**청중 접속:** [teamchat-jet.vercel.app](https://teamchat-jet.vercel.app)에서 이름을 입력합니다. 기능 PR은 `develop`에 모아 Preview로 확인하고, 마지막에 `develop → main` PR을 머지해 같은 운영 주소에서 개선 결과를 확인합니다.

## 실행

Node.js **24.x**와 Git이 필요합니다. macOS 진행자 환경에는 Node.js 24와 npm을 설치했습니다. 참가자는 기존 Node 버전 관리 도구가 있다면 `nvm install && nvm use`로 `.nvmrc`를 적용합니다.

```bash
git clone https://github.com/eun8ang/teamChat.git
cd teamChat
git switch develop
npm ci
npm run doctor
cp .env.example .env.local
# .env.local에 실습용 Redis 설정과 본인만의 CHAT_ROOM_PREFIX를 입력
npm run dev
```

[채팅 앱 열기](http://127.0.0.1:3000). 이미 이 프로젝트 폴더에 있다면 `npm run dev`부터 실행하면 됩니다.

이름을 입력하면 같은 채팅방의 다른 참가자와 대화합니다. 새 메시지는 약 1.5초 간격으로 반영하며, 숨긴 탭은 조회를 멈춥니다. 메시지는 Redis에 저장하므로 새로고침하거나 UI를 다시 배포해도 유지됩니다. 이름과 임시 참가자 ID는 탭별 `sessionStorage`에 보관하며, 계정 인증을 제공하는 서비스는 아닙니다.

## 공유 채팅 설정

Vercel Marketplace의 **Upstash for Redis / Free**를 사용합니다. 자동 유료 전환과 Production Pack은 끕니다. 저장소 인증정보는 서버에서만 사용합니다.

| 환경변수 | 용도 |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | Redis REST 엔드포인트 |
| `UPSTASH_REDIS_REST_TOKEN` | Redis 쓰기·읽기용 서버 비밀값 |
| `CHAT_ROOM_PREFIX` | 데이터 분리: 운영 `teamchat:production`, 통합 실습 `teamchat:preview`, 개인 개발 `teamchat:local:이름` |
| `NEXT_PUBLIC_BUILD_SHA` | 화면에서 배포 커밋을 확인하는 공개 값 |

Vercel 연동이 만든 `KV_REST_API_URL`·`KV_REST_API_TOKEN`도 호환합니다. 설정이 없으면 API는 503을 반환하며 공유되지 않는 가짜 채팅으로 대체하지 않습니다. 참가자에게는 실습용 서버 설정을 따로 전달하며 Vercel·GitHub 관리 토큰을 배포하지 않습니다.

진행자 로컬의 `.env.local`에는 개발용 Redis 연결 설정을 준비했습니다. 이 파일은 Git에서 제외하며 접근 권한을 제한했습니다. 제공된 GitHub·Vercel 관리 토큰은 이 파일에 넣지 않았습니다.

최근 메시지 100개를 처음 불러오고 이후 새 메시지만 받습니다. 서버에는 최근 500개까지 보관하며 마지막 메시지 이후 24시간 동안 새 메시지가 없으면 방 기록이 만료됩니다. 입력 길이·이름·전송 빈도를 서버에서도 검사하고, 재시도한 같은 메시지는 중복 저장하지 않습니다. UI 티켓에서는 이 데이터 계층과 운영 prefix를 변경하지 않습니다.

연결된 Free 플랜은 월 50만 명령 한도이며 자동 유료 전환은 껐습니다. 교육 전 예상 동시 접속 인원으로 전달 지연과 사용량을 확인합니다.

## 발표와 실습

```bash
npm run present
```

[발표 화면 열기](http://127.0.0.1:4173). 큰 용어 제목과 Git 흐름도로 설명한 뒤 터미널·에디터·GitHub에서 같은 작업을 보여줍니다.

상단 **한국어 / English** 선택 메뉴로 현재 슬라이드를 유지하면서 언어를 변경합니다. 슬라이드·버튼·흐름도가 함께 전환되며, URL에 언어와 슬라이드가 반영되어 새로고침하거나 링크를 공유해도 유지됩니다. 영어 참가자용 [진행표](docs/workshop.en.md)와 `npm run workshop:conflict:en`도 제공합니다.

- [100분 진행표와 실습 명령](docs/workshop.md)
- [큰 Git 흐름도](docs/git-flow.svg)
- [상세 운영 계획과 확장 과정](git-github-workshop-plan.md)
- [브랜치·PR·리뷰 규칙](CONTRIBUTING.ko.md)

```bash
npm run workshop:conflict
```

충돌 연습은 OS 임시 폴더에 별도 Git 저장소를 만듭니다. 출력된 경로로 이동해 같은 제목을 바꾼 두 브랜치의 충돌을 직접 해결합니다.

## 검사

```bash
npm run check
```

ESLint → TypeScript → Vitest → Production build를 실행합니다. `npm run test:ci`로 테스트만 실행할 수 있습니다. 버전은 `package.json`과 `package-lock.json`에 고정합니다.

의존성 점검에서 Production 의존성의 알려진 취약점은 0건이었습니다. 개발 도구의 Vercel CLI·ESLint 종속성에는 경고가 남아 있습니다. Vite는 패치 버전으로 올렸고, CLI의 tar는 `overrides`로 패치 버전에 고정했습니다. 호환성 확인 없이 `npm audit fix --force`를 실행하지 않습니다.

## Vercel·GitHub Actions

Vercel 프로젝트: [`cw-my/teamchat`](https://vercel.com/cw-my/teamchat), Node.js `24.x`. 로컬 연결 정보는 Git에서 제외한 `.vercel/project.json`에 있습니다. 토큰은 프로젝트 파일에 저장하지 않습니다.

| 이벤트 | 검사 | 배포 |
| --- | --- | --- |
| feature 등 작업 브랜치 push | push-ci | 없음 |
| 모든 PR | workshop-ci | 없음 |
| develop push | push-ci 성공 후 | Preview |
| main push | push-ci 성공 후 | Production |

Git 자동 배포는 `vercel.json`에서 끄고 Actions가 배포를 담당합니다. 필요한 repository Actions secrets는 다음과 같습니다.

[PR 검사](.github/workflows/pr-checks.yml)와 [push 검사·배포](.github/workflows/workshop.yml)를 구분합니다. 브랜치 보호의 필수 검사는 PR용 `workshop-ci`입니다.

`develop → main` PR을 머지하면 main의 push 이벤트로 **검사·테스트·빌드 → 성공 시 Production 배포**가 실행됩니다. PR의 Approve만으로 배포되지는 않습니다. `release/*` 브랜치는 확장 과정에서 선택적으로 사용합니다.

| 이름 | 값 |
| --- | --- |
| `VERCEL_TOKEN` | 제공한 배포 토큰을 비밀값 입력창에 등록 |
| `VERCEL_ORG_ID` | `team_rahK1hPbGerm53jaqqOGOEkP` |
| `VERCEL_PROJECT_ID` | `prj_PE3p8eCd0HX2jIlVkLAgMOsBeIuN` |

저장소 관리자 권한이 있는 계정으로 [Actions secrets 설정](https://github.com/eun8ang/teamChat/settings/secrets/actions)을 열어 등록합니다. CLI로 토큰을 등록하려면 `gh secret set VERCEL_TOKEN --repo eun8ang/teamChat`의 비밀값 입력 프롬프트를 사용합니다. 참가자에게 배포 토큰을 배포할 필요는 없습니다.

GitHub의 `main`·`develop`에는 PR, 동료 승인 1회, `workshop-ci` 성공을 요구하고 merge commit을 허용합니다. `deploy`는 PR에서 실행하지 않으므로 필수 검사로 지정하지 않습니다. Preview 접근 권한과 서로 다른 두 계정의 리뷰·머지는 워크숍 전에 확인합니다.

## 진행자 설정

- 원격 `origin`: `https://github.com/eun8ang/teamChat.git`.
- Vercel 프로젝트와 Upstash Free 공유 저장소를 연결했습니다.
- Production·Preview·development의 `CHAT_ROOM_PREFIX`를 분리했습니다.
- Repository Actions secrets와 `preview`·`production` 배포 환경을 등록했습니다.
- merge commit을 허용하고 squash·rebase merge와 작업 브랜치 자동 삭제는 껐습니다.

새 저장소를 다시 초기화하는 경우에만 아래 명령을 사용합니다. 참가자는 clone 후 `develop`에서 작업 브랜치를 만듭니다.

```bash
git push -u origin main
git push -u origin develop
git push origin workshop-start
```

원격에 새 커밋이 생겼다면 먼저 `git fetch origin`과 이력을 확인합니다. 강제 push는 사용하지 않습니다.
