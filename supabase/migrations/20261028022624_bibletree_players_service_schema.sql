-- TARGET: game project loscejilzfdwhmogkuwf. Only the Edge server role.
-- SECURITY INVOKER public RPC needs schema lookup permission for its private helper.
grant usage on schema game_private to service_role;
