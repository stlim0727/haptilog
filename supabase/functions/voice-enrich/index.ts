import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import { createHandler } from "./handler.ts";

Deno.serve(createHandler({ env: Deno.env.get, createClient, fetch }));
