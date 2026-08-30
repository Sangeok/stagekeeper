// src/app/login/page.tsx
import { signIn } from "@/server/auth";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        action={async () => { "use server"; await signIn("github", { redirectTo: "/" }); }}
        className="w-full max-w-sm space-y-6 text-center"
      >
        <h1 className="text-2xl font-semibold">Stagekeeper</h1>
        <p className="text-sm text-zinc-600">Sign in with GitHub to continue.</p>
        <button type="submit" className="w-full rounded-md bg-black px-4 py-2 text-sm text-white">Continue with GitHub</button>
      </form>
    </main>
  );
}
