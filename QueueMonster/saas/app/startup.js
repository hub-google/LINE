import {load} from "./data-loading.js";

// Business data is fetched when the page first opens or a user action
// explicitly calls load()/refresh. Do not poll Supabase in the background.
// version-watch.js independently checks GitHub Pages release.json and keeps
// the existing new-version notification, without polling Supabase.
export function initializeStartup(){
  void load();
}
