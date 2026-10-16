import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import { createAccessHandler } from "./handler.ts";
Deno.serve(
  createAccessHandler({ env: (name) => Deno.env.get(name), createClient }),
);
