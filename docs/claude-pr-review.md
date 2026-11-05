# Claude Code PR 리뷰 운영

현재 저장소의 Next.js·TypeScript·Redis 구조와 `develop` PR에 맞춰
`claude-code-github-actions-pr-review-plan.md`의 설계를 적용했다.
원본 계획서의 Java·Oracle·Jenkins·`dev` 기준은 적용하지 않는다.
앱 CI와 별개인 보조 리뷰이며 사람의 승인을 대체하지 않는다.

## 활성화

1. 코드 전송·보관 정책과 API 예산 담당자를 확정한다. Anthropic API 사용에는 비용이 발생한다.
2. GitHub Settings → Environments에서 `claude-review`를 만든다. 현재 운영은 자동 실행이며
   required reviewers를 설정하지 않는다. 설정하면 각 실행마다 승인 대기가 발생한다.
   워크플로가 PR 변경의 영향을 받으므로 조직의 워크플로 무결성·Secret 접근 정책을 확인한다.
3. 시크릿 관리 권한이 있는 계정으로 아래 명령을 실행하고 프롬프트에 키를 입력한다.
   실제 키는 코드·문서·채팅·명령 인자에 넣지 않는다.

   ```sh
   gh secret set ANTHROPIC_API_KEY --repo eun8ang/teamChat
   ```

   저장소 시크릿 대신 `--env claude-review`로 Environment 시크릿을 등록해도 된다.
   Environment로 범위를 제한하는 구성을 권장한다. GitHub App 설치는 필요하지 않다.
4. 워크플로·스크립트·프롬프트가 `develop`에 반영된 뒤 저장소 Actions variable
   `CLAUDE_REVIEW_ENABLED=true`를 설정한다. 최초 도입 PR은 base에 스크립트가 없으므로
   활성화하지 않는다. 필수 merge 검사로 지정하지 않는다.
5. 내부 테스트 PR에서 아래 시나리오를 검증한 뒤 시범 운영한다.

## 실행과 제한

- 내부 사람의 열린 non-draft PR: opened/synchronize/reopened/ready_for_review.
  최초 실행자와 재실행자 모두 write/admin/maintain 권한을 확인한다.
  fork·봇·문서만 변경한 PR은 제외한다. `pull_request_target`을 사용하지 않는다.
- base SHA의 스크립트·프롬프트·규칙만 실행한다. head는 checkout하지 않는다.
  diff와 head 소스를 최대 30파일·200 KiB, 파일당 32 KiB로 제한한다.
  symlink·삭제·바이너리·민감 경로·의심 키를 포함한 파일은 제외하고 부분 검토로 표시한다.
  자동 탐지는 모든 민감정보를 식별하지 못하므로 실제 고객 데이터는 커밋하지 않는다.
- Claude는 `--bare`, 도구 없음, 빈 strict MCP 설정으로 주어진 문맥만 분석한다.
  큰 소스·diff는 `.review/context.txt`에 저장하고 `--append-system-prompt-file`로 전달한다.
  Action의 `prompt` 입력에는 짧은 실행 지시만 넣어 환경변수 크기 제한을 피한다.
  이 파일 안의 PR 내용도 명시적으로 비신뢰 데이터로 취급한다. 원문 파일은 artifact에서 제외한다.
  `--tools=`는 Action의 인자 파서에서도 빈 도구 목록을 유지하는 표기다.
  관련 계층의 자동 추가 탐색은 하지 않으며 문맥 부족은 부분 검토로 표시한다.
  읽기 토큰의 분석 job과 쓰기 토큰의 게시 job을 분리한다. 게시 job에는 모델 키가 없다.
- 모델: `claude-sonnet-4-6`. Action SHA: `c0949c50a78c1ec8ce2647db36629b870e715d0c`.
  이 버전의 설치 스크립트는 Claude Code `2.1.318`, Bun `1.4.4`를 지정한다.
  하위 설치 스크립트·패키지까지 완전히 불변으로 고정하는 것은 아니다.
  설치되는 버전과 도구 제한은 버전 갱신 시 실제 실행에서 다시 검증한다.
- 분석 15분·10턴·추정 API 예산 $2. 추정 예산은 청구의 엄격한 상한이 아니므로
  Anthropic Console 사용량과 예산 경보를 함께 확인한다.
- 모델 실행 단계에 `MAX_THINKING_TOKENS=0`을 지정해 Sonnet 4.6의 확장 추론을 끈다.
  큰 문맥에서 답변 전 추론이 길어져 시간 제한에 도달하는 현상을 줄이기 위한 설정이다.
  같은 CLI·SDK와 약 7만 입력 토큰으로 비교했을 때 기본 설정은 180초 내 미완료였고,
  확장 추론을 끈 실행은 약 80초에 구조화 결과를 반환했다. 이는 로컬 비교 결과이며
  모든 PR의 처리 시간을 보장하지 않는다. 심층 추론을 생략하므로 리뷰 품질도 시범 평가한다.
  설정 의미는 [공식 환경변수 문서](https://code.claude.com/docs/en/env-vars)를 참고한다.
- 게시 전 JSON 구조·추가 행·작성자 ID·현재 PR 상태·base/head를 검증한다.
  고정 마커가 있는 `github-actions[bot]` 댓글 하나만 갱신한다.
  완전한 성공 결과의 동일 base/head는 재사용하고 실패·부분 검토는 재실행 가능하다.
  base만 전진한 경우 자동 실행은 하지 않는다. 검사 직후 push될 수 있어 SHA도 표시한다.
- 같은 실행의 최소 JSON artifact만 3일 보관한다. 원문 소스·diff·전체 대화는 올리지 않는다.
  분석 실패는 고정 실패 안내로 게시하며 유효하지 않은 모델 출력은 게시를 차단한다.
  수집·artifact·게시 실패는 Actions 실패 상태로 확인한다.

## 검증·중단

로컬에서는 `npm ci`, `npm run check`, `actionlint`로 검사한다.
실제 테스트 PR에서는 결함/정상, 새 커밋, 동일 SHA 재실행, 실패 후 재실행,
실행 중 push/draft/종료, fork/봇, 악성 지시, 민감정보·큰 diff·rename/삭제,
위조 댓글, API 키 누락/429/timeout과 댓글 권한을 확인한다.
로컬 테스트만으로 모델 실행·최소 권한·실제 댓글 동작이 검증되었다고 간주하지 않는다.

재실행은 Actions의 Re-run jobs를 사용한다. 게시 job만 실패했으면 실패 job만 재실행해
모델 호출을 줄인다. 전체 재실행은 실패·부분 결과를 다시 분석할 수 있다.
중단은 `CLAUDE_REVIEW_ENABLED=false` 또는 Actions에서 워크플로 비활성화로 수행한다.
노출된 키는 발급처에서 폐기·교체하고 GitHub 시크릿을 갱신한다.
2주·20개 이상 PR에서 유효 지적률·성공률·지연·비용을 평가한 뒤 확대 여부를 결정한다.
