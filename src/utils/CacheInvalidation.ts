import { Cache } from "./Cache.js";

export function invalidateYnabCaches() {
  Cache.getInstance().clear();
}