// 계정 단위 토큰 화면의 URL. 프로젝트 밖의 경로라 PROJECT_TABS에는 넣지 않는다 —
// billing.ts가 플랜 화면에 대해 하는 일과 같다.
//
// 이 자격은 사람에 묶이고 프로젝트에 묶이지 않는다. /p/[slug]/tokens 아래에 두면
// 같은 토큰 목록이 프로젝트 수만큼 중복되어 보인다.
//
// revalidatePath는 사람이 보고 있는 경로와 문자열이 정확히 같아야 하므로 손으로 쓰지 않는다 —
// 어긋나도 컴파일 오류가 아니라 조용히 낡은 화면이 남는다(project.ts와 같은 이유).
const USER_TOKENS_PATH = "/settings/tokens";

export function userTokensPath(): string {
  return USER_TOKENS_PATH;
}
