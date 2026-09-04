import { BILLING_NOTE, PLAN_IDS, type PlanId, planLabel, planMatrix } from "@/fsd/shared/lib/entitlement-copy";

// 플랜 화면. 읽기 전용이다 — 결제가 없으므로 버튼도 없다.
// 표는 LIMITS에서 렌더한다(entitlement-copy.planMatrix): 코드의 상한과 화면의 표가 어긋날 수 없게.
export function BillingPage({ plan }: { plan: PlanId }) {
  const rows = planMatrix();
  return (
    <main className="mx-auto flex w-full max-w-[800px] flex-col gap-8 px-5 pt-9 pb-14">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Plan</h1>
        <p className="text-sm text-quiet">
          You are on <span className="font-medium text-ink">{planLabel(plan)}</span>.
        </p>
      </div>

      <section className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule text-left">
              <th scope="col" className="py-2 pr-3 font-medium text-quiet">
                Limit
              </th>
              {PLAN_IDS.map((p) => (
                <th key={p} scope="col" className="py-2 pr-3 font-medium">
                  {planLabel(p)}
                  {p === plan ? <span className="ml-1.5 text-xs font-normal text-quiet">(current)</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-rule last:border-b-0">
                <th scope="row" className="py-2 pr-3 text-left font-normal text-quiet">
                  {row.label}
                </th>
                {PLAN_IDS.map((p) => (
                  <td key={p} className={p === plan ? "py-2 pr-3 font-medium" : "py-2 pr-3"}>
                    {row.values[p]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-sm text-quiet">{BILLING_NOTE}</p>
    </main>
  );
}
