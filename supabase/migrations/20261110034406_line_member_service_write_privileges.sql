-- The verified enrollment/claim RPCs are SECURITY INVOKER. The trusted Edge
-- service must hold the exact DML privileges used by those functions.
-- These grants never apply to anon/authenticated or confer coworker access.
grant insert(church_id,login_channel_id,line_subject,member_id,active,approved_at,binding_source)
 on church_auth.member_bindings to service_role;
-- PostgreSQL row locks require UPDATE privilege on at least one selected column.
grant update(active) on church_auth.member_bindings to service_role;
grant insert(id,church_id,login_channel_id,line_subject,applicant_name,applicant_phone,status,member_id)
 on church_auth.binding_requests to service_role;
grant update(status,member_id,applicant_name,applicant_phone)
 on church_auth.binding_requests to service_role;
