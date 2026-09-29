const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');

const app = express();
let PORT = parseInt(process.env.PORT, 10) || 5000;

// Middlewares
app.use(cors());
app.use(express.json());

// Request logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/issues', require('./routes/issues'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/ai', require('./routes/ai'));

// Root & Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'TrackFlow DBMS API Backend Engine',
    version: '1.0.0'
  });
});

app.get('/', (req, res) => {
  res.json({
    message: '🚀 TrackFlow DBMS Relational Backend API is running!',
    health: '/api/health',
    endpoints: [
      '/api/auth/login',
      '/api/users',
      '/api/projects',
      '/api/issues',
      '/api/reports',
      '/api/stats/summary'
    ]
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Error Handler]', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

function startServer(portToUse) {
  const server = app.listen(portToUse, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 TrackFlow Backend Server is live on port ${portToUse}`);
    console.log(`👉 API Base URL: http://localhost:${portToUse}/api`);
    console.log(`👉 Health Check: http://localhost:${portToUse}/api/health`);
    console.log(`==================================================\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Server Warning] Port ${portToUse} is in use. Trying port ${portToUse + 1}...`);
      startServer(portToUse + 1);
    } else {
      console.error('[Server Error]', err);
    }
  });
}

// Async Database Setup before server launch
async function main() {
  await initDb();
  startServer(PORT);
}

main();
