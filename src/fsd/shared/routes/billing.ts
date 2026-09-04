// 플랜 화면의 URL. 머리의 배지와 상한 안내가 같은 곳을 가리키게 한 곳에서만 쓴다 —
// project.ts가 프로젝트 탭에 대해 하는 일과 같다. 프로젝트 밖의 경로라 그쪽 탭 목록에는 넣지 않는다.
export const BILLING_PATH = "/billing";

export function billingPath(): string {
  return BILLING_PATH;
}
