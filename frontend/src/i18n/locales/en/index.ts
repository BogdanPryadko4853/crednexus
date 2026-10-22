import { cabinet } from "./cabinet.ts";
import { common } from "./common.ts";
import { creditApplication } from "./creditApplication.ts";

export const en = { ...common, ...creditApplication, ...cabinet };
