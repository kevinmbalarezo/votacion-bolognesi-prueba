const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const xlsx = require('xlsx');

// Configuración para guardar las fotos subidas en la carpeta uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads/'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'candidato-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// 1. Verificar estudiante por Código QR o DNI y si ya votó
router.get('/estudiante/:identificador', (req, res) => {
  const { identificador } = req.params;
  const valorLimpio = identificador.trim();
  
  const query = `
    SELECT * FROM estudiantes 
    WHERE TRIM(codigo_qr) = ? OR TRIM(dni) = ?
  `;
  db.get(query, [valorLimpio, valorLimpio], (err, estudiante) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado en el padrón.' });
    
    if (estudiante.ha_votado === 1) {
      return res.status(400).json({ error: 'Este estudiante ya ha emitido su voto.' });
    }
    
    res.json(estudiante);
  });
});

// 2. Obtener listas electorales según el nivel
router.get('/listas/:nivel', (req, res) => {
  const { nivel } = req.params;
  const nivelLimpio = nivel.trim().toUpperCase();
  const query = `
    SELECT * FROM listas 
    WHERE UPPER(TRIM(nivel)) = ? OR UPPER(TRIM(nivel)) = 'AMBOS'
  `;
  db.all(query, [nivelLimpio], (err, listas) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(listas);
  });
});

// 3. Registrar el voto vinculándolo a la MESA del estudiante
router.post('/votar', (req, res) => {
  const { dni, lista_id, nivel } = req.body;
  if (!dni || !nivel) {
    return res.status(400).json({ error: 'Datos incompletos para registrar el voto.' });
  }
  db.get(`SELECT mesa FROM estudiantes WHERE TRIM(dni) = ?`, [dni.trim()], (err, rowEstudiante) => {
    if (err || !rowEstudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado en el padrón.' });
    }
    const mesaEstudiante = rowEstudiante.mesa || 1;
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      const queryVoto = `INSERT INTO votos (lista_id, nivel, mesa, fecha_voto) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`;
      db.run(queryVoto, [lista_id || null, nivel.trim().toUpperCase(), mesaEstudiante], function(err) {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Error al registrar el voto.' });
        }
        const queryEstudiante = `UPDATE estudiantes SET ha_votado = 1, fecha_voto = CURRENT_TIMESTAMP WHERE TRIM(dni) = ?`;
        db.run(queryEstudiante, [dni.trim()], function(err2) {
          if (err2) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Error al actualizar el estado del estudiante.' });
          }
          db.run('COMMIT');
          res.json({ message: 'Voto registrado correctamente' });
        });
      });
    });
  });
});

// 🔴 RUTA CORREGIDA: Obtener resultados electorales globales por nivel (Conteo exacto por nivel y mesas)
router.get('/resultados/:nivel', (req, res) => {
  const { nivel } = req.params;
  const nivelLimpio = nivel.trim().toUpperCase();
  db.get(`SELECT COUNT(*) as total_padron FROM estudiantes WHERE UPPER(TRIM(nivel)) = ?`, [nivelLimpio], (err, rowPadron) => {
    if (err) return res.status(500).json({ error: err.message });
    const totalPadron = rowPadron ? rowPadron.total_padron : 0;
    db.get(`SELECT COUNT(*) as total_votaron FROM estudiantes WHERE UPPER(TRIM(nivel)) = ? AND ha_votado = 1`, [nivelLimpio], (err, rowVotaron) => {
      if (err) return res.status(500).json({ error: err.message });
      const totalVotaron = rowVotaron ? rowVotaron.total_votaron : 0;
      
      const queryListas = `
        SELECT l.id, l.nombre_lista, l.candidato_principal, l.foto_candidato_url, 
               (SELECT COUNT(v.id) FROM votos v WHERE v.lista_id = l.id AND UPPER(TRIM(v.nivel)) = ?) as votos
        FROM listas l
        WHERE UPPER(TRIM(l.nivel)) = ? OR UPPER(TRIM(l.nivel)) = 'AMBOS'
      `;
      db.all(queryListas, [nivelLimpio, nivelLimpio], (err, listas) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.get(`SELECT COUNT(*) as blancos FROM votos WHERE lista_id IS NULL AND UPPER(TRIM(nivel)) = ?`, [nivelLimpio], (err, rowBlancos) => {
          if (err) return res.status(500).json({ error: err.message });
          const votosBlancos = rowBlancos ? rowBlancos.blancos : 0;
          res.json({
            nivel: nivelLimpio,
            total_padron: totalPadron,
            total_votaron: totalVotaron,
            listas: listas,
            votos_blancos: votosBlancos,
            votos_nulos: 0
          });
        });
      });
    });
  });
});

