const express = require('express');
const cors = require('cors');
const path = require('path');
const votosRoutes = require('./routes/votos');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'frontend')));

// SERVIR LA CARPETA DE FOTOS SUBIDAS
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rutas de la API
app.use('/api', votosRoutes);

app.listen(PORT, () => {
    console.log(`Servidor de la I.E. Coronel Bolognesi corriendo en http://localhost:${PORT}`);
});