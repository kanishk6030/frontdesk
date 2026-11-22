-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(150) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(3),
    "display_name" VARCHAR(120) NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "assignee_id" UUID,
    "subject" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "calendar_snapshot" JSONB NOT NULL,
    "first_response_due_at" TIMESTAMPTZ(3) NOT NULL,
    "first_response_at" TIMESTAMPTZ(3),
    "first_response_entry_id" UUID,
    "first_response_breached_at" TIMESTAMPTZ(3),
    "resolution_budget_ms" BIGINT NOT NULL,
    "resolution_consumed_ms" BIGINT NOT NULL DEFAULT 0,
    "resolution_running_since" TIMESTAMPTZ(3),
    "resolution_due_at" TIMESTAMPTZ(3),
    "resolution_breached_at" TIMESTAMPTZ(3),
    "wait_started_at" TIMESTAMPTZ(3),
    "auto_close_due_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "reopen_until" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "close_reason" TEXT,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entries" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "author_role" TEXT NOT NULL,
    "author_label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" BIGSERIAL NOT NULL,
    "ticket_id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_type" TEXT NOT NULL,
    "actor_label" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "entry_id" UUID,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "effective_at" TIMESTAMPTZ(3) NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT date_trunc('milliseconds', clock_timestamp()),
    "ticket_version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "tickets_assignee_id_status_created_at_id_idx" ON "tickets"("assignee_id", "status", "created_at", "id");

-- CreateIndex
CREATE INDEX "tickets_customer_id_created_at_id_idx" ON "tickets"("customer_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "tickets_status_created_at_id_idx" ON "tickets"("status", "created_at", "id");

-- CreateIndex
CREATE INDEX "entries_ticket_id_created_at_id_idx" ON "entries"("ticket_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "entries_ticket_id_kind_created_at_id_idx" ON "entries"("ticket_id", "kind", "created_at", "id");

-- CreateIndex
CREATE INDEX "audit_events_ticket_id_id_idx" ON "audit_events"("ticket_id", "id");

-- CreateIndex
CREATE INDEX "session_expire_idx" ON "session"("expire");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_first_response_entry_id_fkey" FOREIGN KEY ("first_response_entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entries" ADD CONSTRAINT "entries_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entries" ADD CONSTRAINT "entries_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
