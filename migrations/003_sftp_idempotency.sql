ALTER TABLE media ADD COLUMN source_path TEXT;
CREATE UNIQUE INDEX media_source_path_unique_idx
  ON media(source_path)
  WHERE source_path IS NOT NULL;
