const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class SystemDatabase {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  async initialize() {
    console.log('Initializing System database connection...');
    if (this.initialized) return;

    try {
      const dbPath = path.join(__dirname, 'system.db');
      console.log('System database path:', dbPath);

      // Check if database file exists, if not create it
      const dbExists = fs.existsSync(dbPath);
      
      // Open database with better-sqlite3
      this.db = new Database(dbPath);
      
      // Enable foreign key constraints
      this.db.pragma('foreign_keys = ON');
      
      if (!dbExists) {
        console.log('Creating system database tables...');
        await this.createTables();
        await this.insertDefaultData();
      } else {
        // Check if tables exist and have correct structure
        try {
          const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
          const tableNames = tables.map(t => t.name);
          
          if (!tableNames.includes('screens') || !tableNames.includes('screen_spaces') || !tableNames.includes('screen_space_settings')) {
            console.log('Missing tables detected, recreating...');
            await this.createTables();
            await this.insertDefaultData();
          }
        } catch (error) {
          console.log('Error checking tables, recreating...');
          await this.createTables();
          await this.insertDefaultData();
        }
      }
      
      this.initialized = true;
      console.log(`Connected to System SQLite database: ${dbPath}`);
    } catch (error) {
      console.error('Failed to initialize System database:', error);
      throw error;
    }
  }

  async createTables() {
    const sqlPath = path.join(__dirname, 'system.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
    
    statements.forEach(stmt => {
      try {
        this.db.exec(stmt);
      } catch (error) {
        console.error('Error executing SQL statement:', stmt, error);
      }
    });
  }

  async insertDefaultData() {
    // Insert default screen
    const insertScreen = this.db.prepare(`
      INSERT INTO screens (screen_name, resolution, aspect_ratio)
      VALUES ('Primary Display', '1920x1080', '16:9')
    `);
    const screenResult = insertScreen.run();
    const screenId = screenResult.lastInsertRowid;

    // Insert default screen space with pixel values
    const insertSpace = this.db.prepare(`
      INSERT INTO screen_spaces (screen_id, space_name, height, width, x_position, y_position, z_index, is_active)
      VALUES (?, 'Main Content Area', 600, 800, 100, 100, 1, 1)
    `);
    const spaceResult = insertSpace.run(screenId);
    const spaceId = spaceResult.lastInsertRowid;

    // Insert default settings
    const insertSettings = this.db.prepare(`
      INSERT INTO screen_space_settings (
        screen_space_id, font_size, font_weight, font_color, font_family, 
        font_style, line_height, text_align, text_decoration, text_shadow, text_resizing
      ) VALUES (?, 24, 'normal', '#ffffff', 'Arial, sans-serif', 'normal', '1.4', 'center', 'none', 'none', 1)
    `);
    insertSettings.run(spaceId);

    console.log('Inserted default system data');
  }

  // Screen operations
  getAllScreens() {
    this.ensureInitialized();
    const sql = `
      SELECT * FROM screens
      ORDER BY created_at DESC
    `;
    return this.db.prepare(sql).all();
  }

  getScreen(id) {
    this.ensureInitialized();
    const sql = `
      SELECT * FROM screens WHERE id = ?
    `;
    return this.db.prepare(sql).get(id);
  }

  createScreen(screenData) {
    this.ensureInitialized();
    const sql = `
      INSERT INTO screens (screen_name, resolution, aspect_ratio)
      VALUES (?, ?, ?)
    `;
    const result = this.db.prepare(sql).run(
      screenData.screen_name,
      screenData.resolution,
      screenData.aspect_ratio
    );
    return { id: result.lastInsertRowid, ...screenData };
  }

  updateScreen(id, screenData) {
    this.ensureInitialized();
    const sql = `
      UPDATE screens 
      SET screen_name = ?, resolution = ?, aspect_ratio = ?
      WHERE id = ?
    `;
    this.db.prepare(sql).run(
      screenData.screen_name,
      screenData.resolution,
      screenData.aspect_ratio,
      id
    );
    return { id, ...screenData };
  }

  deleteScreen(id) {
    this.ensureInitialized();
    const sql = `DELETE FROM screens WHERE id = ?`;
    return this.db.prepare(sql).run(id);
  }

  // Screen Space operations
  getScreenSpaces(screenId) {
    this.ensureInitialized();
    const sql = `
      SELECT ss.*, sss.*
      FROM screen_spaces ss
      LEFT JOIN screen_space_settings sss ON ss.id = sss.screen_space_id
      WHERE ss.screen_id = ?
      ORDER BY ss.created_at
    `;
    return this.db.prepare(sql).all(screenId);
  }

  createScreenSpace(spaceData) {
    this.ensureInitialized();
    
    // Validate that the screen exists
    const screenExists = this.db.prepare('SELECT id FROM screens WHERE id = ?').get(spaceData.screen_id);
    if (!screenExists) {
      throw new Error(`Screen with id ${spaceData.screen_id} does not exist`);
    }
    
    // Get current count of spaces for this screen to determine next z_index
    const countSql = `SELECT COUNT(*) as count FROM screen_spaces WHERE screen_id = ?`;
    const { count } = this.db.prepare(countSql).get(spaceData.screen_id) || { count: 0 };
    const next_z_index = count; // 0-based indexing
    
    console.log('Creating space with data:', {
      ...spaceData,
      z_index: spaceData.z_index !== undefined ? spaceData.z_index : next_z_index
    });
    
    const insertSpace = this.db.prepare(`
      INSERT INTO screen_spaces (screen_id, space_name, height, width, x_position, y_position, z_index, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const spaceResult = insertSpace.run(
      spaceData.screen_id,
      spaceData.space_name,
      spaceData.height,
      spaceData.width,
      spaceData.x_position,
      spaceData.y_position,
      spaceData.z_index !== undefined ? spaceData.z_index : next_z_index,
      spaceData.is_active || 0
    );
    
    const spaceId = spaceResult.lastInsertRowid;
    console.log('Created space with ID:', spaceId);

    // Create default settings for the space
    const insertSettings = this.db.prepare(`
      INSERT INTO screen_space_settings (
        screen_space_id, font_size, font_weight, font_color, font_family,
        font_style, line_height, text_align, text_decoration, text_shadow, text_resizing
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    insertSettings.run(
      spaceId,
      24, // default font_size
      'normal', // default font_weight
      '#ffffff', // default font_color
      'Arial, sans-serif', // default font_family
      'normal', // default font_style
      '1.4', // default line_height
      'center', // default text_align
      'none', // default text_decoration
      'none', // default text_shadow
      1 // default text_resizing
    );

    // Return the created space with all data
    const getCreatedSpace = this.db.prepare(`
      SELECT ss.*, sss.*
      FROM screen_spaces ss
      LEFT JOIN screen_space_settings sss ON ss.id = sss.screen_space_id
      WHERE ss.id = ?
    `);
    
    const createdSpace = getCreatedSpace.get(spaceId);
    console.log('Returning created space:', createdSpace);
    return createdSpace;
  }

  updateScreenSpace(id, spaceData) {
    this.ensureInitialized();
    
    // Get current space data to preserve values if not provided
    const currentSpace = this.db.prepare('SELECT * FROM screen_spaces WHERE id = ?').get(id);
    if (!currentSpace) {
      throw new Error(`Screen space with id ${id} does not exist`);
    }
    
    // If updating z_index, validate it's within bounds
    if (spaceData.z_index !== undefined) {
      const countSql = `SELECT COUNT(*) as count FROM screen_spaces WHERE screen_id = ?`;
      const { count } = this.db.prepare(countSql).get(currentSpace.screen_id) || { count: 0 };
      const maxZIndex = Math.max(0, count - 1);
      
      if (spaceData.z_index < 0 || spaceData.z_index > maxZIndex) {
        throw new Error(`z_index must be between 0 and ${maxZIndex}`);
      }
    }
    
    const sql = `
      UPDATE screen_spaces
      SET space_name = ?, height = ?, width = ?, x_position = ?, y_position = ?, z_index = ?, is_active = ?
      WHERE id = ?
    `;
    this.db.prepare(sql).run(
      spaceData.space_name !== undefined ? spaceData.space_name : currentSpace.space_name,
      spaceData.height !== undefined ? spaceData.height : currentSpace.height,
      spaceData.width !== undefined ? spaceData.width : currentSpace.width,
      spaceData.x_position !== undefined ? spaceData.x_position : currentSpace.x_position,
      spaceData.y_position !== undefined ? spaceData.y_position : currentSpace.y_position,
      spaceData.z_index !== undefined ? spaceData.z_index : currentSpace.z_index,
      spaceData.is_active !== undefined ? spaceData.is_active : currentSpace.is_active,
      id
    );
    return { id, ...spaceData };
  }

  deleteScreenSpace(id) {
    this.ensureInitialized();
    
    // Get the space being deleted to reorder remaining spaces
    const deletedSpace = this.db.prepare('SELECT * FROM screen_spaces WHERE id = ?').get(id);
    if (!deletedSpace) {
      throw new Error(`Screen space with id ${id} does not exist`);
    }
    
    // Delete the space
    const sql = `DELETE FROM screen_spaces WHERE id = ?`;
    const result = this.db.prepare(sql).run(id);
    
    // Reorder remaining spaces to fill the gap
    const reorderSql = `
      UPDATE screen_spaces 
      SET z_index = z_index - 1 
      WHERE screen_id = ? AND z_index > ?
    `;
    this.db.prepare(reorderSql).run(deletedSpace.screen_id, deletedSpace.z_index);
    
    return result;
  }

  // Screen Space Settings operations
  updateScreenSpaceSettings(spaceId, settings) {
    this.ensureInitialized();
    const sql = `
      UPDATE screen_space_settings
      SET font_size = ?, font_weight = ?, font_color = ?, font_family = ?,
          font_style = ?, line_height = ?, text_align = ?, text_decoration = ?,
          text_shadow = ?, text_resizing = ?
      WHERE screen_space_id = ?
    `;
    this.db.prepare(sql).run(
      settings.font_size,
      settings.font_weight,
      settings.font_color,
      settings.font_family,
      settings.font_style,
      settings.line_height,
      settings.text_align,
      settings.text_decoration,
      settings.text_shadow,
      settings.text_resizing,
      spaceId
    );
    return settings;
  }

  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('System database not initialized. Call initialize() first.');
    }
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}

module.exports = { SystemDatabase };
