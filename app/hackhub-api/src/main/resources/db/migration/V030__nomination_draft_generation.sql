CREATE TABLE nomination_draft_state (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    generation integer NOT NULL DEFAULT 0
);

INSERT INTO nomination_draft_state DEFAULT VALUES;
