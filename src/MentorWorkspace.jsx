import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  Circle,
  Loader2,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { enablePushNotifications } from "./utils/pushNotifications";

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
          "Learn Express.js",
          "Create REST APIs",
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
          "Learn Git and GitHub",
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
        "Watch/read beginner resources",
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

function MentorWorkspace({ user, onBack }) {
  const [goal, setGoal] = useState("");
  const [plans, setPlans] = useState([]);
  const [activePlan, setActivePlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [reminderTime, setReminderTime] = useState("20:00");
  const [reminderMessage, setReminderMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState("");

  const progress = useMemo(() => calculateProgress(tasks), [tasks]);

  useEffect(() => {
    loadPlans();
  }, []);

  useEffect(() => {
    if (activePlan) {
      loadTasks(activePlan.id);
      loadReminder(activePlan.id);
    }
  }, [activePlan]);

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
          description: "",
          status: "pending",
          position: phaseIndex * 100 + taskIndex,
        }))
      );

      const { error: taskError } = await supabase
        .from("mentor_tasks")
        .insert(taskRows);

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

  const toggleTask = async (task) => {
    const nextStatus = task.status === "completed" ? "pending" : "completed";

    const { error } = await supabase
      .from("mentor_tasks")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id)
      .eq("user_id", user.id);

    if (error) {
      console.error(error);
      return;
    }

    const updatedTasks = tasks.map((item) =>
      item.id === task.id ? { ...item, status: nextStatus } : item
    );

    setTasks(updatedTasks);

    const nextProgress = calculateProgress(updatedTasks);

    await supabase
      .from("mentor_plans")
      .update({
        progress: nextProgress,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.plan_id)
      .eq("user_id", user.id);

    setActivePlan((prev) =>
      prev ? { ...prev, progress: nextProgress } : prev
    );
  };

  const saveReminder = async () => {
    if (!activePlan) return;

    try {
      const message =
        reminderMessage.trim() ||
        `Continue your roadmap: ${activePlan.title}`;

      const { error } = await supabase.from("mentor_reminders").upsert(
        {
          user_id: user.id,
          plan_id: activePlan.id,
          reminder_time: reminderTime,
          enabled: true,
          message,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,plan_id",
        }
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
    await loadPlans();
  };

  const groupedTasks = tasks.reduce((acc, task) => {
    if (!acc[task.phase]) acc[task.phase] = [];
    acc[task.phase].push(task);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#eef2ff_0%,#f8fafc_45%,#ffffff_100%)] text-slate-900">
      <header className="h-16 px-5 md:px-8 border-b border-slate-200 bg-white/80 backdrop-blur-xl flex items-center justify-between sticky top-0 z-20">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-indigo-600"
        >
          <ArrowLeft size={18} />
          Back to Nexus AI
        </button>

        <div className="flex items-center gap-2 text-sm font-bold text-indigo-600">
          <Target size={18} />
          Mentor AI
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
        <section className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl shadow-slate-200/70">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">
              Personal Mentor
            </p>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mt-2">
              What skill do you want to learn?
            </h1>
            <p className="text-slate-500 mt-3">
              Create a roadmap, track progress, and get daily reminders.
            </p>

            <div className="mt-5 flex gap-3">
              <input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Example: I want to learn full stack web development"
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
              <button
                onClick={createPlan}
                disabled={loading || !goal.trim()}
                className="rounded-2xl bg-indigo-600 px-5 py-3 text-white font-semibold hover:bg-indigo-700 disabled:bg-slate-300 flex items-center gap-2"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                Create
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl shadow-slate-200/70">
            <h2 className="text-lg font-bold">Your Roadmaps</h2>

            <div className="mt-4 space-y-2">
              {plans.length === 0 && (
                <p className="text-sm text-slate-500">
                  No roadmap yet. Create your first learning roadmap.
                </p>
              )}

              {plans.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => setActivePlan(plan)}
                  className={`w-full text-left rounded-2xl border p-4 transition ${
                    activePlan?.id === plan.id
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-slate-200 hover:border-indigo-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {plan.title}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Progress: {plan.progress || 0}%
                      </p>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePlan(plan.id);
                      }}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl shadow-slate-200/70">
            <h2 className="text-lg font-bold">Progress Tracker</h2>

            {!activePlan ? (
              <p className="text-sm text-slate-500 mt-3">
                Select or create a roadmap to track progress.
              </p>
            ) : (
              <>
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-semibold">{activePlan.title}</span>
                    <span className="text-indigo-600 font-bold">
                      {progress}%
                    </span>
                  </div>

                  <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-600 to-violet-600"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className="mt-5 space-y-5">
                  {Object.entries(groupedTasks).map(([phase, phaseTasks]) => (
                    <div key={phase}>
                      <h3 className="text-sm font-bold text-slate-800 mb-2">
                        {phase}
                      </h3>

                      <div className="space-y-2">
                        {phaseTasks.map((task) => (
                          <button
                            key={task.id}
                            onClick={() => toggleTask(task)}
                            className="w-full flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-left hover:bg-slate-50"
                          >
                            {task.status === "completed" ? (
                              <CheckCircle2
                                size={18}
                                className="text-emerald-500 shrink-0"
                              />
                            ) : (
                              <Circle
                                size={18}
                                className="text-slate-400 shrink-0"
                              />
                            )}

                            <span
                              className={`text-sm ${
                                task.status === "completed"
                                  ? "line-through text-slate-400"
                                  : "text-slate-700"
                              }`}
                            >
                              {task.title}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl shadow-slate-200/70">
            <div className="flex items-center gap-2">
              <Bell size={18} className="text-indigo-600" />
              <h2 className="text-lg font-bold">Daily Reminder</h2>
            </div>

            {!activePlan ? (
              <p className="text-sm text-slate-500 mt-3">
                Create a roadmap first to set reminders.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-sm font-semibold text-slate-700">
                    Reminder Time
                  </label>
                  <input
                    type="time"
                    value={reminderTime}
                    onChange={(e) => setReminderTime(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-slate-700">
                    Reminder Message
                  </label>
                  <input
                    value={reminderMessage}
                    onChange={(e) => setReminderMessage(e.target.value)}
                    placeholder={`Continue your roadmap: ${activePlan.title}`}
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                {pushMessage && (
                  <p className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600">
                    {pushMessage}
                  </p>
                )}

                <button
                  onClick={saveReminder}
                  className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-white font-semibold hover:bg-indigo-700"
                >
                  Save Reminder
                </button>

                <p className="text-xs text-slate-500 leading-relaxed">
                  Advanced reminders use browser push notifications. They can work even when the app is not open, depending on browser/device settings.
                </p>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

export default MentorWorkspace;