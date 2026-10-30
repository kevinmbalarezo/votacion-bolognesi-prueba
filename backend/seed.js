const db = require('./config/db');

const estudiantesPrueba = [
  { dni: '70123456', nombres: 'Carlos', apellidos: 'Pérez Gómez', nivel: 'PRIMARIA', grado_seccion: '6to A' },
  { dni: '71649943', nombres: 'Lucía', apellidos: 'Fernández Ruiz', nivel: 'PRIMARIA', grado_seccion: '5to B' },
  { dni: '70234567', nombres: 'Mateo', apellidos: 'Silva Ramos', nivel: 'SECUNDARIA', grado_seccion: '3ro A' },
  { dni: '70234568', nombres: 'Valeria', apellidos: 'Torres Castro', nivel: 'SECUNDARIA', grado_seccion: '4to B' }
];

const listasPrueba = [
  { nombre_lista: 'Unidos por el Cole', simbolo_url: 'estrella.png', candidato_principal: 'Juan Pérez', foto_candidato_url: 'juan.png', nivel: 'AMBOS' },
  { nombre_lista: 'Innovación Estudiantil', simbolo_url: 'lapiz.png', candidato_principal: 'Sofía Martí', foto_candidato_url: 'sofia.png', nivel: 'SECUNDARIA' }
];

db.serialize(() => {
  console.log('Insertando datos de prueba...');

  const stmtEstudiante = db.prepare(`INSERT OR REPLACE INTO estudiantes (dni, nombres, apellidos, nivel, grado_seccion) VALUES (?, ?, ?, ?, ?)`);
  estudiantesPrueba.forEach(est => {
    stmtEstudiante.run(est.dni, est.nombres, est.apellidos, est.nivel, est.grado_seccion);
  });
  stmtEstudiante.finalize();

  const stmtLista = db.prepare(`INSERT OR REPLACE INTO listas (id, nombre_lista, simbolo_url, candidato_principal, foto_candidato_url, nivel) VALUES (?, ?, ?, ?, ?, ?)`);
  listasPrueba.forEach((lista, idx) => {
    stmtLista.run(idx + 1, lista.nombre_lista, lista.simbolo_url, lista.candidato_principal, lista.foto_candidato_url, lista.nivel);
  });
  stmtLista.finalize();

  console.log('¡Datos guardados con éxito!');
});