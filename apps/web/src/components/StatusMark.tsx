import type { Status } from "@autoflow/core";

const LABEL: Readonly<Record<Status, string>> = {
  contested: "Contested: an attack stands unanswered",
  open: "Open: a question stands unanswered",
  supported: "Supported: nothing stands against it",
  untested: "Untested: no arguments yet",
};

/** The terminal mark at the right edge of a row. Scan down this column to see where the room stands. */
export const StatusMark = ({ status }: { readonly status: Status }) => (
  <span className={`status-mark status-${status}`} role="img" aria-label={LABEL[status]} title={LABEL[status]} />
);
