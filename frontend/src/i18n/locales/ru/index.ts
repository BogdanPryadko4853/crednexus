import { cabinet } from "./cabinet.ts";
import { workflow } from "./workflow.ts";
import { common } from "./common.ts";
import { creditApplication } from "./creditApplication.ts";

export const ru = { ...common, ...creditApplication, ...cabinet, ...workflow };
