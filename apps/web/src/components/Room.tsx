import { useSession } from "../lib/useSession.ts";
import type { SessionDoc } from "../lib/session-doc.ts";
import { Sheet } from "./Sheet.tsx";

interface Props {
  readonly initial: SessionDoc;
  readonly onLeave: () => void;
}

/** Holds the live session and renders it. Split from App so the hook mounts with a session in hand. */
export const Room = ({ initial, onLeave }: Props) => {
  const { doc, state, actions } = useSession(initial, onLeave);
  return <Sheet doc={doc} state={state} apply={actions.apply} onLeave={actions.leave} />;
};
