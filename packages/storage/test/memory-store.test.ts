import { createMemoryEventStore } from "../src/memory.ts";
import { describeEventStore } from "./contract.ts";

describeEventStore("memory store", () => createMemoryEventStore());
