import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import { createNotionHandler } from "./handler.ts";
Deno.serve(
  createNotionHandler({ env: (name) => Deno.env.get(name), createClient }),
);
