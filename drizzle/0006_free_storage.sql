CREATE TABLE media_usage(id INTEGER PRIMARY KEY CHECK(id=1), bytes INTEGER NOT NULL DEFAULT 0 CHECK(bytes>=0 AND bytes<=209715200));
INSERT INTO media_usage(id,bytes) VALUES(1,0);
CREATE TABLE media_files(object_key TEXT PRIMARY KEY, data TEXT NOT NULL, content_type TEXT NOT NULL, stored_bytes INTEGER NOT NULL CHECK(stored_bytes=length(data) AND stored_bytes<=266668));
CREATE TRIGGER media_capacity BEFORE INSERT ON media_files WHEN NOT EXISTS(SELECT 1 FROM media_files WHERE object_key=NEW.object_key) BEGIN
 SELECT CASE WHEN (SELECT bytes FROM media_usage WHERE id=1)+NEW.stored_bytes>209715200 THEN RAISE(ABORT,'media_capacity') END;
END;
CREATE TRIGGER media_added AFTER INSERT ON media_files BEGIN UPDATE media_usage SET bytes=bytes+NEW.stored_bytes WHERE id=1; END;
CREATE TRIGGER media_removed AFTER DELETE ON media_files BEGIN UPDATE media_usage SET bytes=bytes-OLD.stored_bytes WHERE id=1; END;
CREATE TRIGGER media_immutable BEFORE UPDATE ON media_files BEGIN SELECT RAISE(ABORT,'media_immutable'); END;
CREATE INDEX IF NOT EXISTS hour_entries_student_month ON hour_entries(student_id,category,assigned_at);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
