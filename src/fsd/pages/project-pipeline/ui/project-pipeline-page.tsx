import { sequence } from "@harness/core/pipeline.mjs";
import { gateLabel, nodeLabel } from "@/fsd/entities/pipeline";
import { PipelineRail, type Graph, type SavePipelineAction } from "@/fsd/features/edit-pipeline";
import { agoLabel } from "@/fsd/shared/lib/relative-time";
import { SectionLabel } from "@/fsd/shared/ui/section-label";

type Props = {
  graph: Graph;
  version: number;
  savedAt: Date;
  now: Date;
  plan: string;
  roster: string[];
  editable: boolean;
  save: SavePipelineAction;
};

// 파이프라인 탭. 그래프는 서버 소유이고 이 화면은 그것을 그리고 고친다 — 문구는 product-copy.md §18.
// 저장한 버전은 지금 열려 있는 항목을 옮기지 않는다: 런은 자기가 시작한 버전을 끝까지 쓴다(§C.1).
export function ProjectPipelinePage({ graph, version, savedAt, now, plan, roster, editable, save }: Props) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-xs text-quiet">
          Version {version} · saved {agoLabel(savedAt, now)} · applies to items proposed from now on.
        </p>
      </div>

      <PipelineRail graph={graph} plan={plan} roster={roster} editable={editable} save={save} />

      <section>
        <SectionLabel>Read as text</SectionLabel>
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-quiet underline underline-offset-2">
            The same pipeline in cursor order
          </summary>
          <ol className="mt-2 flex flex-col gap-1 text-sm">
            {(sequence(graph) as string[]).map((id, index) => (
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
