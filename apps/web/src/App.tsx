import { Intake } from "./components/Intake.tsx";
import { Sheet } from "./components/Sheet.tsx";
import { hasFlow } from "./lib/store.ts";
import { useFlowDoc } from "./lib/useFlowDoc.ts";

export const App = () => {
  const { doc, state, actions } = useFlowDoc();
  return hasFlow(doc) ? <Sheet doc={doc} state={state} actions={actions} /> : <Intake onLoaded={actions.load} />;
};