// 4.1 Obtener datos para Acta Específica de una Mesa
router.get('/acta/:nivel/:mesa', (req, res) => {
  const { nivel, mesa } = req.params;
  const nivelLimpio = nivel.trim().toUpperCase();
  const mesaNum = parseInt(mesa, 10);
  db.get(`SELECT COUNT(*) as total_padron FROM estudiantes WHERE UPPER(TRIM(nivel)) = ? AND mesa = ?`, [nivelLimpio, mesaNum], (err, rowPadron) => {
    if (err) return res.status(500).json({ error: err.message });
    const totalPadron = rowPadron ? rowPadron.total_padron : 0;
    db.get(`SELECT COUNT(*) as total_votaron FROM estudiantes WHERE UPPER(TRIM(nivel)) = ? AND mesa = ? AND ha_votado = 1`, [nivelLimpio, mesaNum], (err, rowVotaron) => {
      if (err) return res.status(500).json({ error: err.message });
      const totalVotaron = rowVotaron ? rowVotaron.total_votaron : 0;
      const queryListas = `
        SELECT l.id, l.nombre_lista, l.candidato_principal, l.foto_candidato_url, 
               (SELECT COUNT(v.id) FROM votos v WHERE v.lista_id = l.id AND UPPER(TRIM(v.nivel)) = ? AND v.mesa = ?) as votos
        FROM listas l
        WHERE UPPER(TRIM(l.nivel)) = ? OR UPPER(TRIM(l.nivel)) = 'AMBOS'
      `;
      db.all(queryListas, [nivelLimpio, mesaNum, nivelLimpio], (err, listas) => {
        if (err) return res.status(500).json({ error: err.message });
        db.get(`SELECT COUNT(*) as blancos FROM votos WHERE lista_id IS NULL AND UPPER(TRIM(nivel)) = ? AND mesa = ?`, [nivelLimpio, mesaNum], (err, rowBlancos) => {
          if (err) return res.status(500).json({ error: err.message });
          const votosBlancos = rowBlancos ? rowBlancos.blancos : 0;
          
          const sumaVotosListas = listas.reduce((acc, item) => acc + item.votos, 0);
          const totalEmitidos = sumaVotosListas + votosBlancos;
          res.json({
            fecha: new Date().toLocaleDateString('es-PE'),
            nivel: nivelLimpio,
            mesa: mesaNum,
            total_padron: totalPadron,
            total_votaron: totalVotaron,
            listas: listas,
            votos_blancos: votosBlancos,
            votos_nulos: 0,
            total_emitidos: totalEmitidos
          });
        });
      });
    });
  });
});

