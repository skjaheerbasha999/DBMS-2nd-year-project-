const express = require('express');
const router = express.Router();
const { queryOne, queryAll } = require('../db');

// GET /api/stats/summary - Global KPIs for User & Admin Dashboards
router.get('/summary', (req, res) => {
  const { user_id } = req.query;

  try {
    if (user_id) {
      // User-specific stats
      const myIssues = queryOne('SELECT COUNT(*) as count FROM ISSUE WHERE reported_by = ?', [user_id]);
      const openIssues = queryOne('SELECT COUNT(*) as count FROM ISSUE WHERE reported_by = ? AND status_id = 1', [user_id]);
      const inProgressIssues = queryOne('SELECT COUNT(*) as count FROM ISSUE WHERE reported_by = ? AND status_id = 2', [user_id]);
      const resolvedIssues = queryOne('SELECT COUNT(*) as count FROM ISSUE WHERE reported_by = ? AND status_id = 3', [user_id]);

      return res.json({
        success: true,
        data: {
          my_issues: myIssues ? myIssues.count : 0,
          open_issues: openIssues ? openIssues.count : 0,
          in_progress: inProgressIssues ? inProgressIssues.count : 0,
          resolved: resolvedIssues ? resolvedIssues.count : 0
        }
      });
    }

    // System-wide Admin stats
    const totalUsers = queryOne('SELECT COUNT(*) as count FROM USER');
    const activeUsers = queryOne('SELECT COUNT(DISTINCT user_id) as count FROM (SELECT reported_by as user_id FROM ISSUE UNION SELECT user_id FROM COMMENT)');
    const totalIssues = queryOne('SELECT COUNT(*) as count FROM ISSUE');
    const resolvedIssues = queryOne('SELECT COUNT(*) as count FROM ISSUE WHERE status_id = 3');
    const openIssues = queryOne('SELECT COUNT(*) as count FROM ISSUE WHERE status_id = 1');
    const inProgressIssues = queryOne('SELECT COUNT(*) as count FROM ISSUE WHERE status_id = 2');
    const highPriorityIssues = queryOne('SELECT COUNT(*) as count FROM ISSUE WHERE priority_id >= 3');
    const aiAssistedIssues = queryOne("SELECT COUNT(*) as count FROM ISSUE WHERE ai_attempts > 0 OR ai_status != 'Not Requested'");

    // AI Solutions Summary metrics
    const totalAiAnalyses = queryOne('SELECT SUM(COALESCE(ai_attempts, 0)) as count FROM ISSUE');
    const successfullyResolvedAi = queryOne("SELECT COUNT(*) as count FROM ISSUE WHERE ai_status = 'Solved'");
    const multipleAttemptsAi = queryOne('SELECT COUNT(*) as count FROM ISSUE WHERE ai_attempts > 1');
    const unresolvedAi = queryOne('SELECT COUNT(*) as count FROM ISSUE WHERE ai_attempts > 0 AND status_id != 3');

    const categoryBreakdown = queryAll(`
      SELECT category, COUNT(issue_id) as count
      FROM ISSUE
      GROUP BY category
    `);

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

    return res.json({
      success: true,
      data: {
        users_total: totalUsers ? totalUsers.count : 0,
        users_active: activeUsers ? activeUsers.count : 0,
        issues_total: totalIssues ? totalIssues.count : 0,
        issues_resolved: resolvedIssues ? resolvedIssues.count : 0,
        issues_open: openIssues ? openIssues.count : 0,
        issues_in_progress: inProgressIssues ? inProgressIssues.count : 0,
        issues_high_priority: highPriorityIssues ? highPriorityIssues.count : 0,
        issues_ai_assisted: aiAssistedIssues ? aiAssistedIssues.count : 0,
        
        // AI Solutions Page Metrics
        ai_total_analyses: totalAiAnalyses && totalAiAnalyses.count ? totalAiAnalyses.count : (aiAssistedIssues ? aiAssistedIssues.count : 0),
        ai_assisted_issues: aiAssistedIssues ? aiAssistedIssues.count : 0,
        ai_successfully_resolved: successfullyResolvedAi ? successfullyResolvedAi.count : 0,
        ai_multiple_attempts: multipleAttemptsAi ? multipleAttemptsAi.count : 0,
        ai_unresolved: unresolvedAi ? unresolvedAi.count : 0,

        category_breakdown: categoryBreakdown,
        priority_breakdown: priorityBreakdown,
        status_breakdown: statusBreakdown
      }
    });
  } catch (err) {
    console.error('[Stats Error]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
