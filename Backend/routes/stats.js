const express = require('express');
const router = express.Router();
const { queryOne, queryAll } = require('../db');

// GET /api/stats/summary - Global KPIs for Dashboard counters
router.get('/summary', (req, res) => {
  const totalUsers = queryOne('SELECT COUNT(*) as count FROM USER');
  const totalProjects = queryOne('SELECT COUNT(*) as count FROM PROJECT');
  const totalIssues = queryOne('SELECT COUNT(*) as count FROM ISSUE');
  const openIssues = queryOne('SELECT COUNT(*) as count FROM ISSUE WHERE status_id = 1');
  const inProgressIssues = queryOne('SELECT COUNT(*) as count FROM ISSUE WHERE status_id = 2');
  const resolvedIssues = queryOne('SELECT COUNT(*) as count FROM ISSUE WHERE status_id = 3');
  const closedIssues = queryOne('SELECT COUNT(*) as count FROM ISSUE WHERE status_id = 4');

  const priorityBreakdown = queryAll(`
    SELECT pri.priority_name, COUNT(i.issue_id) as count
    FROM PRIORITY pri
    LEFT JOIN ISSUE i ON pri.priority_id = i.priority_id
    GROUP BY pri.priority_id, pri.priority_name
  `);

  const statusBreakdown = queryAll(`
    SELECT st.status_name, COUNT(i.issue_id) as count
    FROM STATUS st
    LEFT JOIN ISSUE i ON st.status_id = i.status_id
    GROUP BY st.status_id, st.status_name
  `);

  res.json({
    success: true,
    data: {
      users_total: totalUsers ? totalUsers.count : 0,
      projects_total: totalProjects ? totalProjects.count : 0,
      issues_total: totalIssues ? totalIssues.count : 0,
      issues_open: openIssues ? openIssues.count : 0,
      issues_in_progress: inProgressIssues ? inProgressIssues.count : 0,
      issues_resolved: resolvedIssues ? resolvedIssues.count : 0,
      issues_closed: closedIssues ? closedIssues.count : 0,
      resolution_rate_percent: totalIssues && totalIssues.count > 0 
        ? ((resolvedIssues.count / totalIssues.count) * 100).toFixed(1) 
        : 0,
      priority_breakdown: priorityBreakdown,
      status_breakdown: statusBreakdown
    }
  });
});

module.exports = router;
