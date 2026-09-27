const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute } = require('../db');

// GET /api/reports - List generated relational audit reports
router.get('/', (req, res) => {
  const reports = queryAll(`
    SELECT 
      r.report_id,
      r.project_id,
      r.generated_by,
      r.report_type,
      r.generated_at,
      p.project_name,
      u.name as generator_name
    FROM REPORT r
    LEFT JOIN PROJECT p ON r.project_id = p.project_id
    JOIN USER u ON r.generated_by = u.user_id
    ORDER BY r.generated_at DESC
  `);

  res.json({ success: true, count: reports.length, data: reports });
});

// POST /api/reports - Generate a new DBMS report
router.post('/', (req, res) => {
  const { project_id, generated_by, report_type } = req.body;

  if (!generated_by || !report_type) {
    return res.status(400).json({ success: false, message: 'generated_by and report_type are required' });
  }

  const reportId = `RPT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  execute(
    'INSERT INTO REPORT (report_id, project_id, generated_by, report_type) VALUES (?, ?, ?, ?)',
    [reportId, project_id || null, generated_by, report_type]
  );

  const report = queryOne(`
    SELECT r.*, p.project_name, u.name as generator_name 
    FROM REPORT r 
    LEFT JOIN PROJECT p ON r.project_id = p.project_id 
    JOIN USER u ON r.generated_by = u.user_id 
    WHERE r.report_id = ?
  `, [reportId]);

  res.status(201).json({ success: true, data: report });
});

module.exports = router;
