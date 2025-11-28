DROP TABLE IF EXISTS screen_space_settings;
DROP TABLE IF EXISTS screen_spaces;
DROP TABLE IF EXISTS screens;

CREATE TABLE IF NOT EXISTS screens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  screen_name TEXT NOT NULL,
  resolution TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS screen_spaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  screen_id INTEGER NOT NULL,
  space_name TEXT NOT NULL,
  height INTEGER NOT NULL,
  width INTEGER NOT NULL,
  x_position INTEGER NOT NULL,
  y_position INTEGER NOT NULL,
  z_index INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS screen_space_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  screen_space_id INTEGER NOT NULL,
  font_size INTEGER NOT NULL DEFAULT 24,
  font_weight TEXT NOT NULL DEFAULT 'normal',
  font_color TEXT NOT NULL DEFAULT '#ffffff',
  font_family TEXT NOT NULL DEFAULT 'Arial, sans-serif',
  font_style TEXT NOT NULL DEFAULT 'normal',
  line_height TEXT NOT NULL DEFAULT '1.4',
  text_align TEXT NOT NULL DEFAULT 'center',
  text_decoration TEXT NOT NULL DEFAULT 'none',
  text_shadow TEXT NOT NULL DEFAULT 'none',
  text_resizing INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (screen_space_id) REFERENCES screen_spaces(id) ON DELETE CASCADE
);
