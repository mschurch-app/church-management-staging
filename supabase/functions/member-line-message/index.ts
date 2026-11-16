import {createClient} from 'npm:@supabase/supabase-js@2.102.0';
import {createHandler} from './handler.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createHandler(db,Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')||''));
