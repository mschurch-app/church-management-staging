import {createHandler} from './handler.mjs';
// OS JWTs belong to another project. Authenticate them with OS Auth and fresh
// server grants inside the handler before using the game service-role RPC.
Deno.serve(createHandler({gameURL:Deno.env.get('SUPABASE_URL'),gameSecret:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}));
