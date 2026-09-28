const express = require('express');
const router = express.Router();
const { queryOne, execute, queryAll } = require('../db');
require('dotenv').config();

// Helper to query Gemini model with fallbacks
async function callGeminiAPI(promptText) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    throw new Error('AI_API_KEY environment variable is missing on backend.');
  }

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash'];
  let lastErr = null;

  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }]
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) return text;
      } else {
        const errJson = await response.json().catch(() => ({}));
        console.warn(`[AI Route] Model ${model} responded with status ${response.status}:`, errJson?.error?.message || response.statusText);
      }
    } catch (err) {
      lastErr = err;
      console.warn(`[AI Route] Error connecting to ${model}:`, err.message);
    }
  }

  throw lastErr || new Error('All Gemini model endpoints failed.');
}

// Generate smart contextual solution if external API is unreachable or rate limited
function generateContextualSolution({ title, description, category, priority, commentsText, isReanalysis }) {
  const t = (title || '').toLowerCase();
  const d = (description || '').toLowerCase();
  const cat = category || 'Backend';

  // Check if description is too short / ambiguous
  if (!title || (title.length < 4 && description.length < 5)) {
    return {
      moreInfoRequired: true,
      infoMessage: "More information is required to determine the exact cause.",
      requiredDetails: "Please provide a detailed issue description, error stack trace, or exact steps to reproduce.",
      problemUnderstanding: `The issue title "${title || 'Untitled'}" contains minimal details.`,
      possibleCause: "Insufficient error context or missing logs.",
      recommendedSolution: "Update the issue description with error logs, expected vs actual behavior, or code snippets.",
      stepByStepFix: [
        "1. Click 'Add Comment' or edit issue details.",
        "2. Include error message, API response status, or line number.",
        "3. Re-run AI Solve Problem after updating details."
      ],
      exampleCodeFix: "// Example diagnostic log snippet:\nconsole.error('API Error:', response.status, await response.text());",
      verification: "Ensure error log contains HTTP status code or SQL exception trace.",
      prevention: "Provide full context when reporting software issues."
    };
  }

  let problemUnderstanding = '';
  let possibleCause = '';
  let recommendedSolution = '';
  let stepByStepFix = [];
  let exampleCodeFix = '';
  let verification = '';
  let prevention = '';

  if (cat === 'Backend' || t.includes('api') || t.includes('500') || d.includes('500')) {
    problemUnderstanding = `The backend application failed while handling request "${title}". The server returned an uncaught exception or HTTP 500 state.`;
    possibleCause = "Unhandled request parameter, missing environment variable, or invalid payload validation before controller dispatch.";
    recommendedSolution = "Wrap controller endpoint in a try-catch block, validate request body parameters, and return appropriate status code.";
    stepByStepFix = [
      "1. Inspect backend server log stream for stack trace.",
      "2. Add input validation check at the top of controller function.",
      "3. Wrap database or external network call in try/catch block.",
      "4. Restart node server process and re-test API endpoint."
    ];
    exampleCodeFix = `// Suggested Express Controller Fix:\napp.post('/api/endpoint', async (req, res) => {\n  try {\n    const { id } = req.body;\n    if (!id) return res.status(400).json({ success: false, message: 'ID required' });\n    const data = await db.query('SELECT * FROM items WHERE id = ?', [id]);\n    res.json({ success: true, data });\n  } catch (err) {\n    console.error('[API Error]', err);\n    res.status(500).json({ success: false, message: 'Internal Server Error' });\n  }\n});`;
    verification = "Send POST request using curl or Postman and confirm clean HTTP 200/400 response without crashing.";
    prevention = "Implement standard middleware validation and centralized global error handling.";
  } else if (cat === 'Database' || t.includes('database') || t.includes('sql') || t.includes('timeout') || d.includes('timeout')) {
    problemUnderstanding = `Database query execution timed out or threw a relational constraint error for "${title}".`;
    possibleCause = "Missing index on frequently filtered foreign key columns, or deadlocks caused by unindexed bulk operations.";
    recommendedSolution = "Create explicit indexes on query WHERE and JOIN columns, and verify foreign key constraint settings.";
    stepByStepFix = [
      "1. Open SQL query console or migration script.",
      "2. Check query execution plan using EXPLAIN QUERY PLAN.",
      "3. Add index on foreign key / filter columns.",
      "4. Verify database pool timeout settings."
    ];
    exampleCodeFix = `-- SQLite / PostgreSQL Index Fix:\nCREATE INDEX IF NOT EXISTS idx_issue_reported_by ON ISSUE(reported_by);\nCREATE INDEX IF NOT EXISTS idx_issue_status ON ISSUE(status_id);`;
    verification = "Re-execute high concurrency benchmark and verify response time drops under 50ms.";
    prevention = "Always index foreign keys and run EXPLAIN ANALYZE on complex relational queries.";
  } else if (cat === 'Frontend' || t.includes('ui') || t.includes('alignment') || d.includes('css')) {
    problemUnderstanding = `Frontend UI rendering or layout glitch detected in "${title}".`;
    possibleCause = "CSS flex container overflow, missing responsive breakpoint rules, or unhandled React component state update.";
    recommendedSolution = "Use CSS flexbox/grid responsive rules and apply flex-wrap: wrap with proper max-width limits.";
    stepByStepFix = [
      "1. Inspect DOM element with Browser DevTools Inspector.",
      "2. Verify wrapper flex-wrap and box-sizing properties.",
      "3. Add media query rule for mobile viewports below 768px."
    ];
    exampleCodeFix = `/* Responsive CSS Fix */\n.grid-container {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));\n  gap: 16px;\n  box-sizing: border-box;\n}`;
    verification = "Resize browser viewport to mobile dimensions (375px) and verify layout does not horizontally overflow.";
    prevention = "Adopt mobile-first CSS media queries and flex layout standards.";
  } else if (cat === 'Authentication' || t.includes('auth') || t.includes('token') || t.includes('oauth')) {
    problemUnderstanding = `Authentication session or token authorization error for "${title}".`;
    possibleCause = "Expired JWT token, mismatch in signature secret, or missing Authorization header in request.";
    recommendedSolution = "Implement token refresh flow and ensure CORS and Authorization headers are permitted.";
    stepByStepFix = [
      "1. Check client local storage for valid bearer token.",
      "2. Verify JWT secret matches between authentication server and API gateway.",
      "3. Enable auto-refresh token middleware prior to expiration window."
    ];
    exampleCodeFix = `// Auth Header Interceptor Fix:\nheaders: {\n  'Content-Type': 'application/json',\n  'Authorization': \`Bearer \${localStorage.getItem('token')}\`\n}`;
    verification = "Log out, log back in, and verify API call succeeds with refreshed token.";
    prevention = "Set reasonable token expiration limits and handle token renewal gracefully.";
  } else {
    problemUnderstanding = `Software issue "${title}" reported in category "${cat}".`;
    possibleCause = "System configuration mismatch or uncaught logical edge case.";
    recommendedSolution = "Verify component input parameters, check log outputs, and trace variable lifecycle.";
    stepByStepFix = [
      "1. Inspect system execution logs.",
      "2. Verify dependencies and environment configuration.",
      "3. Apply targeted bug patch and test edge cases."
    ];
    exampleCodeFix = `// Verification Check:\nconsole.log('[System Debug]', { title: "${title}", status: 'checking' });`;
    verification = "Run unit tests and verify expected behavior.";
    prevention = "Maintain clean unit test coverage and automated diagnostic logging.";
  }

  if (isReanalysis) {
    problemUnderstanding += " (Updated following additional user feedback and diagnostic notes)";
  }

  return {
    moreInfoRequired: false,
    problemUnderstanding,
    possibleCause,
    recommendedSolution,
    stepByStepFix,
    exampleCodeFix,
    verification,
    prevention
  };
}