// 4.2 Ruta Consolidada para el Acta General (Desglose Mesas 1 a 4)
router.get('/acta/:nivel', (req, res) => {
  const { nivel } = req.params;
  const nivelLimpio = nivel.trim().toUpperCase();
  db.get(`SELECT COUNT(*) as total_padron FROM estudiantes WHERE UPPER(TRIM(nivel)) = ?`, [nivelLimpio], (err, rowPadron) => {
    if (err) return res.status(500).json({ error: err.message });
    const totalPadron = rowPadron ? rowPadron.total_padron : 0;
    const queryListas = `
      SELECT * FROM listas 
      WHERE UPPER(TRIM(nivel)) = ? OR UPPER(TRIM(nivel)) = 'AMBOS'
    `;
    db.all(queryListas, [nivelLimpio], (err, listas) => {
      if (err) return res.status(500).json({ error: err.message });
      const mesasIds = [1, 2, 3, 4];
      let mesasPromises = mesasIds.map(mesaNum => {
        return new Promise((resolve) => {
          db.get(`SELECT COUNT(*) as votaron FROM estudiantes WHERE UPPER(TRIM(nivel)) = ? AND mesa = ? AND ha_votado = 1`, [nivelLimpio, mesaNum], (errV, rVot) => {
            db.get(`SELECT COUNT(*) as blancos FROM votos WHERE lista_id IS NULL AND UPPER(TRIM(nivel)) = ? AND mesa = ?`, [nivelLimpio, mesaNum], (errB, rBlan) => {
              
              let listaVotosPromises = listas.map(l => {
                return new Promise((resL) => {
                  db.get(`SELECT COUNT(*) as votos FROM votos WHERE lista_id = ? AND UPPER(TRIM(nivel)) = ? AND mesa = ?`, [l.id, nivelLimpio, mesaNum], (errL, rL) => {
                    resL({ id: l.id, votos: rL ? rL.votos : 0 });
                  });
                });
              });
              Promise.all(listaVotosPromises).then(votosListasRes => {
                resolve({
                  mesa: mesaNum,
                  total_votaron: rVot ? rVot.votaron : 0,
                  votos_blancos: rBlan ? rBlan.blancos : 0,
                  votos_listas: votosListasRes
                });
              });
            });
          });
        });
      });
      Promise.all(mesasPromises).then(detalleMesas => {
        let totalVotaronGeneral = detalleMesas.reduce((acc, m) => acc + m.total_votaron, 0);
        let totalBlancosGeneral = detalleMesas.reduce((acc, m) => acc + m.votos_blancos, 0);
        let listasConsolidadas = listas.map(l => {
          let desgloseMesas = {};
          let sumaTotalVotos = 0;
          detalleMesas.forEach(m => {
            let vObj = m.votos_listas.find(vl => vl.id === l.id);
            let vMesa = vObj ? vObj.votos : 0;
            desgloseMesas[`mesa_${m.mesa}`] = vMesa;
            sumaTotalVotos += vMesa;
          });
          return {
            id: l.id,
            nombre_lista: l.nombre_lista,
            candidato_principal: l.candidato_principal,
            foto_candidato_url: l.foto_candidato_url,
            desglose: desgloseMesas,
            votos_totales: sumaTotalVotos
          };
        });
        let sumaVotosListasGeneral = listasConsolidadas.reduce((acc, l) => acc + l.votos_totales, 0);
        let totalEmitidosGeneral = sumaVotosListasGeneral + totalBlancosGeneral;
        res.json({
          fecha: new Date().toLocaleDateString('es-PE'),
          nivel: nivelLimpio,
          total_padron: totalPadron,
          total_votaron: totalVotaronGeneral,
          votos_blancos: totalBlancosGeneral,
          votos_nulos: 0,
          total_emitidos: totalEmitidosGeneral,
          detalle_mesas: detalleMesas,
          listas: listasConsolidadas
        });
      });
    });
  });
});

// 5. GESTIÓN COMPLETA DEL PADRÓN DE ESTUDIANTES
router.get('/estudiantes', (req, res) => {
  db.all(`SELECT * FROM estudiantes ORDER BY mesa ASC, apellidos ASC`, [], (err, filas) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(filas);
  });
});

router.post('/estudiantes', (req, res) => {
  const { dni, codigo_qr, nombres, apellidos, nivel, grado_seccion, mesa } = req.body;
  const dniLimpio = String(dni || '').trim();
  const qrLimpio = String(codigo_qr || dniLimpio).trim();
  const mesaNum = parseInt(mesa || 1, 10);
  
  if (!dniLimpio || !nombres || !apellidos || !nivel || !grado_seccion) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }
  const query = `
    INSERT INTO estudiantes (dni, codigo_qr, nombres, apellidos, nivel, grado_seccion, mesa, ha_votado) 
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `;
  db.run(query, [dniLimpio, qrLimpio, nombres.trim(), apellidos.trim(), nivel.toUpperCase().trim(), grado_seccion.trim(), mesaNum], function(err) {
    if (err) {
      return res.status(400).json({ error: 'El DNI o código QR ya se encuentra registrado.' });
    }
    res.json({ success: true, message: 'Estudiante registrado correctamente.' });
  });
});

