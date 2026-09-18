import { useCallback, useEffect, useState } from "react";
import { fetchSession } from "./lib/api.ts";
import { hashForSession, sessionIdFromHash } from "./lib/room-url.ts";
import type { SessionDoc } from "./lib/session-doc.ts";
import { Intake } from "./components/Intake.tsx";
import { Room } from "./components/Room.tsx";

type View =
  | { readonly kind: "intake" }
  | { readonly kind: "joining"; readonly sessionId: string }
  | { readonly kind: "room"; readonly doc: SessionDoc }
  | { readonly kind: "error"; readonly message: string };

export const App = () => {
  const [view, setView] = useState<View>(() => {
    const sessionId = sessionIdFromHash(window.location.hash);
    return sessionId ? { kind: "joining", sessionId } : { kind: "intake" };
  });

  // The room is in the URL, so opening the link — or reloading — rejoins the same flow.
  useEffect(() => {
    if (view.kind !== "joining") return;
    let joined = true;
    void fetchSession(view.sessionId).then((result) => {
      if (!joined) return;
      setView(result.ok ? { kind: "room", doc: result.value } : { kind: "error", message: result.error.message });
    });
    return () => {
      joined = false;
    };
  }, [view]);

  const enter = useCallback((doc: SessionDoc) => {
    window.location.hash = hashForSession(doc.session.id);
    setView({ kind: "room", doc });
  }, []);

  const leave = useCallback(() => {
    window.location.hash = "";
    setView({ kind: "intake" });
  }, []);

  if (view.kind === "joining") return <main className="intake"><p className="muted">Joining the room…</p></main>;

  if (view.kind === "error") {
    return (
      <main className="intake">
        <h1 className="intake-title">That room is not here.</h1>
        <p className="intake-lede">{view.message}</p>
        <button className="btn btn-primary" onClick={leave}>Start a new one</button>
      </main>
    );
  }

  return view.kind === "room" ? <Room initial={view.doc} onLeave={leave} /> : <Intake onCreated={enter} />;
};
