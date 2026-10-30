const db = require('./config/db');

db.run(`DELETE FROM votos`, (err) => {
  if (err) {
    console.error('Error al reiniciar los votos:', err.message);
  } else {
    console.log('✅ Los votos se han reiniciado a 0 correctamente.');
  }
  db.close();
});