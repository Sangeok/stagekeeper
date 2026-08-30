import Link from "next/link";

import { statusLabel } from "@/fsd/entities/board-item";
import { cn } from "@/fsd/shared/lib/class-name";
import { Chip } from "@/fsd/shared/ui/chip";
import { SectionLabel } from "@/fsd/shared/ui/section-label";
import type { Briefing, SpeechItem, TeamMember } from "../model/briefing";

// Board는 상태 전용이다: (레이아웃의 턴 배너) · Activity · Team. 결정 카드는 Inbox에만 있다.
export function ProjectBoardPage({ slug, briefing }: { slug: string; briefing: Briefing }) {
  const rows = [...briefing.inbox, ...briefing.feed];
  return (
    <>
      <section>
        <SectionLabel>Activity</SectionLabel>
        {rows.length === 0 ? (
          <p className="text-sm text-quiet">No activity yet.</p>
        ) : (
          <div className="rounded-lg border border-rule bg-paper">
            {rows.map((item) => (
              <ActivityRow key={item.key} slug={slug} item={item} />
            ))}
          </div>
        )}
      </section>
      <section>
        <SectionLabel>Team</SectionLabel>
        <TeamRow team={briefing.team} />
      </section>
    </>
  );
}

// 발화 줄은 "KEY · …"로 시작한다 — 키는 mono로 따로 놓으니 본문에서는 뗀다.
function lineWithoutKey(item: SpeechItem): string {
  const prefix = `${item.id} · `;
  return item.line.startsWith(prefix) ? item.line.slice(prefix.length) : item.line;
}

function ActivityRow({ slug, item }: { slug: string; item: SpeechItem }) {
  const quiet = item.tone === "done" || item.tone === "hold" || item.tone === "muted";
  return (
    <Link
      href={`/p/${slug}/items/${item.id}`}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-rule px-3.5 py-2.5 last:border-b-0 hover:bg-field"
    >
      <span className={cn("text-sm", quiet && "text-quiet")}>
        <span className="mr-2.5 font-mono text-xs">{item.id}</span>
        {lineWithoutKey(item)}
      </span>
      <span className="flex items-center gap-1.5">
        {item.overBudget ? (
          <Chip tone="done" title="This summary is over 150 characters. Move the details to docs/agents/.">
            Over 150 characters
          </Chip>
        ) : null}
        <Chip tone="done">{statusLabel(item.status)}</Chip>
      </span>
    </Link>
  );
}

// 팀은 조밀한 한 줄: mono 핸들 + 상태. 아바타 없음.
function TeamRow({ team }: { team: TeamMember[] }) {
  return (
    <div className="flex flex-wrap gap-x-[22px] gap-y-1.5 text-xs text-quiet">
      {team.map((member) => (
        <span key={member.identity.id} className="inline-flex items-baseline gap-1.5">
          <b className="font-mono font-normal text-ink">{member.identity.handle}</b>
          {member.state}
        </span>
      ))}
    </div>
  );
}
