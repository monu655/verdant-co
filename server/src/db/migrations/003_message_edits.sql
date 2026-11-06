-- Messages can be edited. The first text is kept so nothing is lost, and edited_at lets both sides see "Edited".
ALTER TABLE messages ADD COLUMN edited_at timestamptz;
ALTER TABLE messages ADD COLUMN original_body text;
