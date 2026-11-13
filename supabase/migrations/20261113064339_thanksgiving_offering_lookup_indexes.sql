-- Cover the new feature's foreign keys without changing existing business tables.
create index offering_audit_response_idx on offering_response.audit(response_id);
create index offering_settings_recipient_idx on offering_response.settings(recipient_staff_id);
