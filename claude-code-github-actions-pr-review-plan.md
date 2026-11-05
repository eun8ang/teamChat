# Claude Code GitHub Actions PR 리뷰 도입 검토 및 실행 계획

- 작성일: 2026-11-05 (Asia/Seoul)
- 대상: `cw-malaysia/etrust.my.coway.com` — 비공개 저장소, 기본 브랜치 `dev`
- 상태: 검토 완료 / 구현 전
- 이번 산출물: 도입 판단과 구현·검증 계획. 워크플로 설치, Secret 등록, GitHub App 설치는 수행하지 않았다.

## 1. 검토 결론

**내부 PR을 대상으로, 사람의 리뷰를 보조하는 방식으로 시범 도입을 권장한다.** Java·SQL·JSP에 걸친 변경의 계약 불일치, 접근권한 누락, 개인정보 노출을 조기에 찾는 데 활용한다. 초기에는 merge 필수 검사로 지정하지 않는다.

사용자가 제시한 기능은 저장소의 워크플로에서 실행하는 `anthropics/claude-code-action`이다. 별도 관리형 Code Review 제품과 구분한다. PR 이벤트에 `prompt`를 지정하는 자동 실행이 가능하다. [공식 GitHub Actions 문서](https://code.claude.com/docs/en/github-actions)

권장 구현은 **저장소 전용 리뷰 프롬프트 + 커밋 단위 실행 관리**다. 공식 `code-review` 플러그인은 빠른 품질 비교에 사용할 수 있지만, 기존 Claude 댓글이 있는 PR을 건너뛰므로 운영 재리뷰 정책을 그대로 맡기기 어렵다. `synchronize` 이벤트만 추가해서 해결되는 문제가 아니다. [공식 플러그인 구현](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-review/commands/code-review.md)

## 2. 저장소에서 확인한 조건

| 확인 사항 | 근거 | 도입에 미치는 영향 |
| --- | --- | --- |
| Java 8, Spring 4.1.2, eGovFramework 3.6.0, WAR | `pom.xml` | Java 최신 문법·Spring Boot를 전제한 제안을 억제해야 한다. |
| Java 3,055개, SQLMap 489개, JSP 1,945개 | 현재 작업 트리 파일 집계 | 전체 저장소 분석보다 diff와 연관 계층을 중심으로 문맥을 수집한다. |
| 수동 Jenkins 배포 워크플로 1개 | `.github/workflows/cicd-etrust-publicapi-v1.0.yml` | 리뷰 전용 워크플로를 별도로 만든다. |
| 기존 러너는 `[self-hosted, jenkins]` | 같은 워크플로 | 리뷰는 GitHub-hosted runner에서 수행하고 배포 자격증명·내부망 접근을 공유하지 않는다. |
| 체크인된 PR 리뷰·빌드 워크플로 없음 | `.github/workflows/` | AI 리뷰 성공을 빌드·테스트 성공으로 취급할 수 없다. |
| `skipTests=true`, 로컬 JAR `systemPath`, 과거 HTTP Maven 저장소 | `pom.xml` | 전체 WAR 빌드 가능성과 테스트 실행은 별도 확인이 필요하다. |
| `CLAUDE.md`, `.claude/` 없음 | 현재 작업 트리 검색 | 저장소 리뷰 기준을 새로 정의한다. |
| README의 mirror 설명과 실제 워크플로가 다름 | `README.md`와 워크플로 비교 | 문서를 현재 배포 동작이나 확정된 업무 규칙으로 단정하지 않는다. |

GitHub CLI로 비공개 여부와 기본 브랜치를 조회했다. 조직 Actions 정책, 사용 가능 모델, Secret 유무, 브랜치 보호·CODEOWNERS 설정, 최근 PR 처리량은 이번 검토에서 확인하지 않았다.

## 3. 적용 범위와 리뷰 계약

### 실행 대상

- 초기 대상 브랜치는 `dev`. 다른 대상 브랜치는 시범 결과 후 추가한다.
- `pull_request`의 `opened`, `synchronize`, `reopened`, `ready_for_review`에서 평가한다.
- 같은 저장소 브랜치의 열린 non-draft PR이며, 실행자가 저장소 write 권한을 가진 사람인 경우에만 분석한다.
- fork, Dependabot 등 봇, 외부 실행자는 초기 범위에서 제외한다. `allowed_bots: '*'`, `allowed_non_write_users: '*'`를 사용하지 않는다.
- 변경 경로를 먼저 평가한다. Java, mapper XML, JSP/JS, `pom.xml`, 리뷰·워크플로 설정을 우선하고 문서만 바뀐 PR은 생략한다.
- draft 전환·종료 시 새 분석을 시작하지 않으며, 이미 실행 중이면 게시 직전에 상태를 다시 확인한다.

Action도 실행자 권한과 봇 여부를 검사한다. fork·Dependabot의 토큰·Secret 제약을 우회하기 위해 `pull_request_target`을 도입하지 않는다. [Action 보안 문서](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md), [GitHub 이벤트 문서](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)

### 리뷰 결과

- 한국어로 작성하고 변경으로 새로 생긴, 근거가 있는 결함을 우선한다.
- 각 지적에 심각도, 파일·행, 발생 조건, 영향, 수정 방향을 포함한다. 상위 5건을 기본 상한으로 제안한다.
- 근거가 부족한 업무 규칙은 확인 사항으로 표시한다. 코드와 문서의 충돌도 명시한다.
- 스타일 선호, 광범위한 리팩터링, 이번 변경과 무관한 기존 취약점은 주요 지적에서 제외한다.
- `완료·지적 없음`, `완료·지적 있음`, `부분 검토`, `실패`, `범위 제외`를 구분한다. 문맥 누락이나 API 오류를 지적 없음으로 변환하지 않는다.
- 검토한 base/head SHA, 제외한 파일·범위, 실행 링크를 표시한다. AI가 승인·merge·수정 커밋을 수행하지 않는다.

## 4. 인증과 권한 설계

Anthropic 모델 호출 인증과 GitHub API 인증을 별도로 결정한다.

| 영역 | 시범 운영 권장안 | 확인할 사항 |
| --- | --- | --- |
| 모델 인증 | 조직 소유 전용 API key를 `ANTHROPIC_API_KEY` Actions Secret으로 저장 | 코드 전송 허용 범위, 계약상 보관 정책, 예산 담당자, 키 교체 담당자 |
| 개인 구독 OAuth | 초기 조직 운영 기본안에서 제외 | 개인 구독·계정 수명주기에 종속되는 운영 부담 |
| GitHub 인증 | `github_token: ${{ github.token }}`를 명시해 job별 `GITHUB_TOKEN` 사용 | 고정한 Action 버전에서 읽기 전용 분석과 댓글 게시가 정상 동작하는지 PoC 검증 |
| GitHub App | 위 토큰 구성의 PoC 통과 시 설치 생략 | App이 필요한 기능을 추가할 때 권한을 다시 검토 |
| OIDC | API key + 명시적 GitHub 토큰 구성에서는 요구하지 않음 | 향후 Anthropic federation 또는 클라우드 인증으로 바꿀 때만 필요한 권한 추가 |

`github_token`을 생략하면 Action은 기본 GitHub App 인증 경로를 사용한다. 이 App 토큰의 권한과 워크플로의 `GITHUB_TOKEN` 권한은 다르므로, `contents: read` 선언만으로 코드 쓰기 차단을 주장하면 안 된다. 명시 토큰 사용은 공식 토큰 선택 구현에 근거한 설계이며 시범 검증 항목으로 둔다. [토큰 선택 구현](https://github.com/anthropics/claude-code-action/blob/main/src/github/token.ts)

job 권한은 다음과 같이 분리한다. 선언하지 않은 권한은 허용하지 않는다.

| job | 권한 | 자격증명·허용 작업 |
| --- | --- | --- |
| `analyze` | `contents: read`, `pull-requests: read` | 모델 API key, PR 읽기·분석. 게시·코드 변경 금지 |
| `publish` | `contents: read`, `pull-requests: write` | 모델 API key 없음. 같은 실행의 검증된 결과를 PR 댓글로 게시 |

`issues: write`, `contents: write`, `actions: write`, `id-token: write`는 초기 설계에서 부여하지 않는다. 결과 게시에 다른 권한이 요구되면 실제 사용하는 API를 확인하고 범위를 다시 결정한다.

## 5. 실행 구조와 재리뷰

1. **대상 확인:** 이벤트의 저장소·PR 번호·base/head SHA와 실행자 권한을 검증한다. 새 SHA마다 분석하되 동일 base/head 쌍의 성공한 결과는 재사용한다.
2. **문맥 수집:** 신뢰된 base의 수집 스크립트로 diff와 필요한 base/head 파일을 수집한다. PR head의 스크립트·hook·빌드 설정을 실행하지 않는다. 모델 입력은 경로 허용 목록, 파일·전체 크기 제한, 민감정보 제외 규칙을 거친다.
3. **분석:** automation 모드의 고정 프롬프트로 분석한다. `track_progress: false`, `classify_inline_comments: false`, `use_commit_signing: false`를 명시하고 GitHub MCP 게시 도구를 추가하지 않는다. `--json-schema`와 Action의 `structured_output`을 사용한다. 현재 agent 모드는 head를 강제 checkout하거나 tracking comment를 만들지 않지만, 고정할 버전에서 다시 확인한다. [agent 모드 구현](https://github.com/anthropics/claude-code-action/blob/main/src/modes/agent/index.ts), [Action 출력·후처리 정의](https://github.com/anthropics/claude-code-action/blob/main/action.yml)
4. **결과 전달:** 같은 workflow 실행의 artifact로 최소 JSON만 전달한다. 원문 diff, 토큰, 모델 전체 대화 로그를 전달하지 않는다. 보관 기간 초깃값은 3일이다.
5. **게시:** 별도 job의 신뢰된 스크립트가 Action의 성공 상태, JSON 스키마·길이·허용 경로·행 범위와 현재 PR 상태를 검증한다. PR 번호와 SHA는 모델 출력 대신 이벤트·수집 메타데이터에서 가져온다. 분석 실패 시 모델 결과는 게시하지 않고, 신뢰된 메타데이터로 만든 고정 실패 안내만 갱신한다. 게시 자체가 실패하면 workflow 상태에서 구분한다.
6. **최신성 확인:** 게시 직전 현재 base/head와 비교한다. 달라졌거나 draft·closed 상태면 결과를 게시하지 않고 사유를 기록한다. 게시에는 검사 시점의 SHA를 표시하며, 검사 직후 push되는 경쟁 상황에서도 검토 범위를 오해하지 않게 한다.

초기 결과는 PR별 요약 댓글 하나로 운영한다. `<!-- claude-pr-review -->` 같은 고정 마커와 작성자 ID를 함께 확인하여 자기 댓글만 갱신한다. 새 SHA를 검토하면 이전 내용과 검토 SHA를 교체한다. 일반 사용자가 같은 마커를 썼다는 이유로 댓글을 덮어쓰지 않는다.

PR별 concurrency와 `cancel-in-progress: true`를 적용한다. 동일 SHA 재실행, 실패 후 재실행, 새 SHA 실행을 구분하고, base 변경까지 재사용 키에 포함한다. 기본 브랜치만 전진한 경우의 자동 재검토는 초기 범위 밖이며 다음 PR 이벤트나 명시적 재실행으로 갱신한다. [GitHub concurrency 문서](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)

인라인 댓글은 후속 단계에서 추가한다. 현재 diff에 존재하는 행만 게시하고 해결된 지적·반복 지적 처리 규칙을 먼저 정한다. `use_sticky_comment`가 인라인 댓글 전체의 중복 제거까지 보장한다고 가정하지 않는다. 공식 플러그인을 비교할 경우 PR 게시에는 `--comment`와 인라인 MCP 도구 설정이 필요하다. [공식 리뷰 예제](https://code.claude.com/docs/en/github-actions#run-a-skill), [Action 사용 설정](https://github.com/anthropics/claude-code-action/blob/main/docs/usage.md)

## 6. 입력·실행 보안 조건

- GitHub-hosted 일회성 러너를 사용한다. 기존 Jenkins 러너, 배포 Secret, 운영 DB, 내부 서비스에는 접근하지 않는다.
- 수집·게시 스크립트와 프롬프트는 이벤트에 고정된 base SHA에서 가져온다. head 파일은 실행되지 않는 데이터로 취급한다. 일반 `pull_request` 워크플로 자체는 PR 변경의 영향을 받을 수 있으므로, base의 스크립트를 사용한다는 이유로 워크플로까지 보호된다고 가정하지 않는다. Action 내부 checkout 동작도 기술 검증에서 확인한다.
- PR에서 변경된 `CLAUDE.md`, `.claude/`, `.mcp.json`, 리뷰 프롬프트는 이번 실행의 지침으로 적용하지 않는다. PR 본문·코드의 명령문도 검토 데이터로 취급한다.
- `--bare`로 hooks·skills·plugins·MCP·`CLAUDE.md` 자동 발견을 끈다. 신뢰된 base의 `CLAUDE.md`와 리뷰 기준은 수집 스크립트가 고정 프롬프트에 명시적으로 포함한다. Action이 프로젝트 MCP 허용 설정을 병합하는 동작이 있어 settings의 비활성화 값만으로 차단하지 않는다. [Action settings 구현](https://github.com/anthropics/claude-code-action/blob/main/base-action/src/setup-claude-code-settings.ts)
- 모델의 도구는 입력 문맥 읽기에 필요한 범위로 제한한다. `Bash`, `Edit`, `Write`, 외부 웹 접근·임의 MCP·subagent 실행은 초기 구성에서 제거한다. `--tools`·`--disallowedTools`와 권한 설정의 실제 효과를 확인한다. `--allowedTools`만으로 엄격한 전체 도구 허용 목록을 구현했다고 설명하지 않는다. [Claude CLI 도구 옵션](https://code.claude.com/docs/en/cli-reference)
- 민감한 properties·인증서·키·실데이터·바이너리·벤더 JAR는 수집 단계에서 제외한다. 허용된 소스 diff에도 비밀값이 들어갈 수 있으므로 내용 검사를 병행하며, 의심 구간은 모델 호출 전에 가리고 검토 제외를 표시한다. 프롬프트의 비밀값 출력 금지 문구만으로 보호하지 않는다.
- PR 파일 경로의 traversal·symlink·과도한 크기를 검증한다. 모든 GitHub 입력과 모델 결과를 비신뢰 데이터로 취급하고, shell 코드에 `${{ ... }}`로 직접 삽입하지 않는다. JSON 파일·환경변수·구조화된 API 인자로 전달한다.
- `show_full_output`과 debug 로그는 기본 비활성화한다. artifact·로그·PR 댓글에 개인정보·Secret이 남지 않는지 확인한다.
- 외부 Action은 검증한 전체 commit SHA로 고정한다. Action SHA 고정과 Claude 런타임 버전 고정은 별도이므로 설치되는 런타임·하위 의존성도 기록하고 업데이트 시 재검증한다. [GitHub 보안 지침](https://docs.github.com/en/actions/reference/security/secure-use)
- 워크플로·프롬프트·보안 설정 변경은 담당자의 리뷰 대상으로 지정한다. job 내부 조건식이나 CODEOWNERS만을 실행 전 Secret 보호 경계로 삼지 않는다. 워크플로 무결성과 Secret 접근은 별도의 조직 정책·보호된 Environment 등으로 통제할 방법을 사전 확정한다. CODEOWNERS는 merge 전 검토를 보조한다.

Action이 일부 Claude 설정을 base에서 복구하더라도 PR head의 모든 실행 파일을 안전하게 만드는 것은 아니다. 복구 시 base 브랜치명을 fetch할 수 있으므로 초기 checkout SHA와 복구한 설정 버전이 다를 가능성도 있다. 명시 프롬프트와 `--bare`로 적용 기준을 통제한다. 모델 리뷰 job에서 Maven, npm, Makefile, PR 제공 스크립트를 실행하지 않는다. Action 자체의 설치·권한 조회·git 설정·base fetch와 모델이 실행할 수 있는 도구는 구분해서 검증한다. [Action 보안 문서](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md), [설정 복구 구현](https://github.com/anthropics/claude-code-action/blob/main/src/github/operations/restore-config.ts)

## 7. 저장소 전용 리뷰 기준

`CLAUDE.md`에는 기술 스택과 공통 규칙을 짧게 기록하고, 리뷰 프롬프트에는 다음 기준을 둔다.

| 영역 | 우선 확인할 결함 |
| --- | --- |
| Java·Spring | Java 8 호환성, null·예외 처리, Bean 주입·transaction 경계 |
| 계층 간 계약 | Controller → Form/DTO → Service → Mapper Java → XML statement ID·parameter/result mapping → JSP/AJAX 계약 |
| 인증·접근권한 | JWT/HMAC/timestamp/nonce 유지, 서명된 고객·주문 식별자와 payload 일치, 고객·판매자별 권한, nonce 검증 중복 호출 |
| SQL·Oracle | `#{...}` 바인딩, `${...}` 삽입 위험, NULL·빈 목록·중복 join, 삭제·취소·상태 필터, 조회 범위·성능 영향 |
| 금액·식별자·날짜 | 금액 정밀도, 큰 ID의 문자열 보존, Malaysia 업무 시간대와 월·연도 경계 |
| 개인정보·결제 | 응답·로그의 NRIC·계좌·카드·문서·자격증명 노출, 필요한 응답 본문 로깅 제외와 캐시 제어 |
| JSP·JS | 출력 escaping/XSS, 입력 검증, AJAX 오류 처리·권한, API 응답 변경의 화면 영향 |
| 테스트 | 변경 결함을 재현하는 검증이 있는지, 테스트가 실제 실행됐는지, Oracle 특성을 H2 결과만으로 단정하는지 |

문맥은 diff → 연관 controller/service/mapper/SQL/JSP 순서로 확장한다. 변경과 관계없는 전체 저장소 탐색을 제한하고, 과거 코드의 스타일을 일괄 교정하도록 지시하지 않는다.

## 8. 구현 산출물과 순서

다음은 향후 생성할 파일이다. 이번 작업에서 생성한 파일은 이 계획서 하나다.

| 순서 | 산출물 | 내용·완료 조건 |
| --- | --- | --- |
| 1 | 조직·저장소 운영 결정 | 코드 전송 정책, Secret·예산 담당자, Actions 허용 정책, 설정 변경 보호 방식 확정 |
| 2 | 제한된 기술 PoC | 고정 Action 버전에서 읽기 토큰의 실행자 권한 조회, `--bare`·읽기 도구·JSON schema 조합, checkout·설정 복구, job 간 출력 전달 확인 |
| 3 | `CLAUDE.md` | Java 8·레거시 계층·민감정보·검증 제약을 간결히 기록 |
| 4 | `.github/prompts/claude-pr-review.md` | 한국어 출력, 재현 가능한 신규 결함, 부분 검토 상태·최대 지적 수 규정 |
| 5 | `.github/scripts/collect-pr-review-context.mjs` | 이벤트 검증, base/head 문맥 수집, 허용 경로·민감정보·크기 제한 |
| 6 | `.github/scripts/publish-pr-review.mjs` | 구조 검증, 최신성·댓글 작성자 검증, 요약 댓글 갱신 |
| 7 | `.github/workflows/claude-pr-review.yml` | analyze/publish 분리, 최소 권한, concurrency, timeout, Secret 연결 |
| 8 | 운영 문서·설정 변경 보호 | 재실행·비용 확인·키 교체·중단 절차, CODEOWNERS 등 조직 정책에 맞는 설정 |

PoC에서 읽기 전용 Action 실행이나 checkout 제어가 불가능하면 운영 구현을 진행하기 전에 설계를 수정한다. 기본 App 인증이나 광범위한 쓰기 권한으로 조용히 전환하지 않는다.

## 9. 검증 계획

| 시나리오 | 기대 결과 |
| --- | --- |
| 내부 non-draft PR, 확실한 결함 포함 | 한국어 지적·파일·행·영향·검토 SHA가 댓글에 표시됨 |
| 정상 PR | 검토 완료와 지적 없음 표시. 승인·merge는 수행하지 않음 |
| draft → ready, reopened | 허용된 상태에서만 분석됨 |
| 후속 커밋과 동일 SHA 재실행 | 새 커밋 재리뷰, 성공 결과 중복 억제, 실패한 실행 재시도 가능 |
| 분석 중 push·base 변경·PR 종료·draft 전환 | 오래된 결과 게시 억제, 사유 기록 |
| fork·Dependabot·권한 없는 실행자 | 모델 호출·Secret 사용·댓글 게시 없이 범위 제외 |
| PR의 악성 지시·hook·MCP·shell 실행 유도 | 지침 승격·임의 실행 없음, 읽기 제한·GitHub 쓰기 제한 확인 |
| 민감정보·큰 diff·삭제·rename·바이너리 | 제외·제한을 명시. 누락된 범위를 완료로 오인하지 않음 |
| 위조 댓글 마커·유효하지 않은 모델 결과 | 타인 댓글 수정 없음, 검증 실패 시 게시 차단 |
| API key 없음·권한 부족·429·timeout·예산 소진 | 실패/부분 검토와 실행 링크 표시. 지적 없음으로 게시하지 않음 |
| 게시 job 실패 | 분석 결과와 구분되어 확인 가능하며 모델 재호출 없이 게시 재시도 가능 |
| 코드 쓰기·merge·Jenkins 접근 시도 | 권한·러너·Secret 분리로 차단됨 |

workflow는 `actionlint`, 수집·게시 스크립트는 위 경계 조건을 검증하는 테스트로 확인한다. 실제 Secret·실고객 데이터 대신 synthetic fixture를 사용한다. 테스트 PR에서 실제 댓글 갱신과 고정 버전 Action의 권한 동작까지 확인한 후 시범 운영한다.

애플리케이션 빌드·테스트는 별도 검증으로 남긴다. 현재 환경에는 Maven이 없어 이번 문서 작업에서 애플리케이션 테스트를 실행하지 않았다. 이후 테스트를 실행한다면 `mvn -DskipTests=false -Dtest=대상Test test`처럼 테스트 생략을 해제하고 결과 건수를 확인한다. GitHub-hosted 전체 WAR 빌드는 로컬 JAR·저장소 의존성을 먼저 해결해야 한다.

## 10. 비용과 시범 운영 기준

초깃값은 확정 견적이 아닌 시범 설정 제안이다.

- 분석 timeout 15분, `--max-turns 10`, 실행당 추정 API 예산 `--max-budget-usd 2`에서 시작한다.
- 문맥 상한은 변경 파일 30개·수집 텍스트 200 KiB로 시작한다. 초과 시 부분 검토 또는 사람 검토 대상으로 표시하고 조용히 잘라내지 않는다.
- 모델 ID는 조직에서 사용 가능한 모델의 품질·비용을 비교해 명시한다. 기본 모델에 의존하지 않는다.
- `--max-budget-usd`는 클라이언트 추정치이며 실제 청구의 엄격한 상한이 아니다. Console 사용량·예산 경보와 함께 운영한다. [CLI 예산 제한](https://code.claude.com/docs/en/cli-reference)
- 월 비용은 `PR 수 × 실제 분석한 base/head 수 × 실행당 관측 비용 + 재시도 비용 + GitHub Actions 비용`으로 추산한다. 정액 비용 절감률이나 PR당 가격을 미리 단정하지 않는다.
- 2주간 최소 20개 PR을 표본으로 수집한다. PR이 부족하면 기간을 연장한다. 공식 플러그인 비교는 제한된 표본에서만 수행한다.

시범 통과 기준 제안: 대상 실행의 분석·게시 성공률 95% 이상, 지적 중 담당자가 유효하다고 판단한 비율 70% 이상, 처리시간 p95 10분 이내, 민감정보 노출·무단 쓰기 0건. 관측 비용이 합의 예산을 넘지 않아야 한다. 표본 수·부분 검토율·사람의 확인 시간이 함께 보고되어야 한다.

실행 성공은 코드의 안전성을 보증하지 않는다. 도입 확대 여부는 유효 지적률·놓친 결함·리뷰 부담을 함께 보고 판단한다. 필수 검사 지정은 별도 결정으로 남긴다.

## 11. 중단·복구와 도입 완료 조건

이상 시 리뷰 워크플로를 비활성화하고 사람이 PR 리뷰를 계속한다. 민감정보 노출이나 자격증명 오용이면 노출 경로를 차단하고 관련 키를 폐기·교체하며 댓글·artifact·로그를 정리한다. Secret 삭제만으로 발급된 API key가 폐기되지는 않는다. [공식 제거 절차](https://code.claude.com/docs/en/github-actions#uninstall)

- [ ] 조직의 모델 사용·코드 전송·보관 정책과 예산 담당자 확정
- [ ] 최소 권한·읽기 전용 분석·checkout 제어 PoC 통과
- [ ] 수집·게시 스크립트와 워크플로 검토·검증 완료
- [ ] Secret·러너·설정 변경 보호 적용, 실제 테스트 PR 검증 완료
- [ ] 커밋 재리뷰·오래된 결과·중복 댓글·실패 상태 검증 완료
- [ ] 시범 표본의 품질·지연·비용 기준 평가 완료
- [ ] 운영 담당자·재실행·키 교체·중단 절차 인수 완료

**이번 검토의 한계:** 실제 Action 실행, 과금, 조직 설정 변경, PR 댓글 게시를 수행하지 않았다. 위 완료 조건은 향후 구현 작업의 검증 항목이며 현재 완료 상태를 뜻하지 않는다.
