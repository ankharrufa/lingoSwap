"use client";
import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppContext";
import { Button, ErrorText, Screen, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";

export default function Join({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const app = useApp();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const tried = useRef(false);

  useEffect(() => {
    if (app.loading || tried.current) return;
    if (!app.user) {
      router.replace(`/login?next=/join/${code}`);
      return;
    }
    if (app.pair) {
      router.replace(app.pair.user_b ? "/home" : "/onboarding");
      return;
    }
    tried.current = true;
    supabase().rpc("join_pair", { p_code: code }).then(async ({ error }) => {
      if (error) return setError(error.message);
      await app.refresh();
      router.replace("/onboarding");
    });
  }, [app, code, router]);

  return (
    <Screen title="Joining your partner…">
      {error ? (
        <>
          <ErrorText error={error} />
          <Button variant="soft" className="mt-4 w-full" onClick={() => router.replace("/onboarding")}>Go to set-up</Button>
        </>
      ) : <Spinner />}
    </Screen>
  );
}
