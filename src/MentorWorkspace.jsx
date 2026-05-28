import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  CheckCircle2,
  Circle,
  Download,
  GraduationCap,
  Loader2,
  Lock,
  Send,
  Sparkles,
  Target,
  Trash2,
  Trophy,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { enablePushNotifications } from "./utils/pushNotifications";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

function buildRoadmapTasks(goal) {
  const text = goal.toLowerCase();

  if (
    text.includes("full stack") ||
    text.includes("web development") ||
    text.includes("frontend") ||
    text.includes("backend")
  ) {
    return [
      {
        phase: "Phase 1: Web Basics",
        tasks: [
          "Learn HTML structure",
          "Learn CSS basics",
          "Build responsive layouts",
          "Create a simple portfolio page",
        ],
      },
      {
        phase: "Phase 2: JavaScript",
        tasks: [
          "Learn variables and data types",
          "Learn functions and loops",
          "Learn DOM manipulation",
          "Build a small interactive app",
        ],
      },
      {
        phase: "Phase 3: React",
        tasks: [
          "Learn components and props",
          "Learn state and events",
          "Learn hooks",
          "Build a React todo app",
        ],
      },
      {
        phase: "Phase 4: Backend",
        tasks: [
          "Learn Node.js basics",
          "Learn Express.js APIs",
          "Create REST API endpoints",
          "Add authentication basics",
        ],
      },
      {
        phase: "Phase 5: Database",
        tasks: [
          "Learn SQL or MongoDB basics",
          "Create CRUD operations",
          "Connect backend with database",
          "Build a full-stack project",
        ],
      },
      {
        phase: "Phase 6: Deployment",
        tasks: [
          "Learn Git and GitHub workflow",
          "Deploy frontend on Vercel",
          "Deploy backend on Render",
          "Prepare final portfolio project",
        ],
      },
    ];
  }

  return [
    {
      phase: "Phase 1: Foundation",
      tasks: [
        `Understand basics of ${goal}`,
        "Learn key terms",
        "Read/watch beginner resources",
        "Make short notes",
      ],
    },
    {
      phase: "Phase 2: Practice",
      tasks: [
        "Practice small examples",
        "Solve beginner tasks",
        "Create revision notes",
        "Ask Nexus AI doubts",
      ],
    },
    {
      phase: "Phase 3: Projects",
      tasks: [
        "Build a small project",
        "Improve the project",
        "Get feedback",
        "Document your learning",
      ],
    },
    {
      phase: "Phase 4: Mastery",
      tasks: [
        "Revise weak topics",
        "Explain the skill to someone else",
        "Build final project",
        "Prepare next roadmap",
      ],
    },
  ];
}

function calculateProgress(tasks) {
  if (!tasks.length) return 0;
  const completed = tasks.filter((task) => task.status === "completed").length;
  return Math.round((completed / tasks.length) * 100);
}

