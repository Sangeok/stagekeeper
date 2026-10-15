// 검증·배포·서버 파서가 같은 단계 경계를 사용한다. 콜론 뒤 공백은 기존 계약상 제목이 아니다.
export const STEP_HEADING = /^## step:(\S+)(.*)$/;

// 단계가 없는 런북·공통 문서는 원문 그대로 배포한다.
export function stubOf(body) {
  const lines = body.split(/\r?\n/);
  const first = lines.findIndex((line) => STEP_HEADING.test(line));
  return first < 0 ? body : lines.slice(0, first).join("\n").trimEnd() + "\n";
}
