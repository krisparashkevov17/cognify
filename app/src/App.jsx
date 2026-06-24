import React, { useState, useEffect, useCallback } from 'react';

// ─── EXTRACTION PROMPT CONSTANT ────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are a cognitive analysis engine. Given a conversation transcript, extract:
1. Critical thinking score (0-100): How much the user challenges, questions, and evaluates claims
2. Depth score (0-100): How deeply the user engages with topics
3. Engagement score (0-100): How actively the user participates in the conversation
4. Flagged claims: List of significant claims made, each with risk level (high/medium/low) and a category tag
5. Topics: Main subjects discussed
6. Engagement signals: Behavioral patterns observed
7. Summary: 2-3 sentence narrative of the cognitive patterns observed

Return strict JSON matching the schema:
{
  "scores": { "criticalThinking": number, "depth": number, "engagement": number },
  "claims": [{ "text": string, "risk": "high"|"medium"|"low", "tag": string }],
  "topics": string[],
  "engagementSignals": string[],
  "summary": string
}`;

// ─── DEMO CONTENT ─────────────────────────────────────────────────────────

const DEMO_CONVERSATION = [
  "User: I've been reading that AI tools like ChatGPT are basically making us all smarter. Everyone's productivity is through the roof.",
  "",
  "Assistant: There are certainly productivity gains documented with AI tools, though the research is nuanced. Some studies show efficiency improvements, while others raise concerns about skill atrophy in certain domains.",
  "",
  "User: Yeah I saw that too. Plus I read that taking vitamin D supplements can cure depression — my friend switched and says she feels way better.",
  "",
  "Assistant: The relationship between vitamin D and mood is complex. Some studies show correlations with mood disorders in deficiency cases, but 'cure' is a strong claim. Clinical depression typically requires professional diagnosis and treatment.",
  "",
  "User: Makes sense. But I think the AI productivity thing is definitely true — I mean look at how much faster people are coding now. The data speaks for itself.",
  "",
  "Assistant: Productivity data in software development does show acceleration for certain tasks. Though it's worth noting the variance — AI excels at boilerplate but struggles with novel architectural decisions.",
  "",
  "User: Interesting. And what about the 5G conspiracy stuff — I know that's fake but my neighbor keeps sending me articles. How do I push back effectively?",
  "",
  "Assistant: Great instinct to question it. The 5G conspiracy claims lack peer-reviewed support and contradict established physics. You can point to specific frequency ranges and their interaction with biological tissue — the energy levels are far too low for the claimed effects.",
  "",
  "User: Okay that's helpful. I'm going to look into the productivity research more — what metrics actually matter when evaluating these claims?"
].join("\n");

const DEMO_SESSIONS_SEED = [
  {
    id: 'seed-1',
    timestamp: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
    conversation: 'Discussion about nutrition myths and diet trends.',
    scores: { criticalThinking: 42, depth: 55, engagement: 71 },
    claims: [
      { text: 'Cutting carbs completely leads to faster weight loss', risk: 'high', tag: 'nutrition' },
      { text: 'Intermittent fasting has no downsides for everyone', risk: 'medium', tag: 'health' },
    ],
    topics: ['nutrition', 'diet', 'health'],
    engagementSignals: ['accepts health claims without verification', 'enthusiastic tone', 'no source requests'],
    summary: 'User shows high engagement with nutrition topics but accepts health claims with minimal skepticism. No requests for evidence or citations observed.',
  },
  {
    id: 'seed-2',
    timestamp: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    conversation: 'Discussion about AI productivity tools and automation trends.',
    scores: { criticalThinking: 58, depth: 67, engagement: 83 },
    claims: [
      { text: 'AI will replace 80% of jobs within 5 years', risk: 'high', tag: 'AI/future' },
      { text: 'Automation always increases net efficiency', risk: 'medium', tag: 'productivity' },
    ],
    topics: ['AI', 'productivity', 'automation', 'jobs'],
    engagementSignals: ['asks clarifying questions', 'references external sources', 'challenges one claim'],
    summary: 'Improving critical engagement with AI topics. User begins to probe assumptions but still accepts some sweeping generalisations without pushback.',
  },
  {
    id: 'seed-3',
    timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    conversation: 'Discussion about health supplements and wellness trends.',
    scores: { criticalThinking: 51, depth: 61, engagement: 78 },
    claims: [
      { text: 'Natural supplements are always safer than pharmaceuticals', risk: 'high', tag: 'health' },
      { text: 'Natural remedies have no significant side effects', risk: 'high', tag: 'health' },
    ],
    topics: ['health', 'supplements', 'wellness', 'nutrition'],
    engagementSignals: ['asks for sources occasionally', 'expresses skepticism of one claim', 'accepts health generalisations'],
    summary: 'Continued pattern of low skepticism toward health and supplement claims. Slight improvement in questioning wellness generalisations versus prior session.',
  },
];

// ─── MOCK ANALYSIS ADAPTER ─────────────────────────────────────────────────
// NOTE: Replace runMockAnalysis with a real API call to use EXTRACTION_PROMPT
// against the Anthropic API. The result schema is identical.

function runMockAnalysis(conversation) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const wordCount = conversation.split(/\s+/).length;
      const questionCount = (conversation.match(/\?/g) || []).length;
      const criticalThinking = Math.min(95, 45 + questionCount * 4 + (wordCount > 200 ? 12 : 0));
      const depth = Math.min(95, 50 + (wordCount > 300 ? 15 : 5) + questionCount * 2);
      const engagement = Math.min(95, 62 + (wordCount > 150 ? 14 : 0));

      resolve({
        scores: { criticalThinking, depth, engagement },
        claims: [
          { text: 'AI tools are making everyone smarter and more productive', risk: 'medium', tag: 'AI/productivity' },
          { text: 'Vitamin D supplements can cure depression', risk: 'high', tag: 'health' },
          { text: 'The productivity data speaks for itself', risk: 'medium', tag: 'reasoning' },
          { text: '5G conspiracy claims lack scientific basis', risk: 'low', tag: 'science' },
        ],
        topics: ['AI', 'productivity', 'health', 'supplements', 'skepticism', '5G'],
        engagementSignals: [
          'Asks clarifying follow-up questions (strong signal)',
          'Seeks explanation of mechanisms',
          'Low skepticism toward health supplement claims',
          'Accepts productivity claims without requesting evidence',
          'Appropriately doubts conspiracy content',
          'Ends by requesting evaluative framework (positive)',
        ],
        summary: 'User demonstrates strong engagement with AI and productivity topics, forming well-structured questions. A recurring pattern of reduced critical scrutiny appears specifically around health and nutrition claims — these are accepted at face value without requesting evidence or qualification. Skepticism toward fringe science content is appropriately calibrated, and the session closes with a notably metacognitive request for evaluation criteria.',
      });
    }, 1300);
  });
}

// ─── STORAGE WRAPPER ──────────────────────────────────────────────────────

let _memStore = {};
let _storageUnavailable = false;

function getStore() {
  if (typeof window !== 'undefined' && window.storage && typeof window.storage.getItem === 'function') {
    return window.storage;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem('__cognify_test__', '1');
      window.localStorage.removeItem('__cognify_test__');
      return window.localStorage;
    } catch {
      // fall through to in-memory
    }
  }
  _storageUnavailable = true;
  return {
    getItem: (k) => _memStore[k] ?? null,
    setItem: (k, v) => { _memStore[k] = v; },
    removeItem: (k) => { delete _memStore[k]; },
  };
}

function storageGet(key) {
  try {
    const val = getStore().getItem(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    getStore().setItem(key, JSON.stringify(value));
  } catch {
    // silent
  }
}

// ─── PROFILE AGGREGATION ─────────────────────────────────────────────────

function aggregateProfile(sessions) {
  if (!sessions || !sessions.length) return null;

  const topicFrequency = {};
  let totalCT = 0;
  let totalDepth = 0;
  const trend = [];
  const allClaims = [];
  let totalOffload = 0;
  let offloadCount = 0;

  for (const s of sessions) {
    for (const t of (s.topics || [])) {
      topicFrequency[t] = (topicFrequency[t] || 0) + 1;
    }
    totalCT += s.scores.criticalThinking;
    totalDepth += s.scores.depth;
    trend.push({
      date: new Date(s.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      criticalThinking: s.scores.criticalThinking,
      depth: s.scores.depth,
    });
    allClaims.push(...(s.claims || []));
    if (typeof s.offloadingRatio === 'number') {
      totalOffload += s.offloadingRatio;
      offloadCount += 1;
    }
  }

  const blindspotTags = allClaims.filter(c => c.risk === 'high').map(c => c.tag);
  const strengthTags = allClaims.filter(c => c.risk === 'low').map(c => c.tag);

  return {
    topicFrequency,
    avgCriticalThinking: Math.round(totalCT / sessions.length),
    avgDepth: Math.round(totalDepth / sessions.length),
    blindspots: [...new Set(blindspotTags)],
    strengths: [...new Set(strengthTags)],
    trend,
    sessionCount: sessions.length,
    avgOffloadingRatio: offloadCount ? Math.round(totalOffload / offloadCount) : null,
  };
}

// ─── FINGERPRINT GENERATION ──────────────────────────────────────────────

function generateFingerprint(profile) {
  if (!profile) return '';

  const topTopics = Object.entries(profile.topicFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);

  const ctLevel =
    profile.avgCriticalThinking >= 70 ? 'strong' :
    profile.avgCriticalThinking >= 50 ? 'moderate' : 'developing';

  const depthDesc = profile.avgDepth > 60 ? 'substantive' : 'surface-level';

  const blindspotText = profile.blindspots.length
    ? `You show a recurring pattern of reduced scrutiny around ${profile.blindspots.slice(0, 2).map(b => `"${b}"`).join(' and ')} claims`
    : 'No consistent blind spots have emerged yet';

  const strengthText = profile.strengths.length
    ? ` Your skepticism is well-calibrated toward ${profile.strengths.slice(0, 2).join(' and ')} content.`
    : '';

  const trend = profile.trend;
  const improving = trend.length >= 2 &&
    trend[trend.length - 1].criticalThinking > trend[0].criticalThinking;

  return [
    `You engage most deeply with ${topTopics.join(', ')} topics, where your critical thinking is most active and your questioning most structured.`,
    `Across ${profile.sessionCount} session${profile.sessionCount !== 1 ? 's' : ''}, your critical thinking registers as ${ctLevel} (avg ${profile.avgCriticalThinking}/100) with a depth score of ${profile.avgDepth}/100 — indicating ${depthDesc} exploration of ideas.`,
    `${blindspotText} — these are areas where epistemic vigilance may be worth consciously raising.${strengthText}`,
    improving
      ? 'Your critical thinking trend is improving over time — you are asking better, more precise questions with each session.'
      : 'Consistent engagement across sessions suggests stable cognitive habits.',
  ].join(' ');
}

// ─── COMPONENTS ──────────────────────────────────────────────────────────

function CircularScore({ value, label, color }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const filled = circ * (Math.min(100, Math.max(0, value)) / 100);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-24 h-24 flex items-center justify-center">
        <svg width="96" height="96" className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="48" cy="48" r={r} fill="none" stroke="#1f2937" strokeWidth="8" />
          <circle
            cx="48" cy="48" r={r}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={`${filled} ${circ - filled}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.9s ease' }}
          />
        </svg>
        <span className="relative z-10 text-2xl font-bold text-white">{value}</span>
      </div>
      <span className="text-xs text-gray-500 uppercase tracking-widest">{label}</span>
    </div>
  );
}

