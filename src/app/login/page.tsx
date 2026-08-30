// src/app/login/page.tsx
import { Button } from "@/fsd/shared/ui/button";
import { signIn } from "@/server/auth";
import { AFTER_SIGN_IN } from "@/server/auth/config.base";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <form
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: AFTER_SIGN_IN });
        }}
        className="flex w-full max-w-sm flex-col items-center gap-6 text-center"
      >
        <h1 className="type-display">Stagekeeper</h1>
        <p className="text-sm text-quiet">Sign in with GitHub to continue.</p>
        <Button variant="mine" type="submit" className="w-full">
          Continue with GitHub
        </Button>
      </form>
    </main>
  );
}
