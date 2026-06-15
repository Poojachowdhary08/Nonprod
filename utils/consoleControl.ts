import { IS_PROD_ENV } from "./apiBase";

let applied = false;

const noop = () => {};

export function configureConsole() {
  if (applied) return;
  applied = true;

  if (!IS_PROD_ENV) return;

  console.log = noop;
  console.info = noop;
  console.debug = noop;
  console.warn = noop;
  console.error = noop;
}