router.put('/estudiantes/:dni', (req, res) => {
  const { dni } = req.params;
  const { nombres, apellidos, nivel, grado_seccion, mesa } = req.body;
  const mesaNum = parseInt(mesa || 1, 10);
  if (!nombres || !apellidos || !nivel || !grado_seccion) {
    return res.status(400).json({ error: 'Faltan datos obligatorios para actualizar.' });
  }
  const query = `
    UPDATE estudiantes 
    SET nombres = ?, apellidos = ?, nivel = ?, grado_seccion = ?, mesa = ?
    WHERE TRIM(dni) = ?
  `;
  db.run(query, [nombres.trim(), apellidos.trim(), nivel.toUpperCase().trim(), grado_seccion.trim(), mesaNum, dni.trim()], function(err) {
    if (err) return res.status(500).json({ error: 'Error al actualizar el estudiante.' });
    res.json({ success: true, message: 'Estudiante actualizado correctamente.' });
  });
});

router.delete('/estudiantes/:dni', (req, res) => {
  const { dni } = req.params;
  db.run(`DELETE FROM estudiantes WHERE TRIM(dni) = ?`, [dni.trim()], function(err) {
    if (err) return res.status(500).json({ error: 'Error al eliminar el estudiante.' });
    res.json({ success: true, message: 'Estudiante eliminado del padrón.' });
  });
});

// RUTA PARA IMPORTAR EXCEL CON MULTER Y XLSX (Soporta codigo_qr, dni, nombres, apellidos, nivel, grado_seccion, mesa)
router.post('/estudiantes/importar', upload.any(), (req, res) => {
  try {
    const file = req.files && req.files[0];
    if (!file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo Excel.' });
    }

    const workbook = xlsx.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const estudiantes = xlsx.utils.sheet_to_json(sheet);

    if (!Array.isArray(estudiantes) || estudiantes.length === 0) {
      return res.status(400).json({ error: 'El archivo Excel está vacío o no contiene registros válidos.' });
    }

    db.serialize(() => {
      db.run("BEGIN TRANSACTION;");
      
      const stmt = db.prepare(`
        INSERT INTO estudiantes (dni, codigo_qr, nombres, apellidos, nivel, grado_seccion, mesa, ha_votado) 
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `);
      let errorDuplicado = false;
      let datoExistente = '';
      
      for (const est of estudiantes) {
        const dni = String(est.dni || est.DNI || '').trim();
        const codigo_qr = String(est.codigo_qr || est.QR || est.codigo || dni).trim();
        const nombres = String(est.nombres || est.Nombres || '').trim();
        const apellidos = String(est.apellidos || est.Apellidos || '').trim();
        const nivel = String(est.nivel || est.Nivel || 'PRIMARIA').toUpperCase().trim();
        const grado_seccion = String(est.grado_seccion || est.seccion || est.Grado || '').trim();
        const mesa = parseInt(est.mesa || est.Mesa || 1, 10);

        if (dni && nombres) {
          stmt.run(dni, codigo_qr, nombres, apellidos, nivel, grado_seccion, mesa, function(err) {
            if (err) {
              errorDuplicado = true;
              datoExistente = dni;
            }
          });
        }
      }
      stmt.finalize();

      if (errorDuplicado) {
        db.run("ROLLBACK;");
        return res.status(400).json({ 
          error: `Registro cancelado: Verifique si el DNI o el código QR '${datoExistente}' ya se encuentra inscrito o repetido.` 
        });
      }

      db.run("COMMIT;", (err) => {
        if (err) {
          return res.status(500).json({ error: 'Error al guardar los estudiantes en la base de datos.' });
        }
        res.json({ success: true, registrados: estudiantes.length });
      });
    });
  } catch (e) {
    res.status(500).json({ error: 'Error al procesar el archivo Excel: ' + e.message });
  }
});

