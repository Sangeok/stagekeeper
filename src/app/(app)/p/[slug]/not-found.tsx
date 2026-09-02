// 이 경계는 프로젝트를 볼 수 있는 사람이 그 안의 없는 항목을 열었을 때다
// (items/[key]/page.tsx의 notFound()). p/[slug]/layout.tsx 안쪽이라 TurnBar·AppHeader·
// ProjectTabs는 살아남고 탭 본문만 대체된다 — 형제 error.tsx와 같은 배치 근거이고,
// 돌아갈 길은 위에 남아 있는 탭이 이미 준다(그래서 링크를 따로 두지 않는다).
// 레이아웃 자신이 던진 404는 여기가 아니라 (app)/not-found.tsx가 받는다 — not-found는
// 자기 세그먼트의 layout 안에서 그려지기 때문이다(Next 문서 not-found.md).
// not-found.js는 props를 받지 않는다(같은 문서 :131) — slug를 읽어 링크를 만들 수 없다.
// 문구는 product-copy.md §17. 원인을 짐작하지 않는다 — 폐기됐는지 처음부터 없었는지 알 수 없다.
export default function NotFound() {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">Not found.</h1>
      <p className="text-sm text-quiet">That item isn&apos;t on this board.</p>
    </section>
  );
}
