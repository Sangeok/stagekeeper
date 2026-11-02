import { notFound } from "next/navigation";
import { changeItemPipeline } from "@/fsd/features/change-item-pipeline/index.server";
import { humanTransition, retryAcceptance } from "@/fsd/features/review-gate/index.server";
import { BoardItemPage } from "@/fsd/pages/board-item";
import { loadBoardItemPage } from "@/fsd/pages/board-item/index.server";
import { requireProjectOwner } from "@/server/auth/guard";

export default async function Page({ params }: PageProps<"/p/[slug]/items/[key]">) {
  const { slug, key } = await params;
  const { projectId } = await requireProjectOwner(slug);
  const data = await loadBoardItemPage(projectId, key);
  if (!data) notFound();

  return (
    <BoardItemPage
      slug={slug}
      changePipeline={changeItemPipeline.bind(null, slug)}
      pipelineChoices={data.pipelineChoices}
      retryAcceptance={retryAcceptance.bind(null, slug)}
      canWrite={data.canWrite}
      item={data.item}
      transition={humanTransition.bind(null, slug)}
    />
  );
}
