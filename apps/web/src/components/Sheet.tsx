import { statusOfAll, type Claim, type FlowState } from "@autoflow/core";
import type { ApplyEvent } from "../lib/apply.ts";
import type { SessionDoc } from "../lib/session-doc.ts";
import { Header } from "./Header.tsx";
import { Row } from "./Row.tsx";

interface Props {
  readonly doc: SessionDoc;
  readonly state: FlowState;
  readonly apply: ApplyEvent;
  readonly onLeave: () => void;
}

interface TopicGroup {
  readonly topic: string | null;
  readonly claims: readonly Claim[];
}

/** Consecutive claims sharing a topic form a group; the topic heading is the memo's own structure. */
const groupByTopic = (claims: readonly Claim[]): readonly TopicGroup[] =>
  claims.reduce<readonly TopicGroup[]>((groups, claim) => {
    const topic = claim.topic ?? null;
    const last = groups.at(-1);
    if (last && topic !== null && last.topic === topic) return [...groups.slice(0, -1), { topic, claims: [...last.claims, claim] }];
    return [...groups, { topic, claims: [claim] }];
  }, []);

export const Sheet = ({ doc, state, apply, onLeave }: Props) => {
  const claims = Object.values(state.claims).toSorted((a, b) => a.order - b.order);
  const statuses = statusOfAll(state);
  const indexOf = new Map(claims.map((c, i) => [c.id, i]));

  return (
    <main className="sheet">
      <Header doc={doc} claims={claims} statuses={statuses} onLeave={onLeave} />
      {groupByTopic(claims).map((group, g) => (
        <section key={`${group.topic ?? "untopiced"}-${g}`} className="topic">
          {group.topic && <h2 className="topic-title eyebrow">{group.topic}</h2>}
          <ol className="rows">
            {group.claims.map((claim) => {
              const status = statuses[claim.id];
              return status ? (
                <Row key={claim.id} claim={claim} index={indexOf.get(claim.id) ?? 0} state={state} status={status} claims={claims} apply={apply} />
              ) : null;
            })}
          </ol>
        </section>
      ))}
      <footer className="legend muted">
        <span><b className="mark support">+</b> support</span>
        <span><b className="mark attack">–</b> attack</span>
        <span><b className="mark question">?</b> question</span>
        <span><u className="legend-drop">underlined</u> = dropped, nothing answers it</span>
        <span><span className="from-memo">grey text</span> = from the memo</span>
      </footer>
    </main>
  );
};
