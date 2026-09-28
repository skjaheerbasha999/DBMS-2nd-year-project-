const express = require('express');
const router = express.Router();
const { queryOne, queryAll } = require('../db');

// GET /api/stats/summary - Global KPIs for User & Admin Dashboards
router.get('/summary', async (req, res) => {
  const { user_id } = req.query;

  try {
    if (user_id) {
      // User-specific stats
      const myIssues = await queryOne('SELECT COUNT(*) as count FROM "ISSUE" WHERE reported_by = ?', [user_id]);
      const openIssues = await queryOne('SELECT COUNT(*) as count FROM "ISSUE" WHERE reported_by = ? AND status_id = 1', [user_id]);
      const inProgressIssues = await queryOne('SELECT COUNT(*) as count FROM "ISSUE" WHERE reported_by = ? AND status_id = 2', [user_id]);
      const resolvedIssues = await queryOne('SELECT COUNT(*) as count FROM "ISSUE" WHERE reported_by = ? AND status_id = 3', [user_id]);

      return res.json({
        success: true,
        data: {
          my_issues: myIssues ? parseInt(myIssues.count) : 0,
          open_issues: openIssues ? parseInt(openIssues.count) : 0,
          in_progress: inProgressIssues ? parseInt(inProgressIssues.count) : 0,
          resolved: resolvedIssues ? parseInt(resolvedIssues.count) : 0
        }
      });
    }

    // System-wide Admin stats
    const totalUsers = await queryOne('SELECT COUNT(*) as count FROM "USER"');
    const activeUsers = await queryOne('SELECT COUNT(DISTINCT user_id) as count FROM (SELECT reported_by as user_id FROM "ISSUE" UNION SELECT user_id FROM "COMMENT") u_sub');
    const totalIssues = await queryOne('SELECT COUNT(*) as count FROM "ISSUE"');
    const resolvedIssues = await queryOne('SELECT COUNT(*) as count FROM "ISSUE" WHERE status_id = 3');
    const openIssues = await queryOne('SELECT COUNT(*) as count FROM "ISSUE" WHERE status_id = 1');
    const inProgressIssues = await queryOne('SELECT COUNT(*) as count FROM "ISSUE" WHERE status_id = 2');
    const highPriorityIssues = await queryOne('SELECT COUNT(*) as count FROM "ISSUE" WHERE priority_id >= 3');
    const aiAssistedIssues = await queryOne("SELECT COUNT(*) as count FROM \"ISSUE\" WHERE ai_attempts > 0 OR ai_status != 'Not Requested'");

    // AI Solutions Summary metrics
    const totalAiAnalyses = await queryOne('SELECT SUM(COALESCE(ai_attempts, 0)) as count FROM "ISSUE"');
    const successfullyResolvedAi = await queryOne("SELECT COUNT(*) as count FROM \"ISSUE\" WHERE ai_status = 'Solved'");
    const multipleAttemptsAi = await queryOne('SELECT COUNT(*) as count FROM "ISSUE" WHERE ai_attempts > 1');
    const unresolvedAi = await queryOne('SELECT COUNT(*) as count FROM "ISSUE" WHERE ai_attempts > 0 AND status_id != 3');

    const categoryBreakdown = await queryAll(`
      SELECT category, COUNT(issue_id) as count
      FROM "ISSUE"
      GROUP BY category
    `);

    const priorityBreakdown = await queryAll(`
      SELECT pri.priority_name, COUNT(i.issue_id) as count
      FROM "PRIORITY" pri
      LEFT JOIN "ISSUE" i ON pri.priority_id = i.priority_id
      GROUP BY pri.priority_id, pri.priority_name
    `);

    const statusBreakdown = await queryAll(`
      SELECT st.status_name, COUNT(i.issue_id) as count
      FROM "STATUS" st
      LEFT JOIN "ISSUE" i ON st.status_id = i.status_id
      GROUP BY st.status_id, st.status_name
    `);

    return res.json({
      success: true,
      data: {
        users_total: totalUsers ? parseInt(totalUsers.count) : 0,
        users_active: activeUsers ? parseInt(activeUsers.count) : 0,
        issues_total: totalIssues ? parseInt(totalIssues.count) : 0,
        issues_resolved: resolvedIssues ? parseInt(resolvedIssues.count) : 0,
        issues_open: openIssues ? parseInt(openIssues.count) : 0,
        issues_in_progress: inProgressIssues ? parseInt(inProgressIssues.count) : 0,
        issues_high_priority: highPriorityIssues ? parseInt(highPriorityIssues.count) : 0,
        issues_ai_assisted: aiAssistedIssues ? parseInt(aiAssistedIssues.count) : 0,
        
        // AI Solutions Page Metrics
        ai_total_analyses: totalAiAnalyses && totalAiAnalyses.count ? parseInt(totalAiAnalyses.count) : (aiAssistedIssues ? parseInt(aiAssistedIssues.count) : 0),
        ai_assisted_issues: aiAssistedIssues ? parseInt(aiAssistedIssues.count) : 0,
        ai_successfully_resolved: successfullyResolvedAi ? parseInt(successfullyResolvedAi.count) : 0,
        ai_multiple_attempts: multipleAttemptsAi ? parseInt(multipleAttemptsAi.count) : 0,
        ai_unresolved: unresolvedAi ? parseInt(unresolvedAi.count) : 0,

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
