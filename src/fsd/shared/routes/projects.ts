// 프로젝트 목록과 새 프로젝트 화면의 URL. 머리·랜딩·오류 화면·목록의 링크와 선택 액션의 revalidatePath가
// 같은 곳을 가리키게 한 곳에서만 쓴다 — billing.ts와 같은 이유다. 프로젝트 밖의 경로라 탭 목록에는 넣지 않는다.
// src/server/auth/config.base.ts의 AFTER_SIGN_IN은 같은 값을 따로 적는다(서버는 FSD를 import할 수 없다).
const PROJECTS_PATH = "/projects";
const NEW_PROJECT_PATH = "/p/new";

export function projectsPath(): string {
  return PROJECTS_PATH;
}

export function newProjectPath(): string {
  return NEW_PROJECT_PATH;
}