// 6. GESTIÓN DE LISTAS ELECTORALES
router.post('/lista', upload.single('foto'), (req, res) => {
  const { nombre_lista, candidato_principal, nivel } = req.body;
  const foto_candidato_url = req.file ? `/uploads/${req.file.filename}` : '/uploads/default.png';
  if (!nombre_lista || !candidato_principal || !nivel) {
    return res.status(400).json({ error: 'Faltan datos obligatorios para registrar la lista.' });
  }
  const query = `INSERT INTO listas (nombre_lista, candidato_principal, nivel, foto_candidato_url) VALUES (?, ?, ?, ?)`;
  
  db.run(query, [nombre_lista.trim(), candidato_principal.trim(), nivel.trim().toUpperCase(), foto_candidato_url], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Error al guardar la lista en la base de datos.' });
    }
    res.json({ success: true, id: this.lastID, foto_url: foto_candidato_url });
  });
});

router.delete('/lista/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM listas WHERE id = ?`, [id], function(err) {
    if (err) return res.status(500).json({ error: 'Error al eliminar la lista.' });
    res.json({ success: true, message: 'Lista eliminada correctamente' });
  });
});

router.put('/lista/:id', upload.single('foto'), (req, res) => {
  const { id } = req.params;
  const { nombre_lista, candidato_principal, nivel } = req.body;
  if (!nombre_lista || !candidato_principal || !nivel) {
    return res.status(400).json({ error: 'Faltan datos obligatorios para actualizar la lista.' });
  }
  const nivelLimpio = nivel.trim().toUpperCase();
  if (req.file) {
    const foto_candidato_url = `/uploads/${req.file.filename}`;
    const query = `UPDATE listas SET nombre_lista = ?, candidato_principal = ?, nivel = ?, foto_candidato_url = ? WHERE id = ?`;
    db.run(query, [nombre_lista.trim(), candidato_principal.trim(), nivelLimpio, foto_candidato_url, id], function(err) {
      if (err) return res.status(500).json({ error: 'Error al actualizar la lista.' });
      res.json({ success: true });
    });
  } else {
    const query = `UPDATE listas SET nombre_lista = ?, candidato_principal = ?, nivel = ? WHERE id = ?`;
    db.run(query, [nombre_lista.trim(), candidato_principal.trim(), nivelLimpio, id], function(err) {
      if (err) return res.status(500).json({ error: 'Error al actualizar la lista.' });
      res.json({ success: true });
    });
  }
});

// 9. Reporte de Asistencia
router.get('/estudiantes/estado/:nivel', (req, res) => {
  const { nivel } = req.params;
  let query = `SELECT dni, nombres, apellidos, nivel, grado_seccion, mesa, COALESCE(ha_votado, 0) as votado FROM estudiantes`;
  let params = [];
  if (nivel !== 'TODOS') {
      query += ` WHERE UPPER(TRIM(nivel)) = ?`;
      params.push(nivel.toUpperCase());
  }
  query += ` ORDER BY mesa ASC, grado_seccion ASC, apellidos ASC`;
  db.all(query, params, (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error al consultar la lista de estudiantes.' });
      
      const total = rows.length;
      const votaron = rows.filter(e => Number(e.votado) === 1).length;
      const pendientes = total - votaron;
      res.json({
          resumen: { total, votaron, pendientes },
          estudiantes: rows
      });
  });
});

// 10. Reiniciar Elecciones
router.post('/reiniciar-elecciones', (req, res) => {
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    db.run(`DELETE FROM votos`, (err) => {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: 'Error al limpiar los votos.' });
      }
      db.run(`UPDATE estudiantes SET ha_votado = 0, fecha_voto = NULL`, (err2) => {
        if (err2) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Error al restablecer el padrón.' });
        }
        db.run('COMMIT');
        res.json({ success: true, message: 'Elecciones reiniciadas con éxito.' });
      });
    });
  });
});

module.exports = router;
