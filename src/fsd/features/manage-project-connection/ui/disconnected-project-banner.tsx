import { loadProjectConnection } from "../api/manage-project-connection.server";
import { disconnectRepository, reconnectRepository } from "../api/project-connection-actions.server";
import { connectionControlKey } from "../model/project-connection-state";
import { ProjectConnectionControl } from "./project-connection-control";

export async function DisconnectedProjectBanner({ userId, projectId }: { userId: string; projectId: string }) {
  const { target, summary } = await loadProjectConnection(userId, projectId);
  return <section className="flex flex-col gap-3 rounded-lg border border-rule bg-field px-3.5 py-3 text-sm">
    <p>This repository is disconnected. Your project data is preserved as read only.</p>
    {target ? <ProjectConnectionControl key={connectionControlKey(target.id, summary)} target={target} summary={summary} disconnect={disconnectRepository} reconnect={reconnectRepository} /> : null}
  </section>;
}
