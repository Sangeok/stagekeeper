import Link from "next/link";
import { projectsPath } from "@/fsd/shared/routes/projects";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[800px] flex-col gap-2 px-5 pt-9 pb-14">
      <h1 className="text-2xl font-semibold tracking-tight">Not found.</h1>
      <p className="text-sm text-quiet">That page doesn&apos;t exist, or it isn&apos;t yours.</p>
      <p className="mt-1">
        <Link href={projectsPath()} className="text-sm underline underline-offset-2">
          All projects
        </Link>
      </p>
    </main>
  );
}