const RISK_CFG = {
  high:   { border: 'border-red-500/30',     bg: 'bg-red-500/8',     dot: 'bg-red-500',     badge: 'text-red-400',     label: 'HIGH RISK' },
  medium: { border: 'border-yellow-500/30',  bg: 'bg-yellow-500/8',  dot: 'bg-yellow-400',  badge: 'text-yellow-400',  label: 'MEDIUM'    },
  low:    { border: 'border-emerald-500/30', bg: 'bg-emerald-500/8', dot: 'bg-emerald-500', badge: 'text-emerald-400', label: 'VERIFIED'  },
};

function ClaimBadge({ claim }) {
  const cfg = RISK_CFG[claim.risk] || RISK_CFG.medium;
  return (
    <div className={`border ${cfg.border} rounded-lg p-3 flex items-start gap-3`}
         style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot} mt-1.5 flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200 leading-snug">{claim.text}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`text-xs font-mono font-semibold ${cfg.badge}`}>{cfg.label}</span>
          <span className="text-xs text-gray-600">#{claim.tag}</span>
        </div>
      </div>
    </div>
  );
}

function TrendChart({ trend }) {
  if (!trend || trend.length < 2) {
    return (
      <div className="h-36 flex items-center justify-center text-gray-600 text-sm">
        Need at least 2 sessions for trend
      </div>
    );
  }

  const W = 480;
  const H = 120;
  const PAD = { top: 10, right: 16, bottom: 24, left: 24 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const allVals = trend.flatMap(t => [t.criticalThinking, t.depth]);
  const minV = Math.max(0, Math.min(...allVals) - 10);
  const maxV = Math.min(100, Math.max(...allVals) + 10);

  const xAt = (i) => PAD.left + (i / (trend.length - 1)) * innerW;
  const yAt = (v) => PAD.top + innerH - ((v - minV) / (maxV - minV)) * innerH;

  const pathFor = (key) =>
    trend.map((t, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(t[key]).toFixed(1)}`).join(' ');

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: '140px' }}>
        {[25, 50, 75].map(v => (
          <line key={v}
            x1={PAD.left} x2={W - PAD.right}
            y1={yAt(v)} y2={yAt(v)}
            stroke="#1f2937" strokeWidth="1" strokeDasharray="4 4" />
        ))}
        {[25, 50, 75].map(v => (
          <text key={`l${v}`} x={PAD.left - 4} y={yAt(v) + 4}
            textAnchor="end" fill="#4b5563" fontSize="9">{v}</text>
        ))}
        <path d={pathFor('criticalThinking')} fill="none" stroke="#6366f1" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />
        <path d={pathFor('depth')} fill="none" stroke="#10b981" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />
        {trend.map((t, i) => (
          <React.Fragment key={i}>
            <circle cx={xAt(i)} cy={yAt(t.criticalThinking)} r="3.5" fill="#6366f1" />
            <circle cx={xAt(i)} cy={yAt(t.depth)} r="3.5" fill="#10b981" />
            <text x={xAt(i)} y={H - 4} textAnchor="middle" fill="#6b7280" fontSize="9">
              {t.date}
            </text>
          </React.Fragment>
        ))}
      </svg>
      <div className="flex gap-5 mt-1">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-4 h-0.5 bg-indigo-500 inline-block rounded" />
          Critical Thinking
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-4 h-0.5 bg-emerald-500 inline-block rounded" />
          Depth
        </span>
      </div>
    </div>
  );
}

function TopicMap({ topicFrequency }) {
  if (!topicFrequency || !Object.keys(topicFrequency).length) {
    return <p className="text-gray-600 text-sm">No topics yet.</p>;
  }
  const sorted = Object.entries(topicFrequency).sort((a, b) => b[1] - a[1]);
  const maxCount = sorted[0][1];

  const sizeClass = (count) => {
    const ratio = count / maxCount;
    if (ratio > 0.75) return 'text-sm px-3 py-1.5 bg-indigo-500/20 border-indigo-500/40 text-indigo-300';
    if (ratio > 0.4)  return 'text-xs px-2.5 py-1 bg-indigo-500/12 border-indigo-500/25 text-indigo-400';
    return 'text-xs px-2 py-1 bg-gray-800 border-gray-700 text-gray-500';
  };

  return (
    <div className="flex flex-wrap gap-2">
      {sorted.map(([topic, count]) => (
        <span key={topic}
          className={`border rounded-full font-mono ${sizeClass(count)} flex items-center gap-1`}>
          {topic}
          <span className="opacity-50 text-xs">{count}</span>
        </span>
      ))}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState('home');
  const [conversation, setConversation] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [storageWarn, setStorageWarn] = useState(false);

  // Load persisted sessions on mount
  useEffect(() => {
    const stored = storageGet('sessions');
    if (stored && Array.isArray(stored)) setSessions(stored);
    if (_storageUnavailable) setStorageWarn(true);
  }, []);

  const persistSession = useCallback((session) => {
    setSessions(prev => {
      const next = [...prev, session];
      storageSet('sessions', next);
      const profile = aggregateProfile(next);
      if (profile) {
        storageSet('profile', profile);
        storageSet('fingerprint', generateFingerprint(profile));
      }
      return next;
    });
  }, []);

  const handleImport = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const imported = Array.isArray(data) ? data : data.sessions;
        if (!Array.isArray(imported)) throw new Error('no sessions array');
        const valid = imported.every(s =>
          s && s.scores &&
          typeof s.scores.criticalThinking === 'number' &&
          typeof s.scores.depth === 'number');
        if (!valid) throw new Error('invalid session shape');
        setSessions(imported);
        storageSet('sessions', imported);
        setError(null);
      } catch {
        setError('Could not import profile — expected a Cognify profile.json file.');
      }
    };
    reader.readAsText(file);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!conversation.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const analysisResult = await runMockAnalysis(conversation);
      const session = {
        id: `session-${Date.now()}`,
        timestamp: new Date().toISOString(),
        conversation,
        scores: analysisResult.scores,
        claims: analysisResult.claims,
        topics: analysisResult.topics,
        engagementSignals: analysisResult.engagementSignals,
        summary: analysisResult.summary,
      };
      setResult(analysisResult);
      persistSession(session);
    } catch (err) {
      setError('Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [conversation, persistSession]);

  const handleDemo = useCallback(async () => {
    setConversation(DEMO_CONVERSATION);
    setLoading(true);
    setError(null);
    setResult(null);

    // Seed historical sessions
    const newSessions = [...DEMO_SESSIONS_SEED];
    storageSet('sessions', newSessions);
    setSessions(newSessions);

    try {
      const analysisResult = await runMockAnalysis(DEMO_CONVERSATION);
      const session = {
        id: `session-demo-${Date.now()}`,
        timestamp: new Date().toISOString(),
        conversation: DEMO_CONVERSATION,
        scores: analysisResult.scores,
        claims: analysisResult.claims,
        topics: analysisResult.topics,
        engagementSignals: analysisResult.engagementSignals,
        summary: analysisResult.summary,
      };
      const allSessions = [...newSessions, session];
      storageSet('sessions', allSessions);
      setSessions(allSessions);
      const profile = aggregateProfile(allSessions);
      if (profile) {
        storageSet('profile', profile);
        storageSet('fingerprint', generateFingerprint(profile));
      }
      setResult(analysisResult);
    } catch (err) {
      setError('Demo failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  const profile = aggregateProfile(sessions);
  const fingerprint = generateFingerprint(profile);

  const handleDemoFromHome = useCallback(async () => {
    setView('analyze');
    setTimeout(() => handleDemo(), 50);
  }, [handleDemo]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {storageWarn && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 text-xs text-yellow-400 text-center">
          Storage unavailable — session data is in-memory only and will not persist across reloads.
        </div>
      )}

      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between sticky top-0 bg-gray-950/90 backdrop-blur-sm z-50">
        <button onClick={() => setView('home')} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="2.5" fill="white" />
              <circle cx="7" cy="7" r="5.5" stroke="white" strokeWidth="1.2" fill="none" strokeDasharray="2 2" />
            </svg>
          </div>
          <span className="font-semibold text-white tracking-tight">Cognify</span>
        </button>

        <nav className="flex items-center gap-1">
          {['analyze', 'profile'].map(v => (
            <button key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-md text-sm capitalize transition-colors ${
                view === v
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}>
              {v}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* ── HOME VIEW ───────────────────────────────────────────── */}
        {view === 'home' && (
          <div>
            {/* Hero */}
            <div className="text-center pt-16 pb-20 relative">
              <div className="absolute inset-0 -z-10 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(99,102,241,0.15) 0%, transparent 70%)' }} />
              <div className="inline-flex items-center gap-2 border border-indigo-500/30 bg-indigo-500/10 rounded-full px-4 py-1.5 text-xs text-indigo-400 font-mono mb-8">
                cognitive fitness tracker
              </div>
              <h1 className="text-5xl sm:text-6xl font-black text-white leading-tight tracking-tight mb-6">
                Know how well<br />
                <span className="text-indigo-400">you think.</span>
              </h1>
              <p className="text-xl text-gray-400 max-w-xl mx-auto leading-relaxed mb-10">
                We built tools to track our steps. We built tools to track our sleep.<br />
                <strong className="text-gray-200">Nobody built a tool to track cognitive fitness.</strong>
              </p>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <button
                  onClick={handleDemoFromHome}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3 rounded-xl text-sm transition-colors">
                  Try Demo
                </button>
                <button
                  onClick={() => setView('analyze')}
                  className="border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white px-8 py-3 rounded-xl text-sm transition-colors">
                  Analyze a Conversation
                </button>
              </div>
            </div>

            {/* What we measure */}
            <div className="mb-16">
              <p className="text-xs text-gray-600 uppercase tracking-widest font-mono text-center mb-8">What Cognify measures</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { score: 69, label: 'Critical Thinking', color: '#6366f1', ringColor: '#6366f1', desc: 'How much you challenge and evaluate claims rather than accepting them at face value.' },
                  { score: 73, label: 'Depth', color: '#10b981', ringColor: '#10b981', desc: 'How substantively you explore topics — follow-up questions, nuance-seeking, mechanism-probing.' },
                  { score: 85, label: 'Engagement', color: '#f59e0b', ringColor: '#f59e0b', desc: 'How actively you participate — response quality, contribution, topic coverage.' },
                ].map(({ score, label, color, ringColor, desc }) => {
                  const r = 36, circ = 2 * Math.PI * r, filled = circ * (score / 100);
                  return (
                    <div key={label} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
                      <div className="relative w-24 h-24 mx-auto flex items-center justify-center mb-4">
                        <svg width="96" height="96" className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
                          <circle cx="48" cy="48" r={r} fill="none" stroke="#1f2937" strokeWidth="8" />
                          <circle cx="48" cy="48" r={r} fill="none" stroke={ringColor} strokeWidth="8"
                            strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round" />
                        </svg>
                        <span className="relative z-10 text-2xl font-black" style={{ color }}>{score}</span>
                      </div>
                      <h3 className="text-sm font-semibold text-white mb-2">{label}</h3>
                      <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* How it works */}
            <div className="mb-16">
              <p className="text-xs text-gray-600 uppercase tracking-widest font-mono text-center mb-8">How it works</p>
              <div className="relative">
                <div className="absolute left-5 top-8 bottom-8 w-px bg-gray-800 hidden sm:block" />
                <div className="space-y-4">
                  {[
                    { n: '01', title: 'Paste a conversation', body: 'Any conversation with an AI assistant — copy and paste the transcript into Cognify.' },
                    { n: '02', title: 'Get your cognitive scores', body: 'Cognify analyses your critical thinking, depth, and engagement. Flagged claims are colour-coded by risk level — high, medium, or verified.' },
                    { n: '03', title: 'Build your profile', body: 'Every session adds to your longitudinal profile. Blind spots emerge. A cognitive fingerprint — a plain-English narrative of your thinking habits — is generated over time.' },
                  ].map(({ n, title, body }) => (
                    <div key={n} className="flex items-start gap-5 bg-gray-900 border border-gray-800 rounded-2xl p-5">
                      <span className="text-xs font-mono font-bold text-indigo-500 bg-indigo-500/10 border border-indigo-500/20 rounded-lg w-10 h-10 flex items-center justify-center flex-shrink-0">{n}</span>
                      <div>
                        <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
                        <p className="text-sm text-gray-500 leading-relaxed">{body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Fingerprint preview */}
            <div className="mb-16 bg-gray-900 border border-indigo-500/20 rounded-2xl p-6">
              <p className="text-xs text-indigo-400 uppercase tracking-widest font-mono mb-4">Sample cognitive fingerprint</p>
              <p className="text-sm text-indigo-300/80 leading-relaxed italic">
                "You engage most deeply with <strong className="text-indigo-200">AI, productivity, and health</strong> topics, where your critical thinking is most active. You show a recurring pattern of reduced scrutiny around <strong className="text-red-400">health claims</strong> — these are areas where epistemic vigilance may be worth consciously raising. Your skepticism is well-calibrated toward <strong className="text-emerald-400">science content</strong>. Your critical thinking trend is <strong className="text-indigo-200">improving</strong> — you ask better questions with each session."
              </p>
            </div>

            {/* Claim example */}
            <div className="mb-16">
              <p className="text-xs text-gray-600 uppercase tracking-widest font-mono text-center mb-8">Claim risk detection</p>
              <div className="space-y-3">
                {[
                  { risk: 'high', color: 'red', border: 'border-red-500/30', bg: 'bg-red-500/5', dot: 'bg-red-500', badge: 'text-red-400', label: 'HIGH RISK', text: '"Vitamin D supplements can cure depression"', tag: '#health' },
                  { risk: 'medium', color: 'yellow', border: 'border-yellow-500/30', bg: 'bg-yellow-500/5', dot: 'bg-yellow-400', badge: 'text-yellow-400', label: 'MEDIUM', text: '"AI tools are making everyone smarter"', tag: '#AI/productivity' },
                  { risk: 'low', color: 'emerald', border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', dot: 'bg-emerald-500', badge: 'text-emerald-400', label: 'VERIFIED', text: '"5G conspiracy claims lack scientific basis"', tag: '#science' },
                ].map(c => (
                  <div key={c.label} className={`border ${c.border} ${c.bg} rounded-xl p-3 flex items-center gap-3`}>
                    <span className={`w-2 h-2 rounded-full ${c.dot} flex-shrink-0`} />
                    <span className={`text-xs font-mono font-bold ${c.badge} flex-shrink-0`}>{c.label}</span>
                    <span className="text-sm text-gray-300 flex-1">{c.text}</span>
                    <span className="text-xs text-gray-600 font-mono flex-shrink-0">{c.tag}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom CTA */}
            <div className="text-center border-t border-gray-800 pt-16 pb-8">
              <h2 className="text-2xl font-bold text-white mb-3">Ready to see your cognitive score?</h2>
              <p className="text-gray-500 text-sm mb-8">Run the demo in under 30 seconds — no sign-up required.</p>
              <button
                onClick={handleDemoFromHome}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-10 py-3.5 rounded-xl text-sm transition-colors">
                Run Demo
              </button>
            </div>
          </div>
        )}


        {/* ── ANALYZE VIEW ────────────────────────────────────────── */}
        {view === 'analyze' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Analyze Conversation</h1>
              <p className="text-sm text-gray-500 mt-1">
                Paste a conversation transcript or run the demo to see cognitive pattern extraction.
              </p>
            </div>

            {/* Input */}
            <div className="space-y-3">
              <textarea
                value={conversation}
                onChange={e => setConversation(e.target.value)}
                placeholder="Paste a conversation transcript here...&#10;&#10;Format: User: ... / Assistant: ..."
                className="w-full h-52 bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-600 transition-colors font-mono"
              />

              <div className="flex items-center gap-3">
                <button
                  onClick={handleAnalyze}
                  disabled={loading || !conversation.trim()}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
                  {loading && <Spinner />}
                  {loading ? 'Analyzing...' : 'Analyze'}
                </button>

                <button
                  onClick={handleDemo}
                  disabled={loading}
                  className="flex items-center gap-2 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white text-sm px-5 py-2.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  Demo
                </button>

                {sessions.length > 0 && (
                  <span className="text-xs text-gray-600 ml-auto">
                    {sessions.length} session{sessions.length !== 1 ? 's' : ''} stored
                  </span>
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="border border-red-500/30 bg-red-500/8 rounded-xl p-4 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Results */}
            {result && !loading && (
              <div className="space-y-5 animate-in" style={{ animation: 'fadeIn 0.3s ease' }}>
                {/* Scores */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-5">Cognitive Scores</h2>
                  <div className="flex flex-wrap justify-around gap-6">
                    <CircularScore value={result.scores.criticalThinking} label="Critical Thinking" color="#6366f1" />
                    <CircularScore value={result.scores.depth} label="Depth" color="#10b981" />
                    <CircularScore value={result.scores.engagement} label="Engagement" color="#f59e0b" />
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Analysis Summary</h2>
                  <p className="text-sm text-gray-300 leading-relaxed">{result.summary}</p>
                </div>

                {/* Claims */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Flagged Claims</h2>
                  <div className="space-y-2">
                    {result.claims.map((c, i) => <ClaimBadge key={i} claim={c} />)}
                  </div>
                </div>

                {/* Engagement signals */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Engagement Signals</h2>
                  <ul className="space-y-1.5">
                    {result.engagementSignals.map((s, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-gray-400">
                        <span className="w-1 h-1 rounded-full bg-gray-600 mt-2 flex-shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PROFILE VIEW ────────────────────────────────────────── */}
        {view === 'profile' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Cognitive Profile</h1>
              <p className="text-sm text-gray-500 mt-1">
                Cumulative patterns across all sessions.
              </p>
              <label className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer">
                Import profile.json
                <input type="file" accept="application/json,.json" onChange={handleImport} className="hidden" />
              </label>
            </div>

            {!profile ? (
              <div className="border border-gray-800 rounded-xl p-10 text-center">
                <p className="text-gray-500 text-sm">No sessions yet.</p>
                <p className="text-gray-600 text-xs mt-1">
                  Run the Demo on the Analyze tab to populate your profile.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Sessions', value: profile.sessionCount },
                    { label: 'Avg Critical Thinking', value: `${profile.avgCriticalThinking}/100` },
                    { label: 'Avg Depth', value: `${profile.avgDepth}/100` },
                  ].map(stat => (
                    <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                      <div className="text-2xl font-bold text-white">{stat.value}</div>
                      <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
                    </div>
                  ))}
                </div>

                {profile.avgOffloadingRatio !== null && (
                  <div className="mt-6">
                    <h2 className="text-xs text-amber-400/80 uppercase tracking-widest mb-3">Cognitive Offloading Ratio</h2>
                    <div className="flex items-center gap-4">
                      <CircularScore value={profile.avgOffloadingRatio} label="Offloading" color="#f59e0b" />
                      <p className="text-sm text-gray-400 max-w-xs">
                        Share of cognitive work delegated to the AI vs. retained and verified. Lower is healthier —
                        it means you stay in the reasoning loop.
                      </p>
                    </div>
                  </div>
                )}

                {/* Trend chart */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-4">Score Trend</h2>
                  <TrendChart trend={profile.trend} />
                </div>

                {/* Topic map */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-4">Topic Knowledge Map</h2>
                  <TopicMap topicFrequency={profile.topicFrequency} />
                </div>

                {/* Blindspots + Strengths */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-gray-900 border border-red-500/20 rounded-xl p-5">
                    <h2 className="text-xs text-red-500/80 uppercase tracking-widest mb-3">Blind Spots</h2>
                    {profile.blindspots.length ? (
                      <div className="flex flex-wrap gap-2">
                        {profile.blindspots.map(b => (
                          <span key={b} className="text-xs border border-red-500/30 text-red-400 rounded-full px-2.5 py-1">
                            {b}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-600">None detected yet.</p>
                    )}
                  </div>
                  <div className="bg-gray-900 border border-emerald-500/20 rounded-xl p-5">
                    <h2 className="text-xs text-emerald-500/80 uppercase tracking-widest mb-3">Strengths</h2>
                    {profile.strengths.length ? (
                      <div className="flex flex-wrap gap-2">
                        {profile.strengths.map(s => (
                          <span key={s} className="text-xs border border-emerald-500/30 text-emerald-400 rounded-full px-2.5 py-1">
                            {s}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-600">Not enough data yet.</p>
                    )}
                  </div>
                </div>

                {/* Fingerprint */}
                <div className="bg-gray-900 border border-indigo-500/20 rounded-xl p-5">
                  <h2 className="text-xs text-indigo-400/80 uppercase tracking-widest mb-3">Cognitive Fingerprint</h2>
                  <p className="text-sm text-gray-300 leading-relaxed">{fingerprint}</p>
                </div>

                {/* Sessions list */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-4">Session History</h2>
                  <div className="space-y-3">
                    {[...sessions].reverse().map((s, i) => (
                      <div key={s.id} className="border border-gray-800 rounded-lg p-3 flex items-center gap-4">
                        <div className="text-xs text-gray-600 font-mono w-20 flex-shrink-0">
                          {new Date(s.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-indigo-400">{s.scores.criticalThinking} CT</span>
                            <span className="text-xs text-emerald-400">{s.scores.depth} depth</span>
                            <span className="text-xs text-yellow-500/70">{s.scores.engagement} eng</span>
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5 truncate">{s.summary || s.conversation}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
