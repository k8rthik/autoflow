import type { MemoFigure } from "@autoflow/classifier";
import { useEffect, useRef, useState } from "react";
import { createSession, fetchSample, listSamples, parseMemoFile, type SampleSummary } from "../lib/api.ts";
import type { SessionDoc } from "../lib/session-doc.ts";

type Status = { kind: "idle" } | { kind: "loading"; what: string } | { kind: "error"; message: string };

interface Props {
  readonly onCreated: (doc: SessionDoc) => void;
}

const ACCEPT = ".docx,.md,.markdown,.txt";

/** The blank sheet. One job: get a memo in, by paste, by file, or from a sample. */
export const Intake = ({ onCreated }: Props) => {
  const [memo, setMemo] = useState("");
  const [figures, setFigures] = useState<readonly MemoFigure[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [samples, setSamples] = useState<readonly SampleSummary[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void listSamples().then((r) => {
      if (r.ok) setSamples(r.value.samples);
    });
  }, []);

  const setDocument = (text: string, figs: readonly MemoFigure[], from: string | null) => {
    setMemo(text);
    setFigures(figs);
    setSource(from);
    setStatus({ kind: "idle" });
  };

  const pickSample = async (id: string) => {
    setStatus({ kind: "loading", what: "Loading sample" });
    const r = await fetchSample(id);
    if (!r.ok) return setStatus({ kind: "error", message: r.error.message });
    setDocument(r.value.text, [], null);
  };

  const takeFile = async (file: File | undefined) => {
    if (!file) return;
    setStatus({ kind: "loading", what: `Reading ${file.name}` });
    const r = await parseMemoFile(file);
    if (!r.ok) return setStatus({ kind: "error", message: r.error.message });
    setDocument(r.value.markdown, r.value.figures, file.name);
  };

  const build = async () => {
    if (memo.trim() === "") return setStatus({ kind: "error", message: "Paste a memo or choose a file first." });
    setStatus({ kind: "loading", what: figures.length > 0 ? `Reading the memo and ${figures.length} figures` : "Reading the memo" });
    const r = await createSession(memo, figures);
    if (!r.ok) return setStatus({ kind: "error", message: r.error.message });
    onCreated({ session: r.value.session, events: r.value.events });
  };

  const busy = status.kind === "loading";

  return (
    <main className="intake">
      <p className="eyebrow">Flow</p>
      <h1 className="intake-title">Start with the memo.</h1>
      <p className="intake-lede">Each claim it makes in support of the investment becomes a row. The discussion fills in the rest.</p>

      <div
        className={`intake-drop ${dragging ? "is-dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void takeFile(e.dataTransfer.files[0]);
        }}
      >
        <textarea
          className="intake-memo"
          value={memo}
          onChange={(e) => {
            setMemo(e.target.value);
            if (e.target.value.trim() === "") setDocument("", [], null);
          }}
          placeholder="Paste the memo, or drop a .docx here"
          rows={14}
          disabled={busy}
          aria-label="Investment memo"
        />
        {source && (
          <p className="intake-source muted">
            From {source}
            {figures.length > 0 && <> · {figures.length} {figures.length === 1 ? "figure" : "figures"} will be read with the text</>}
          </p>
        )}
      </div>

      <div className="intake-actions">
        <button className="btn btn-primary" onClick={build} disabled={busy}>
          Build the flow
        </button>
        <button className="btn" onClick={() => fileInput.current?.click()} disabled={busy}>
          Choose a file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            void takeFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {samples.length > 0 && (
          <span className="intake-samples">
            <span className="muted">or try a sample</span>
            {samples.map((s) => (
              <button key={s.id} className="btn btn-quiet" onClick={() => void pickSample(s.id)} disabled={busy}>
                {s.id}
              </button>
            ))}
          </span>
        )}
      </div>

      <p className="intake-status" role="status">
        {status.kind === "loading" && <span className="muted">{status.what}…</span>}
        {status.kind === "error" && <span className="error">{status.message}</span>}
      </p>
    </main>
  );
};
