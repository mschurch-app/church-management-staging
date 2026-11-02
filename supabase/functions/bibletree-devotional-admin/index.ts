import {createHandler} from './handler.mjs';
// This function verifies the Church OS JWT with that project's Auth API and
// current server grants. The game project's gateway cannot validate an OS JWT.
Deno.serve(createHandler({gameURL:Deno.env.get('SUPABASE_URL'),gameSecret:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}));

