# Investment Discussion Flow — Requirements (Conceptual)

**Owner:** Keerthik Muruganandam, VP of Technology, Atland Ventures
**Status:** Draft v0.1 — September 10, 2026
**Scope:** Concepts and requirements only. No implementation decisions.

---

## 1. Purpose

Investment discussions at Atland are live, unstructured, and multi-party. Concerns get raised, partially answered, and dropped; by the end it is hard to say where the room actually landed on each part of the thesis.

This tool turns an investment discussion into a **flow** — the note-taking structure used in competitive debate — so that every claim in the memo has a visible, live record of what was argued against it, what answered that, and what is currently standing. The goal is a room that can see, at any moment, which parts of the thesis are supported, which are contested, and which concerns nobody has addressed.

## 2. Core concepts

- **Memo.** The written investment memo produced before the discussion. The source of the initial claims.
- **Claim.** A single assertion the memo makes in support of the investment (e.g. "the market is large enough to support a venture-scale outcome," "the founding team has relevant domain expertise"). One claim per row.
- **Row.** The flow line for one claim. Contains the claim and every argument made about it, in sequence.
- **Argument.** A discrete point made about a claim: a support, an attack (concern), or a question. Arguments are appended to a row in the order they are made.
- **Arrow.** A link from an argument to the argument it responds to. Arrows give the row its sequencing; a row reads left to right as argument → response → response.
- **Status.** The current state of a claim, determined by what sits at the end of its row. The tool derives status; nobody assigns it. A claim nobody has argued about is *untested*, which is not the same as one that has survived debate.
- **Drop.** An attack or question at the end of a row with nothing responding to it.

## 3. Inputs

1. **The memo**, as written text, before the discussion.
2. **Preliminary responses**, written by participants after reading the memo and before the discussion — their concerns, strengths, and questions.
3. **Live discussion audio**, captured from shared microphones in a classroom-sized room. No speaker identification is required or desired.
4. **Manual corrections** from participants during and after the discussion.

## 4. Functional requirements

### 4.1 Memo → initial flow
- The memo is segmented into distinct claims. Each claim becomes a row.
- Claims should be concrete and independently arguable. Overlapping or compound claims are split; boilerplate and narrative that make no claim are discarded.
- The memo author can review, rename, split, merge, or delete rows before the discussion.
- Rows are ordered to match the memo's structure so the room can follow along.

### 4.2 Preliminary responses → flow
- Each participant's written response is broken into arguments and placed on the relevant rows, with arrows to the claim (or memo argument) each one responds to.
- Concerns and questions raised in prelims are visible as open items before the discussion starts, so the room begins with the drop list already populated.
- A prelim point that does not fit an existing claim creates a new row.

### 4.3 Live transcription
- Speech from the room is transcribed continuously with low latency, with interim text shown as it is recognized and finalized text replacing it.
- Transcription accuracy is the priority. Domain vocabulary — company name, founder names, financial terms, portfolio jargon — must be recognized reliably.
- The raw transcript is retained in full, independent of what gets classified onto the flow.

### 4.4 Live classification
- As speech is recognized, the tool determines whether a segment contains an argument, and if so: which row it belongs to, whether it supports, attacks, or questions, and what it responds to.
- Most speech is not an argument (reactions, procedure, tangents) and produces nothing on the flow.
- A single segment may contain more than one argument, or an argument that spans several segments. The tool must merge or split accordingly rather than posting fragments.
- An argument that is being refined mid-speech updates the existing card rather than creating a duplicate.
- Arguments that fit no existing row open a new row. Duplicate rows created under different wording can be merged.
- Classifications the tool is not confident about go to a holding area rather than onto the flow, so the flow only shows what it is sure of.

### 4.5 Sequencing and status
- Every argument on a row has a sequence position and an arrow to what it answers.
- Status is derived from the end of the row: an unanswered attack means *contested*; an unanswered question means *open*; a standing response or support means *supported*; an empty row means *untested*.
- *Untested* is distinct from *supported* on purpose. A memo claim the room never engaged with has not been tested, and showing it as supported would overstate where the room stands — the two must be distinguishable at a glance in the room view.
- Drops — attacks or questions with nothing after them — are flagged visibly without any time-based heuristics.
- Status must never be overwritten by a restatement of an argument that has already been answered.

### 4.6 Perceived responsiveness
The flow should feel instant even though classification lags speech by a second or more. Required behaviors:
- Interim transcript text appears immediately, before any classification.
- A provisional card appears in the most likely row while the speaker is still talking and moves or firms up as the utterance completes, so that by the time the point is finished the card is usually already in place.
- Provisional versus committed state is visually distinct (e.g. ghosted vs solid).
- A card that changes rows animates rather than disappears and reappears.
- The end of a row visibly "receives" a new argument so attention goes to the right place without reading.

### 4.7 Correction
- Any participant can, in a few gestures, move an argument to another row, change its stance, re-point its arrow, merge two arguments, mark something as not an argument, or promote an item from the holding area.
- Corrections take effect immediately and are recorded.
- Misclassifications should never require stopping the discussion to fix.

### 4.8 Views
- **Room view.** All rows with status, drops highlighted, optimized for a projector and readable from across the room.
- **Row view.** One claim expanded to show its full sequence with arrows.
- **Transcript view.** The raw transcript with links from each classified argument back to its source text.

### 4.9 Outputs
- **Post-meeting summary.** For each claim: final status, the sequence of arguments, and any drops. Drops become the follow-up diligence list.
- **Replay.** The flow can be stepped through in sequence order to show how each claim's status changed over the discussion.
- **Export** of the flow and transcript in a form that can be attached to the deal record.

## 5. Non-functional requirements

- **Latency.** Words on screen well under one second from speech. Argument cards committed within roughly one to two seconds of a point ending, with the provisional card appearing earlier.
- **Accuracy over completeness.** Missing a marginal argument is acceptable; posting a wrong one that misleads the room is not.
- **Trust.** The room must be able to tell at a glance what the tool is confident about and what it is guessing.
- **Resilience.** If transcription or classification fails mid-discussion, the transcript keeps recording and the flow can be reconstructed afterward.
- **Privacy and consent.** Participants are informed they are being recorded. Deal discussions contain confidential company information; audio, transcripts, and flows are stored and shared under the same controls as the memo itself.

## 6. Explicitly out of scope

- Speaker identification or attribution of any kind.
- Scoring or rating argument strength.
- Phases, speech columns, or a time axis on the flow.
- Tree or graph layouts within a row; rows are sequential.
- Vote tallying or decision recording (may come later).

## 7. Open questions

- What granularity of claim works best — six pillar-level claims or twenty specific assertions? Likely needs testing against real memos.
- Should prelim responses be visible to everyone before the discussion, or hidden until it starts to avoid anchoring?
- Who has correction rights during the discussion — anyone in the room, or a designated flow keeper?
- How should the tool handle a claim that gets substantially reframed mid-discussion (new row vs edit in place)?
- What does "done" look like for a discussion — is there an explicit close, and does the tool need to know?
