// Supabase settings. Find both values in the dashboard: Project Settings > API
//   - Project URL            -> SUPABASE_URL
//   - Publishable (anon) key -> SUPABASE_PUBLISHABLE_KEY
// NEVER put a service-role or secret key in this file: it is visible to every player.
const SUPABASE_URL = "https://yfcmudipiugfukwduijk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_hWOgbWnzOwOgoJI9pBTlCw_bEgR49p4";

// `supabase` stays null if the library cannot load or the settings are still placeholders,
// so the game is always playable. script.js checks for null before every database call.
export let supabase = null;
try {
  if (!SUPABASE_URL.includes("YOUR_") && !SUPABASE_PUBLISHABLE_KEY.includes("YOUR_")) {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  }
} catch (error) { console.warn("Supabase unavailable; playing offline.", error); }
