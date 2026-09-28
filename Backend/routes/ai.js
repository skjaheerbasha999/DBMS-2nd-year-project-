const express = require('express');
const router = express.Router();
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

// 1. POST /api/ai/analyze-issue
router.post('/analyze-issue', async (req, res) => {
  const { title, description, projectName, assignedTo, priority, status, dueDate, comments } = req.body;

  if (!title) {
    return res.status(400).json({ success: false, message: 'Issue title is required.' });
  }

  const commentsText = Array.isArray(comments) && comments.length > 0
    ? comments.map(c => `- ${c.user_name || c.userName || 'User'}: ${c.comment_text || c.commentText || c}`).join('\n')
    : 'No comments yet.';

  const promptText = `
You are an expert AI software debugging assistant for TrackFlow.
Analyze the following issue details:

- Title: "${title}"
- Description: "${description || 'No description provided'}"
- Project: "${projectName || 'General'}"
- Assigned To: "${assignedTo || 'Unassigned'}"
- Priority: "${priority || 'Medium'}"
- Current Status: "${status || 'Open'}"
- Due Date: "${dueDate || 'Unspecified'}"
- Comments / History:
${commentsText}

Task: Provide an issue analysis in strict JSON format matching this structure:
{
  "category": "Bug",
  "suggestedPriority": "High",
  "possibleCause": "The application may be failing because of invalid database input or an API connection problem.",
  "troubleshootingSteps": [
    "1. Check the API response.",
    "2. Verify the database connection.",
    "3. Check server-side error logs."
  ],
  "shortSummary": "A short summary of the issue."
}

Do not include any code fences or extra text, only output valid JSON.
`;

  try {
    const rawText = await callGeminiAPI(promptText);
    const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return res.json({ success: true, analysis: parsed });
  } catch (err) {
    console.error('[AI Analyze Error]', err.message);

    // Smart contextual fallback analysis if API quota/network is unreachable
    const fallback = generateFallbackAnalysis({ title, description, priority });
    return res.json({ success: true, analysis: fallback, fallbackUsed: true });
  }
});

// 2. POST /api/ai/summarize-issue
router.post('/summarize-issue', async (req, res) => {
  const { title, description, comments } = req.body;

  if (!title) {
    return res.status(400).json({ success: false, message: 'Issue title is required.' });
  }

  const commentsText = Array.isArray(comments) && comments.length > 0
    ? comments.map(c => `${c.user_name || c.userName || 'User'}: ${c.comment_text || c.commentText || c}`).join('\n')
    : 'No discussion comments recorded.';

  const promptText = `
You are an AI issue tracker summarizer for TrackFlow.
Summarize the following software issue description and its comment history:

- Issue Title: "${title}"
- Description: "${description || 'None'}"
- Comments & History:
${commentsText}

Provide a short, clear, 2-4 sentence executive summary of the issue state and discussion history.
Return plain concise text without markdown headers.
`;

  try {
    const rawText = await callGeminiAPI(promptText);
    const summary = rawText.trim();
    return res.json({ success: true, summary });
  } catch (err) {
    console.error('[AI Summarize Issue Error]', err.message);
    const fallbackSummary = `Issue "${title}" is currently logged. ${description ? 'Description: ' + description.slice(0, 120) + '...' : ''} ${commentsText.length > 20 ? 'Active discussion recorded.' : 'Awaiting developer resolution.'}`;
    return res.json({ success: true, summary: fallbackSummary, fallbackUsed: true });
  }
});

// 3. POST /api/ai/summarize-project
router.post('/summarize-project', async (req, res) => {
  const { projectName, description, status, startDate, deadline, totalIssues, openIssues, resolvedIssues, highPriorityIssues } = req.body;

  if (!projectName) {
    return res.status(400).json({ success: false, message: 'Project name is required.' });
  }

  const promptText = `
You are an AI project manager assistant for TrackFlow.
Summarize the current status and metrics of the following software project:

- Project Name: "${projectName}"
- Description: "${description || 'None'}"
- Status: "${status || 'Active'}"
- Start Date: "${startDate || 'N/A'}"
- Deadline: "${deadline || 'N/A'}"
- Total Issues: ${totalIssues || 0}
- Open Issues: ${openIssues || 0}
- Resolved Issues: ${resolvedIssues || 0}
- High-Priority Issues: ${highPriorityIssues || 0}

Keep the output short, clean, and useful. Summarize project info, issue counts, open/resolved status, and priority status in concise format.
`;

  try {
    const rawText = await callGeminiAPI(promptText);
    return res.json({ success: true, summary: rawText.trim() });
  } catch (err) {
    console.error('[AI Summarize Project Error]', err.message);
    const fallback = `Project "${projectName}" (${status}) has ${totalIssues || 0} total issues (${openIssues || 0} open, ${resolvedIssues || 0} resolved, ${highPriorityIssues || 0} high priority). Target deadline is ${deadline || 'N/A'}. overall issue resolution is progressing.`;
    return res.json({ success: true, summary: fallback, fallbackUsed: true });
  }
});

// Legacy / Generic solve-issue endpoint for backward compatibility
router.post('/solve-issue', async (req, res) => {
  const { title, description, projectName, assignedTo, priority, status, dueDate, comments } = req.body;
  const promptText = `
Analyze the following software issue ticket:
- Title: "${title}"
- Description: "${description || 'None'}"
- Project: "${projectName || 'General'}"
- Priority: "${priority || 'Medium'}"

Respond in JSON with:
{
  "problemUnderstanding": "Clear explanation of issue.",
  "rootCauseAnalysis": "Likely root cause.",
  "recommendedSolution": "Recommended solution.",
  "stepByStepFix": ["Step 1", "Step 2"],
  "exampleCodeFix": "Example fix",
  "verification": "Verification steps",
  "prevention": "Prevention advice"
}
`;
  try {
    const rawText = await callGeminiAPI(promptText);
    const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return res.json({ success: true, aiAnalysis: parsed });
  } catch (err) {
    return res.json({
      success: true,
      aiAnalysis: {
        problemUnderstanding: `Issue "${title}" requires system evaluation.`,
        rootCauseAnalysis: "Check backend server logs and database connections.",
        recommendedSolution: "Verify error trace and parameters.",
        stepByStepFix: ["1. Inspect error log", "2. Test API endpoint"],
        exampleCodeFix: "// Verify backend handlers\nconsole.log(err);",
        verification: "Re-run QA test suite.",
        prevention: "Add strict error logging."
      }
    });
  }
});

function generateFallbackAnalysis({ title, description, priority }) {
  const t = title.toLowerCase();
  let category = 'Bug';
  let suggestedPriority = priority || 'Medium';

  if (t.includes('memory') || t.includes('database') || t.includes('sql') || t.includes('index') || t.includes('fk')) {
    category = 'Database';
    suggestedPriority = 'High';
  } else if (t.includes('api') || t.includes('oauth') || t.includes('token') || t.includes('auth') || t.includes('webhook')) {
    category = 'API Connection';
    suggestedPriority = 'High';
  } else if (t.includes('ui') || t.includes('render') || t.includes('css')) {
    category = 'Frontend UI';
    suggestedPriority = 'Low';
  }

  return {
    category,
    suggestedPriority,
    possibleCause: 'The application may be failing because of invalid database input or an API connection problem.',
    troubleshootingSteps: [
      '1. Check the API response.',
      '2. Verify the database connection.',
      '3. Check server-side error logs.'
    ],
    shortSummary: `AI evaluation for "${title}": Verify connection headers and database integrity.`
  };
}

module.exports = router;
