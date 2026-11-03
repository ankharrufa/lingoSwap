"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type { Pair, Profile } from "@/lib/types";

type AppState = {
  loading: boolean;
  user: User | null;
  me: Profile | null;
  partner: Profile | null;
  pair: Pair | null;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<AppState, "refresh">>({
    loading: true, user: null, me: null, partner: null, pair: null,
  });

  const refresh = useCallback(async () => {
    const sb = supabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      setState({ loading: false, user: null, me: null, partner: null, pair: null });
      return;
    }
    const [{ data: pair }, { data: profiles }] = await Promise.all([
      sb.from("pairs").select("*").maybeSingle<Pair>(),
      sb.from("profiles").select("*").returns<Profile[]>(),
    ]);
    const me = profiles?.find((p) => p.id === user.id) ?? null;
    const partner = profiles?.find((p) => p.id !== user.id) ?? null;
    setState({ loading: false, user, me, partner, pair: pair ?? null });
  }, []);

  useEffect(() => {
    refresh();
    const { data: sub } = supabase().auth.onAuthStateChange(() => refresh());
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  return <Ctx.Provider value={{ ...state, refresh }}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}
