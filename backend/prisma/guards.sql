-- These protections are copied into the reviewed migration, not run at web startup.
ALTER TABLE users ADD CONSTRAINT user_role CHECK(role IN ('AGENT','CUSTOMER'));
ALTER TABLE tickets
 ADD CONSTRAINT ticket_enums CHECK(priority IN ('HIGH','MEDIUM','LOW') AND status IN ('OPEN','IN_PROGRESS','WAITING_CUSTOMER','RESOLVED','CLOSED')),
 ADD CONSTRAINT ticket_owner CHECK((status='OPEN') = (assignee_id IS NULL)),
 ADD CONSTRAINT ticket_clock CHECK((status IN ('OPEN','IN_PROGRESS')) = (resolution_running_since IS NOT NULL) AND (status NOT IN ('OPEN','IN_PROGRESS') OR resolution_due_at IS NOT NULL) AND (status NOT IN ('WAITING_CUSTOMER','CLOSED') OR resolution_due_at IS NULL)),
 ADD CONSTRAINT ticket_wait CHECK((status='WAITING_CUSTOMER') = (wait_started_at IS NOT NULL) AND (status='WAITING_CUSTOMER') = (auto_close_due_at IS NOT NULL)),
 ADD CONSTRAINT ticket_resolved CHECK((status='RESOLVED') = (resolved_at IS NOT NULL) AND (status='RESOLVED') = (reopen_until IS NOT NULL) AND (reopen_until IS NULL OR reopen_until>resolved_at)),
 ADD CONSTRAINT ticket_closed CHECK((status='CLOSED') = (closed_at IS NOT NULL) AND (status='CLOSED') = (close_reason IS NOT NULL) AND (close_reason IS NULL OR close_reason='CUSTOMER_TIMEOUT')),
 ADD CONSTRAINT ticket_response CHECK((first_response_at IS NULL) = (first_response_entry_id IS NULL) AND (status NOT IN ('WAITING_CUSTOMER','RESOLVED','CLOSED') OR first_response_at IS NOT NULL)),
 ADD CONSTRAINT ticket_counters CHECK(version>0 AND resolution_budget_ms BETWEEN 1 AND 9007199254740991 AND resolution_consumed_ms BETWEEN 0 AND 9007199254740991),
 ADD CONSTRAINT ticket_text CHECK(length(trim(subject)) BETWEEN 1 AND 160 AND length(trim(description)) BETWEEN 1 AND 10000);
ALTER TABLE entries ADD CONSTRAINT entry_values CHECK(kind IN ('PUBLIC_REPLY','INTERNAL_NOTE') AND author_role IN ('AGENT','CUSTOMER') AND (kind<>'INTERNAL_NOTE' OR author_role='AGENT') AND length(trim(body)) BETWEEN 1 AND 10000);
ALTER TABLE audit_events ADD CONSTRAINT audit_actor CHECK(actor_type IN ('AGENT','CUSTOMER','SYSTEM') AND (actor_type='SYSTEM')=(actor_id IS NULL)),
 ADD CONSTRAINT audit_version CHECK(ticket_version>0),
 ADD CONSTRAINT audit_type CHECK(event_type IN ('TICKET_CREATED','TICKET_CLAIMED','PUBLIC_REPLY_ADDED','INTERNAL_NOTE_ADDED','WAIT_STARTED','WAIT_ENDED','PRIORITY_CHANGED','TICKET_RESOLVED','TICKET_REOPENED','TICKET_AUTO_CLOSED','FIRST_RESPONSE_BREACHED','RESOLUTION_BREACHED'));
CREATE UNIQUE INDEX audit_first_breach ON audit_events(ticket_id,event_type) WHERE event_type IN ('FIRST_RESPONSE_BREACHED','RESOLUTION_BREACHED');
CREATE INDEX ticket_wait_due ON tickets(auto_close_due_at,id) WHERE status='WAITING_CUSTOMER';
CREATE INDEX ticket_response_due ON tickets(first_response_due_at,id) WHERE first_response_at IS NULL;
CREATE INDEX ticket_resolution_due ON tickets(resolution_due_at,id) WHERE resolution_running_since IS NOT NULL;
CREATE FUNCTION reject_evidence_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Evidence is append-only' USING ERRCODE='42501'; END $$;
CREATE TRIGGER entries_immutable BEFORE UPDATE OR DELETE ON entries FOR EACH ROW EXECUTE FUNCTION reject_evidence_rewrite();
CREATE TRIGGER entries_no_truncate BEFORE TRUNCATE ON entries FOR EACH STATEMENT EXECUTE FUNCTION reject_evidence_rewrite();
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_evidence_rewrite();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_events FOR EACH STATEMENT EXECUTE FUNCTION reject_evidence_rewrite();
CREATE FUNCTION stamp_audit_recorded_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.recorded_at = date_trunc('milliseconds',clock_timestamp()); RETURN NEW; END $$;
CREATE TRIGGER audit_insert_time BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION stamp_audit_recorded_at();
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
