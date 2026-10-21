import { readEnvironment } from "./readEnvironment";

export const config = readEnvironment(import.meta.env);
