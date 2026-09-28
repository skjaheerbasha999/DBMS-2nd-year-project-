const express = require('express');
const router = express.Router();
const { queryAll, execute } = require('../db');

// GET /api/reports - List generated system reports
router.get('/', async (req, res) => {
  try {
    const reports = await queryAll(`
      SELECT r.*, p.project_name, u.name as generated_by_name
      FROM "REPORT" r
      LEFT JOIN "PROJECT" p ON r.project_id = p.project_id
      LEFT JOIN "USER" u ON r.generated_by = u.user_id
      ORDER BY r.generated_at DESC
    `);
    res.json({ success: true, count: reports.length, data: reports });
  } catch (err) {
    console.error('[Get Reports Error]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/reports - Generate a new report log entry
router.post('/', async (req, res) => {
  try {
    const { project_id, generated_by, report_type } = req.body;
    if (!generated_by || !report_type) {
      return res.status(400).json({ success: false, message: 'generated_by and report_type are required' });
    }

    const reportId = `RPT-${Date.now()}`;
    await execute(
      'INSERT INTO "REPORT" (report_id, project_id, generated_by, report_type) VALUES (?, ?, ?, ?)',
      [reportId, project_id || null, generated_by, report_type]
    );

    res.status(201).json({
      success: true,
      data: {
        report_id: reportId,
        project_id,
        generated_by,
        report_type,
        generated_at: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('[Generate Report Error]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
