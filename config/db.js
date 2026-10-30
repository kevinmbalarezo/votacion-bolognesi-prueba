const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Ruta de la base de datos
const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err.message);
  } else {
    console.log('Base de datos SQLite conectada correctamente.');
    
    // 1. Crear tabla estudiantes con el campo MESA incluido
    db.run(`CREATE TABLE IF NOT EXISTS estudiantes (
        dni TEXT PRIMARY KEY,
        codigo_qr TEXT UNIQUE,
        nombres TEXT NOT NULL,
        apellidos TEXT NOT NULL,
        nivel TEXT NOT NULL,
        grado_seccion TEXT NOT NULL,
        mesa INTEGER DEFAULT 1,
        ha_votado INTEGER DEFAULT 0,
        fecha_voto DATETIME
    )`, (createErr) => {
      if (!createErr) {
        // SEGURIDAD: Agregar columnas si la base de datos ya existía previamente
        db.run(`ALTER TABLE estudiantes ADD COLUMN codigo_qr TEXT`, (alterErr) => {});
        db.run(`ALTER TABLE estudiantes ADD COLUMN mesa INTEGER DEFAULT 1`, (alterErr) => {});
      }
    });

    // 2. Crear tabla listas si no existe
    db.run(`CREATE TABLE IF NOT EXISTS listas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre_lista TEXT NOT NULL,
        candidato_principal TEXT NOT NULL,
        nivel TEXT NOT NULL,
        foto_candidato_url TEXT
    )`);

    // 3. Crear tabla votos con el campo MESA incluido para filtrar por cada mesa
    db.run(`CREATE TABLE IF NOT EXISTS votos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lista_id INTEGER,
        nivel TEXT NOT NULL,
        mesa INTEGER DEFAULT 1,
        fecha_voto DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (createErr) => {
      if (!createErr) {
        // SEGURIDAD: Agregar la columna mesa a votos si la tabla ya existía
        db.run(`ALTER TABLE votos ADD COLUMN mesa INTEGER DEFAULT 1`, (alterErr) => {});
      }
    });
  }
});

module.exports = db;