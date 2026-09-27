const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Database Tables and Seeds
initDb();

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

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 TrackFlow Backend Server is live on port ${PORT}`);
  console.log(`👉 API Base URL: http://localhost:${PORT}/api`);
  console.log(`👉 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`==================================================\n`);
});