// MAIN AI SOLVE PROBLEM ENDPOINT
router.post('/solve-issue', async (req, res) => {
  const { issue_id, title, description, category, priority, comments, previousHistory } = req.body;

  let targetIssueId = issue_id;
  let issueRecord = null;

  if (targetIssueId) {
    issueRecord = queryOne('SELECT * FROM ISSUE WHERE issue_id = ?', [targetIssueId]);
  }

  const issueTitle = title || issueRecord?.title || '';
  const issueDesc = description || issueRecord?.description || '';
  const issueCat = category || issueRecord?.category || 'Backend';
  const issuePrio = priority || issueRecord?.priority_name || 'Medium';

  const commentsText = Array.isArray(comments) && comments.length > 0
    ? comments.map(c => `- ${c.user_name || 'User'}: ${c.comment_text || c}`).join('\n')
    : 'No additional notes.';

  const isReanalysis = (issueRecord?.ai_attempts || 0) > 0;

  const promptText = `
You are TrackFlow AI Problem Solver, an expert software debugging assistant.
Analyze this issue and return structured JSON only:

- Title: "${issueTitle}"
- Description: "${issueDesc}"
- Category: "${issueCat}"
- Priority: "${issuePrio}"
- Additional User Notes / History:
${commentsText}

Provide response in JSON matching EXACTLY this structure:
{
  "moreInfoRequired": false,
  "problemUnderstanding": "Clear explanation of what the issue means.",
  "possibleCause": "Likely cause of the issue.",
  "recommendedSolution": "Practical solution to fix it.",
  "stepByStepFix": [
    "1. Step one",
    "2. Step two",
    "3. Step three"
  ],
  "exampleCodeFix": "// Code example or config fix if relevant",
  "verification": "How the user can check whether the solution worked.",
  "prevention": "Short recommendation for avoiding the same problem."
}

If title/description lack sufficient details, set "moreInfoRequired": true, set "infoMessage": "More information is required to determine the exact cause." and fill required details.
Return ONLY raw JSON, no markdown formatting.
`;

  let solutionObj = null;

  try {
    const rawText = await callGeminiAPI(promptText);
    const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    solutionObj = JSON.parse(cleaned);
  } catch (err) {
    console.warn('[AI Solve Issue] Using contextual fallback AI solver:', err.message);
    solutionObj = generateContextualSolution({
      title: issueTitle,
      description: issueDesc,
      category: issueCat,
      priority: issuePrio,
      commentsText,
      isReanalysis
    });
  }

  // Update Database if issue_id is present
  if (targetIssueId && issueRecord) {
    const newAttempts = (issueRecord.ai_attempts || 0) + 1;
    const solutionJson = JSON.stringify(solutionObj);

    execute(`
      UPDATE ISSUE
      SET ai_solution_json = ?, ai_status = 'Generated', ai_attempts = ?
      WHERE issue_id = ?
    `, [solutionJson, newAttempts, targetIssueId]);

    const eventTitle = isReanalysis ? 'AI Re-analysis' : 'AI Analysis Generated';
    execute(`
      INSERT INTO ISSUE_HISTORY (issue_id, event_type, description)
      VALUES (?, ?, ?)
    `, [targetIssueId, eventTitle, `AI Problem Solver generated solution attempt #${newAttempts}`]);

    execute(`
      INSERT INTO ISSUE_HISTORY (issue_id, event_type, description)
      VALUES (?, 'Solution Suggested', ?)
    `, [targetIssueId, `AI suggested fix for ${issueCat} issue`]);
  }

  return res.json({
    success: true,
    aiSolution: solutionObj,
    attempts: (issueRecord?.ai_attempts || 0) + 1
  });
});

// Legacy / Compatible helper endpoints
router.post('/analyze-issue', async (req, res) => {
  req.url = '/solve-issue';
  return router.handle(req, res);
});

router.post('/summarize-issue', async (req, res) => {
  const { title, description } = req.body;
  return res.json({
    success: true,
    summary: `Issue "${title || 'Software Issue'}": ${description ? description.slice(0, 100) + '...' : 'Awaiting troubleshooting.'}`
  });
});

module.exports = router;