function toTitleCase(value = "") {
  return String(value)
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getUserDisplayName(user) {
  const meta = user?.user_metadata || {};
  const fromMeta =
    meta.full_name ||
    meta.name ||
    meta.display_name ||
    meta.username ||
    meta.user_name;

  if (fromMeta && String(fromMeta).trim()) {
    return toTitleCase(String(fromMeta).replace(/[._-]+/g, " ").trim());
  }

  const emailPrefix = user?.email?.split("@")[0] || "Student";
  return toTitleCase(emailPrefix.replace(/[0-9]+/g, " ").replace(/[._-]+/g, " ").trim() || "Student");
}

function cleanSkillTitle(goal = "") {
  let text = String(goal).trim();

  const replacements = [
    /^i\s+want\s+to\s+learn\s+/i,
    /^i\s+wanna\s+learn\s+/i,
    /^i\s+want\s+to\s+become\s+/i,
    /^i\s+want\s+to\s+study\s+/i,
    /^i\s+am\s+learning\s+/i,
    /^main\s+/i,
    /^m\s+/i,
    /^mujhe\s+/i,
    /\s+seekhna\s+chahta\s+hu$/i,
    /\s+seekhna\s+chahti\s+hu$/i,
    /\s+seekhna\s+hai$/i,
    /\s+learn\s+karna\s+hai$/i,
    /\s+banana\s+hai$/i,
  ];

  replacements.forEach((pattern) => {
    text = text.replace(pattern, "");
  });

  text = text
    .replace(/\s+/g, " ")
    .replace(/^(a|an|the)\s+/i, "")
    .trim();

  if (!text) return "Learning Program";
  return toTitleCase(text);
}

function getCertificateStudentName(certificate, user) {
  const stored = certificate?.student_name;

  if (stored && !String(stored).includes("@")) {
    return toTitleCase(String(stored).replace(/[._-]+/g, " ").trim());
  }

  return getUserDisplayName(user);
}

function getCertificateSkillName(certificate, activePlan) {
  return cleanSkillTitle(certificate?.skill_title || activePlan?.title || "Learning Program");
}

function MarkdownBox({ content }) {
  if (!content) return null;

  return (
    <div className="nexus-markdown prose prose-slate max-w-none text-sm md:text-[15px]">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function MentorWorkspace({ user, onBack }) {
  const [goal, setGoal] = useState("");
  const [plans, setPlans] = useState([]);
  const [activePlan, setActivePlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);

  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [stage, setStage] = useState("idle"); // idle | lesson | quiz | answering | evaluation
  const [currentQuiz, setCurrentQuiz] = useState("");
  const [answerDraft, setAnswerDraft] = useState("");

  const [reminderTime, setReminderTime] = useState("20:00");
  const [reminderMessage, setReminderMessage] = useState("");
  const [pushMessage, setPushMessage] = useState("");

  const [certificate, setCertificate] = useState(null);
  const [certificateQr, setCertificateQr] = useState("");
  const [showCertificate, setShowCertificate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const bottomRef = useRef(null);
  const messagesScrollRef = useRef(null);
  const certificateRef = useRef(null);
  const progress = useMemo(() => calculateProgress(tasks), [tasks]);

  useEffect(() => {
    loadPlans();
  }, []);

  useEffect(() => {
    if (activePlan) {
      loadTasks(activePlan.id);
      loadReminder(activePlan.id);
      loadCertificate(activePlan.id);
      resetChatForPlan(activePlan);
    }
  }, [activePlan?.id]);

  useEffect(() => {
    const container = messagesScrollRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    if (distanceFromBottom < 220 || aiLoading) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [messages, aiLoading]);

  useEffect(() => {
    if (!certificate) {
      setCertificateQr("");
      return;
    }

    const certificateId = certificate.certificate_no;
    const verifyUrl = `${window.location.origin}/verify.html?cert=${encodeURIComponent(certificateId)}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&ecc=H&margin=8&data=${encodeURIComponent(verifyUrl)}`;

    setCertificateQr(qrUrl);
  }, [certificate]);

  const resetChatForPlan = (plan) => {
    setMessages([
      {
        role: "mentor",
        content: `# Mentor AI Roadmap Started\n\nYou are now learning **${plan.title}**.\n\nSelect the first unlocked task from the left side. I will teach it simply, then give you a test. Your progress will increase only after you pass the test.`,
      },
    ]);
    setSelectedTask(null);
    setCurrentQuiz("");
    setAnswerDraft("");
    setStage("idle");
  };

  const loadPlans = async () => {
    const { data, error } = await supabase
      .from("mentor_plans")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    setPlans(data || []);
    if (data?.length) setActivePlan(data[0]);
  };

  const loadTasks = async (planId) => {
    const { data, error } = await supabase
      .from("mentor_tasks")
      .select("*")
      .eq("plan_id", planId)
      .order("position", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    setTasks(data || []);
  };

  const loadReminder = async (planId) => {
    const { data, error } = await supabase
      .from("mentor_reminders")
      .select("*")
      .eq("plan_id", planId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error(error);
      return;
    }

    if (data) {
      setReminderTime(data.reminder_time || "20:00");
      setReminderMessage(data.message || "");
    }
  };

  const loadCertificate = async (planId) => {
    const { data, error } = await supabase
      .from("mentor_certificates")
      .select("*")
      .eq("plan_id", planId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!error && data) setCertificate(data);
    else setCertificate(null);
  };

  const getUnlockedIndex = () => {
    const firstPendingIndex = tasks.findIndex((task) => task.status !== "completed");
    return firstPendingIndex === -1 ? tasks.length : firstPendingIndex;
  };

  const isTaskUnlocked = (taskIndex) => taskIndex <= getUnlockedIndex();

  const createPlan = async () => {
    if (!goal.trim()) return;
    setLoading(true);

    try {
      const roadmap = buildRoadmapTasks(goal.trim());

      const { data: plan, error: planError } = await supabase
        .from("mentor_plans")
        .insert({
          user_id: user.id,
          title: goal.trim(),
          goal: goal.trim(),
          roadmap,
          progress: 0,
        })
        .select()
        .single();

      if (planError) throw planError;

      const taskRows = roadmap.flatMap((phase, phaseIndex) =>
        phase.tasks.map((task, taskIndex) => ({
          user_id: user.id,
          plan_id: plan.id,
          phase: phase.phase,
          title: task,
          description: "Learn this task, pass the test, then unlock the next step.",
          status: "pending",
          position: phaseIndex * 100 + taskIndex,
        }))
      );

      const { error: taskError } = await supabase.from("mentor_tasks").insert(taskRows);
      if (taskError) throw taskError;

      setGoal("");
      setActivePlan(plan);
      await loadPlans();
      await loadTasks(plan.id);
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const callMentorAI = async (message) => {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: `mentor-${activePlan?.id || "roadmap"}`,
        message,
        mode: "tutor",
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Mentor AI failed");
    return data.reply;
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const addMentorMessageTyping = async (content) => {
    const id = `mentor-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setMessages((prev) => [...prev, { id, role: "mentor", content: "" }]);

    const chunkSize = 10;
    for (let index = 0; index < content.length; index += chunkSize) {
      const nextContent = content.slice(0, index + chunkSize);
      setMessages((prev) =>
        prev.map((msg) => (msg.id === id ? { ...msg, content: nextContent } : msg))
      );
      await wait(8);
    }
  };

  const addMentorMessage = (content) => {
    setMessages((prev) => [
      ...prev,
      { id: `mentor-${Date.now()}-${Math.random().toString(16).slice(2)}`, role: "mentor", content },
    ]);
  };

  const addStudentMessage = (content) => {
    setMessages((prev) => [
      ...prev,
      { id: `student-${Date.now()}-${Math.random().toString(16).slice(2)}`, role: "student", content },
    ]);
  };

  const selectTask = async (task, taskIndex) => {
    if (!isTaskUnlocked(taskIndex) || aiLoading) return;

    setSelectedTask(task);
    setCurrentQuiz("");
    setAnswerDraft("");
    setStage("lesson");

    addMentorMessage(`# Selected Task\n\n**${task.title}**\n\nI will now teach this task deeply and simply. After learning, click **Generate Test** to prove your understanding and unlock the next task.`);

    await teachTask(task);
  };

  const teachTask = async (taskOverride = null) => {
    const taskToTeach = taskOverride || selectedTask;
    if (!taskToTeach || !activePlan) return;

    setAiLoading(true);

    try {
      const reply = await callMentorAI(`
You are Mentor AI. Teach this roadmap task deeply to a beginner.

Skill/Roadmap: ${activePlan.title}
Phase: ${taskToTeach.phase}
Task: ${taskToTeach.title}

The student should understand this task properly before taking a test.

Teach it like a patient mentor, not like a short answer.
Use this strict format:
# Deep Learning Session: ${taskToTeach.title}

## 1. Very Simple Meaning
Explain the task in extremely simple words.

## 2. Why This Matters
Explain why this task is important in the roadmap.

## 3. Core Concept From Zero
Teach the concept from beginner level. Do not assume prior knowledge.

## 4. Step-by-Step Learning
Break the concept into small steps.

## 5. Real-Life Analogy
Give a relatable analogy.

## 6. Practical Example
Give a practical example or mini demo.

## 7. Common Confusions
Explain what beginners usually misunderstand.

## 8. Practice Task
Give a small task the student can try.

## 9. Quick Revision
Summarize the learning in 5 bullet points.

Important rules:
- Go deep but keep language simple.
- Do not mark the task complete.
- The student must pass a test before progress increases.
- Avoid unnecessary motivation. Focus on teaching.
`);

      await addMentorMessageTyping(reply);
      setStage("lesson");
    } catch (error) {
      await addMentorMessageTyping(`Could not generate lesson. ${error.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const generateTest = async () => {
    if (!selectedTask || !activePlan) return;
    setAiLoading(true);
    setAnswerDraft("");

    try {
      const reply = await callMentorAI(`
Create a mastery test for this roadmap task.

Skill/Roadmap: ${activePlan.title}
Phase: ${selectedTask.phase}
Task: ${selectedTask.title}

Output only:
# Mastery Test: ${selectedTask.title}
## Instructions
Answer in your own words.
## Questions
1. Easy concept question
2. Practical/application question
3. Small project/coding/practice question if relevant

Keep it short and student-friendly.
`);

      setCurrentQuiz(reply);
      await addMentorMessageTyping(reply);
      setStage("answering");
    } catch (error) {
      await addMentorMessageTyping(`Could not generate test. ${error.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const submitAnswer = async () => {
    if (!selectedTask || !activePlan || !answerDraft.trim()) return;
    setAiLoading(true);

    try {
      const reply = await callMentorAI(`
Evaluate this student's answer for a roadmap task.

Skill/Roadmap: ${activePlan.title}
Task: ${selectedTask.title}

Quiz:
${currentQuiz}

Student Answer:
${answerDraft}

You must decide if the student passed.

Output format:
# Mastery Evaluation
RESULT: PASS or FAIL

## Score
Give score out of 10.

## What Was Good
## What Is Missing
## Feedback
## Next Step

Rules:
- Use RESULT: PASS only if the answer shows basic understanding.
- Use RESULT: FAIL if answer is empty, copied, very weak, or misses core idea.
- If FAIL, teach what to improve briefly and encourage retry.
`);

      const passed = /RESULT:\s*PASS/i.test(reply);

      await supabase.from("mentor_task_attempts").insert({
        user_id: user.id,
        plan_id: activePlan.id,
        task_id: selectedTask.id,
        answer: answerDraft.trim(),
        evaluation: reply,
        passed,
      });

      addStudentMessage(answerDraft);
      await addMentorMessageTyping(reply);
      setAnswerDraft("");
      setStage("evaluation");

      if (passed) {
        await completeTaskAfterPass(selectedTask);
      }
    } catch (error) {
      await addMentorMessageTyping(`Could not evaluate answer. ${error.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const completeTaskAfterPass = async (task) => {
    const { error } = await supabase
      .from("mentor_tasks")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", task.id)
      .eq("user_id", user.id);

    if (error) {
      console.error(error);
      return;
    }

    const updatedTasks = tasks.map((item) =>
      item.id === task.id ? { ...item, status: "completed" } : item
    );

    setTasks(updatedTasks);
    setSelectedTask({ ...task, status: "completed" });

    const nextProgress = calculateProgress(updatedTasks);

    await supabase
      .from("mentor_plans")
      .update({ progress: nextProgress, updated_at: new Date().toISOString() })
      .eq("id", task.plan_id)
      .eq("user_id", user.id);

    setActivePlan((prev) => (prev ? { ...prev, progress: nextProgress } : prev));

    const nextTask = updatedTasks.find((item) => item.status !== "completed");

    if (nextProgress === 100) {
      await issueCertificate();
      setMessages((prev) => [
        ...prev,
        {
          role: "mentor",
          content: "# Skill Completed 🎉\n\nYou have completed all roadmap tasks. Your certificate is now unlocked.",
        },
      ]);
    } else if (nextTask) {
      setMessages((prev) => [
        ...prev,
        {
          role: "mentor",
          content: `# Next Task Unlocked\n\nYour next task is **${nextTask.title}**. Select it from the left side and continue learning.`,
        },
      ]);
    }
  };

  const issueCertificate = async () => {
    if (!activePlan) return null;

    if (certificate) return certificate;

    const year = new Date().getFullYear();
    const unique = crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8).toUpperCase()
      : Math.random().toString(36).slice(2, 10).toUpperCase();

    const certificateNo = `NEXUS-${year}-${unique}`;
    const studentName = getUserDisplayName(user);
    const skillTitle = cleanSkillTitle(activePlan.title);

    const { data, error } = await supabase
      .from("mentor_certificates")
      .upsert(
        {
          user_id: user.id,
          plan_id: activePlan.id,
          certificate_no: certificateNo,
          student_name: studentName,
          skill_title: skillTitle,
          issued_by: "Nexus AI",
        },
        { onConflict: "user_id,plan_id" }
      )
      .select()
      .single();

    if (!error && data) {
      setCertificate(data);
      return data;
    }

    return null;
  };

  const downloadCertificatePdf = async () => {
    if (!certificateRef.current || !certificate) return;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${certificate.certificate_no}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; padding: 24px; background: #ffffff; font-family: Arial, sans-serif; }
  </style>
</head>
<body>
  ${certificateRef.current.outerHTML}
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${certificate.certificate_no || "nexus-certificate"}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const printCertificate = () => {
    if (!certificateRef.current) return;

    const printContents = certificateRef.current.outerHTML;
    const printWindow = window.open("", "_blank");

    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Nexus AI Certificate</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; padding: 24px; font-family: Arial, sans-serif; background: #ffffff; }
            .certificate-print-root { width: 1120px; min-height: 760px; }
          </style>
        </head>
        <body>${printContents}</body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  };

  const saveReminder = async () => {
    if (!activePlan) return;

    try {
      const message = reminderMessage.trim() || `Continue your roadmap: ${activePlan.title}`;

      const { error } = await supabase.from("mentor_reminders").upsert(
        {
          user_id: user.id,
          plan_id: activePlan.id,
          reminder_time: reminderTime,
          enabled: true,
          message,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,plan_id" }
      );

      if (error) throw error;

      await enablePushNotifications(user.id);
      setPushMessage("Reminder saved and push notifications enabled.");
      setTimeout(() => setPushMessage(""), 2500);
    } catch (error) {
      console.error(error);
      setPushMessage(error.message);
    }
  };

  const deletePlan = async (planId) => {
    const { error } = await supabase
      .from("mentor_plans")
      .delete()
      .eq("id", planId)
      .eq("user_id", user.id);

    if (error) {
      console.error(error);
      return;
    }

    setActivePlan(null);
    setTasks([]);
    setSelectedTask(null);
    setMessages([]);
    setCertificate(null);
    await loadPlans();
  };

  const groupedTasks = tasks.reduce((acc, task) => {
    if (!acc[task.phase]) acc[task.phase] = [];
    acc[task.phase].push(task);
    return acc;
  }, {});

  return (
    <div className="h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#eef2ff_0%,#f8fafc_45%,#ffffff_100%)] text-slate-900 flex flex-col">
      <header className="h-16 px-5 md:px-8 border-b border-slate-200 bg-white/80 backdrop-blur-xl flex items-center justify-between shrink-0">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-indigo-600"
        >
          <ArrowLeft size={18} />
          Back
        </button>

        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 text-sm md:text-base font-extrabold text-indigo-600">
          <GraduationCap size={20} />
          Your Personal AI Mentor
        </div>
      </header>

      <main className="flex-1 min-h-0 grid grid-cols-[310px_1fr_330px] gap-0">
        <aside className="border-r border-slate-200 bg-white/75 backdrop-blur-xl p-4 overflow-y-auto">
          <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 p-5 text-white shadow-xl shadow-indigo-200/70 mb-4">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-100">Mentor Roadmap</p>
            <h2 className="text-xl font-extrabold mt-2">Start a skill path</h2>
            <div className="mt-4 space-y-2">
              <input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Full stack web development..."
                className="w-full rounded-2xl border border-white/20 bg-white/95 px-4 py-3 text-sm text-slate-900 outline-none"
              />
              <button
                onClick={createPlan}
                disabled={loading || !goal.trim()}
                className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-bold text-indigo-600 hover:bg-indigo-50 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Target size={16} />}
                Create Roadmap
              </button>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            {plans.map((plan) => (
              <button
                key={plan.id}
                onClick={() => setActivePlan(plan)}
                className={`w-full text-left rounded-2xl border p-3 transition ${
                  activePlan?.id === plan.id
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-slate-200 bg-white hover:border-indigo-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{plan.title}</p>
                    <p className="text-xs text-slate-500">{plan.progress || 0}% complete</p>
                  </div>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePlan(plan.id);
                    }}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <Trash2 size={15} />
                  </span>
                </div>
              </button>
            ))}
          </div>

          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Learning Tasks</h3>

          {!activePlan ? (
            <p className="text-sm text-slate-500">Create a roadmap to see locked tasks.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedTasks).map(([phase, phaseTasks]) => (
                <div key={phase}>
                  <p className="text-xs font-bold text-slate-700 mb-2">{phase}</p>
                  <div className="space-y-2">
                    {phaseTasks.map((task) => {
                      const index = tasks.findIndex((item) => item.id === task.id);
                      const unlocked = isTaskUnlocked(index);

                      return (
                        <button
                          key={task.id}
                          onClick={() => selectTask(task, index)}
                          disabled={!unlocked}
                          className={`w-full flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                            selectedTask?.id === task.id
                              ? "border-indigo-300 bg-indigo-50"
                              : unlocked
                              ? "border-slate-200 bg-white hover:bg-slate-50"
                              : "border-slate-100 bg-slate-50 opacity-70 cursor-not-allowed"
                          }`}
                        >
                          {task.status === "completed" ? (
                            <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                          ) : unlocked ? (
                            <Circle size={18} className="text-indigo-500 shrink-0" />
                          ) : (
                            <Lock size={17} className="text-slate-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className={`text-sm ${task.status === "completed" ? "line-through text-slate-400" : "text-slate-700"}`}>{task.title}</p>
                            <p className="text-[11px] text-slate-400">
                              {task.status === "completed" ? "Passed test" : unlocked ? "Unlocked" : "Locked"}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <button
                onClick={async () => {
                  if (progress === 100) {
                    const issued = await issueCertificate();
                    if (issued) {
                      setShowCertificate(true);
                      addMentorMessage(`# Certificate Ready 🎓\n\nYour Nexus AI certificate is unlocked. You can now download or print it.`);
                    }
                  }
                }}
                disabled={progress !== 100}
                className={`w-full flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                  progress === 100
                    ? "border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700"
                    : "border-slate-100 bg-slate-50 opacity-70 cursor-not-allowed text-slate-400"
                }`}
              >
                {progress === 100 ? <Trophy size={18} /> : <Lock size={17} />}
                <div>
                  <p className="text-sm font-semibold">Get Certificate</p>
                  <p className="text-[11px]">{progress === 100 ? "Unlocked" : "Complete all tasks to unlock"}</p>
                </div>
              </button>
            </div>
          )}
        </aside>

        <section className="flex flex-col min-w-0 min-h-0 overflow-hidden">
          <div ref={messagesScrollRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-8 overscroll-contain">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-3xl bg-indigo-600 text-white flex items-center justify-center shadow-xl shadow-indigo-200 rotate-3">
                  <Sparkles size={30} />
                </div>
                <h1 className="mt-6 text-4xl md:text-5xl font-extrabold tracking-tight text-slate-950">NEXUS AI</h1>
                <p className="mt-3 max-w-xl text-slate-500 leading-relaxed">
                  Create a roadmap, select the first task, learn it from Mentor AI, pass the test, and unlock the next task.
                </p>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-5">
                {messages.map((msg, index) => (
                  <div key={index} className={`flex ${msg.role === "student" ? "justify-end" : "justify-start"}`}>
                    <div className={`rounded-3xl px-5 py-4 max-w-[88%] shadow-sm border ${msg.role === "student" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-200"}`}>
                      {msg.role === "student" ? <p className="whitespace-pre-wrap text-sm">{msg.content}</p> : <MarkdownBox content={msg.content} />}
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div className="flex justify-start">
                    <div className="rounded-3xl px-5 py-4 bg-white border border-slate-200 text-slate-500 flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin text-indigo-600" />
                      Mentor AI is thinking...
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <div className="p-5 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
            <div className="max-w-3xl mx-auto">
              {stage === "answering" && (
                <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                  Test mode active: write your answer below and submit. Progress increases only if you pass.
                </div>
              )}

              <div className="rounded-3xl bg-white border border-slate-200 shadow-2xl shadow-slate-200/70 p-3 flex items-end gap-3">
                <textarea
                  value={stage === "answering" ? answerDraft : prompt}
                  onChange={(e) => (stage === "answering" ? setAnswerDraft(e.target.value) : setPrompt(e.target.value))}
                  rows={1}
                  placeholder={
                    stage === "answering"
                      ? "Write your test answer here..."
                      : selectedTask
                      ? `Ask a doubt about: ${selectedTask.title}`
                      : "Create a roadmap or select a task..."
                  }
                  className="flex-1 max-h-32 resize-none bg-transparent outline-none text-slate-800 placeholder:text-slate-400 py-2 px-2"
                />
                <button
                  onClick={() => {
                    if (stage === "answering") submitAnswer();
                    else if (prompt.trim()) {
                      addStudentMessage(prompt);
                      const userPrompt = prompt;
                      setPrompt("");
                      setAiLoading(true);
                      callMentorAI(`The student asks about roadmap ${activePlan?.title || "learning"}: ${userPrompt}`)
                        .then((reply) => addMentorMessageTyping(reply))
                        .catch((error) => addMentorMessageTyping(error.message))
                        .finally(() => setAiLoading(false));
                    }
                  }}
                  disabled={aiLoading || (stage === "answering" ? !answerDraft.trim() : !prompt.trim())}
                  className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:bg-slate-300"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside className="border-l border-slate-200 bg-white/75 backdrop-blur-xl p-4 overflow-y-auto">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70 mb-4">
            <h2 className="font-bold text-slate-900">Progress Tracker</h2>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-slate-500">Current roadmap</span>
              <span className="font-bold text-indigo-600">{progress}%</span>
            </div>
            <div className="mt-2 h-3 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-600 to-violet-600" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70 mb-4">
            <h2 className="font-bold text-slate-900 mb-3">Task Actions</h2>
            {!selectedTask ? (
              <p className="text-sm text-slate-500">Select an unlocked task first.</p>
            ) : selectedTask.status === "completed" ? (
              <p className="text-sm text-emerald-600 font-semibold">This task is completed.</p>
            ) : (
              <div className="space-y-2">
                <p className="rounded-2xl bg-indigo-50 border border-indigo-100 px-3 py-3 text-xs text-indigo-700 leading-relaxed">
                  This task is taught automatically when selected. Generate the test only after reading the lesson.
                </p>
                <button onClick={generateTest} disabled={aiLoading || stage !== "lesson"} className="w-full rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-700 font-semibold hover:bg-indigo-100 disabled:opacity-50 flex items-center justify-center gap-2">
                  <Target size={17} />
                  Generate Test
                </button>
                <button onClick={() => teachTask(selectedTask)} disabled={aiLoading} className="w-full rounded-2xl bg-white border border-slate-200 px-4 py-3 text-slate-600 font-semibold hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-2">
                  <BookOpen size={17} />
                  Explain Again Deeply
                </button>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70 mb-4">
            <div className="flex items-center gap-2">
              <Bell size={18} className="text-indigo-600" />
              <h2 className="font-bold text-slate-900">Daily Reminder</h2>
            </div>
            {!activePlan ? (
              <p className="text-sm text-slate-500 mt-3">Create a roadmap first.</p>
            ) : (
              <div className="mt-4 space-y-3">
                <input type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500" />
                <input value={reminderMessage} onChange={(e) => setReminderMessage(e.target.value)} placeholder={`Continue your roadmap: ${activePlan.title}`} className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500" />
                {pushMessage && <p className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600">{pushMessage}</p>}
                <button onClick={saveReminder} className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-white font-semibold hover:bg-indigo-700">Save Reminder</button>
              </div>
            )}
          </div>

          {progress === 100 && (
            <div className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-xl shadow-amber-100/70">
              <div className="flex items-center gap-2 text-amber-600">
                <Trophy size={22} />
                <h2 className="font-bold">Certificate Unlocked</h2>
              </div>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                You completed all learning tasks and mastery tests. Your Nexus AI certificate is ready.
              </p>
              <button
                onClick={async () => {
                  const issued = await issueCertificate();
                  if (issued) setShowCertificate(true);
                }}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 text-white font-semibold hover:bg-amber-600"
              >
                <Download size={18} />
                View Certificate
              </button>
            </div>
          )}
        </aside>
      </main>

      {showCertificate && certificate && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-6xl w-full max-h-[95vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h2 className="font-bold text-slate-900">Nexus AI Certificate</h2>
              <button
                onClick={() => setShowCertificate(false)}
                className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center text-xl"
              >
                ×
              </button>
            </div>

            <div className="p-6">
              <div
                ref={certificateRef}
                className="certificate-print-root relative bg-[#fffaf0] border-[10px] border-[#d4af37] rounded-2xl p-10 text-center overflow-hidden"
                style={{ minHeight: "640px", boxShadow: "inset 0 0 0 4px #111827" }}
              >
                <div className="absolute inset-5 border-2 border-[#d4af37] rounded-xl pointer-events-none" />
                <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-amber-200/40 blur-3xl" />
                <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-indigo-200/40 blur-3xl" />

                <div className="relative z-10">
                  <div className="text-sm font-bold tracking-[0.35em] text-[#8a6d1d] uppercase">Nexus AI</div>

                  <h1 className="mt-5 text-5xl font-serif font-bold text-slate-950">Certificate of Completion</h1>

                  <p className="mt-8 text-lg text-slate-600">This certificate is proudly awarded to</p>

                  <h2 className="mt-4 text-4xl font-bold text-indigo-700 uppercase tracking-wide">
                    {getCertificateStudentName(certificate, user)}
                  </h2>

                  <p className="mt-8 text-lg text-slate-600">
                    for successfully completing the Guided Learning Program in
                  </p>

                  <h3 className="mt-4 text-3xl font-extrabold text-slate-950 uppercase">{getCertificateSkillName(certificate, activePlan)}</h3>

                  <p className="mt-6 max-w-2xl mx-auto text-slate-600 leading-relaxed">
                    through guided lessons, practice tasks, mentor evaluation, and successful completion of all required milestones.
                  </p>

                  <div className="mt-10 grid grid-cols-3 items-end gap-6">
                    <div className="text-left">
                      <p className="text-xs text-slate-500 uppercase font-bold">Certificate ID</p>
                      <p className="font-bold text-slate-900">{certificate.certificate_no}</p>

                      <p className="text-xs text-slate-500 uppercase font-bold mt-4">Issued Date</p>
                      <p className="font-bold text-slate-900">
                        {new Date(certificate.issued_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="text-center">
                      {certificateQr && (
                        <img src={certificateQr} alt="Certificate QR" className="w-32 h-32 mx-auto border border-slate-200 p-1 bg-white" />
                      )}
                      <p className="text-xs text-slate-500 mt-2">Scan to verify</p>
                      <p className="text-[10px] text-slate-400 mt-1 break-all">{`${window.location.origin}/verify.html?cert=${certificate.certificate_no}`}</p>
                    </div>

                    <div className="text-right">
                      <div className="border-t-2 border-slate-900 pt-2">
                        <p className="font-bold text-slate-950">Aditya Sharma</p>
                        <p className="text-xs text-slate-500">Founder, Nexus AI</p>
                      </div>
                      <p className="mt-5 inline-block rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 text-xs font-bold">
                        Nexus AI Verified
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 justify-end mt-5">
                <button onClick={printCertificate} className="px-5 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50">
                  Print Certificate
                </button>
                <button onClick={downloadCertificatePdf} className="px-5 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700">
                  Download Certificate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default MentorWorkspace;
