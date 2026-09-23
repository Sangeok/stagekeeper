import { sequence } from "@harness/core/pipeline.mjs";
import { gateLabel, nodeLabel } from "@/fsd/entities/pipeline";
import { PipelineRail, type Graph, type SavePipelineAction } from "@/fsd/features/edit-pipeline";
import { agoLabel } from "@/fsd/shared/lib/relative-time";
import { SectionLabel } from "@/fsd/shared/ui/section-label";

type Props = {
  format?: string | null;
  graph: Graph;
  // 저장된 버전이 있을 때만 온다 — 번호와 저장 시각은 함께 있거나 함께 없다.
  saved?: { version: number; at: Date };
  unavailableReason?: string;
  now: Date;
  plan: string;
  roster: string[];
  editable: boolean;
  save: SavePipelineAction;
};

// 파이프라인 탭. 그래프는 서버 소유이고 이 화면은 그것을 그리고 고친다 — 문구는 product-copy.md §18.
// 저장한 버전은 지금 열려 있는 항목을 옮기지 않는다: 런은 자기가 시작한 버전을 끝까지 쓴다(§C.1).
export function ProjectPipelinePage({ graph, format, saved, now, plan, roster, editable, save, unavailableReason }: Props) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-xs text-quiet">
          {saved ? `Version ${saved.version} · saved ${agoLabel(saved.at, now)} · applies to items proposed from now on.` : "Default pipeline · not saved yet"}
        </p>
      </div>

      <PipelineRail key={`${saved?.version ?? "default"}:${plan}:${editable}`} graph={graph} plan={plan} roster={roster} editable={editable} save={save} unavailableReason={unavailableReason} />

      <section>
        <p className="text-xs text-quiet">Execution format: {format ?? "legacy"}. Implementation span completion and acceptance are separate.</p>
        <SectionLabel>Read as text</SectionLabel>
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-quiet underline underline-offset-2">
            The same pipeline in cursor order
          </summary>
          <ol className="mt-2 flex flex-col gap-1 text-sm">
            {sequence(graph).map((id, index) => (
              <li key={id} className="flex gap-2">
                <span className="w-5 text-right text-xs text-quiet">{index + 1}</span>
                <span>{id.startsWith("before-") ? `${gateLabel(id)} — you` : nodeLabel(id)}</span>
              </li>
            ))}
          </ol>
        </details>
      </section>
    </>
  );
}
