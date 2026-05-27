import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Auth from "./Auth";
import { supabase } from "./lib/supabase";
import {
  Brain,
  Menu,
  Plus,
  Search,
  MessageSquare,
  Settings,
  GraduationCap,
  Paperclip,
  ArrowUp,
  FileText,
  Presentation,
  Code2,
  Eye,
  Sparkles,
  Loader2,
  Copy,
  Check,
  RotateCcw,
  X,
  Database,
  Trash2,
} from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

function createId(prefix = "id") {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createSessionId() {
  return createId("session");
}

function createConversation() {
  const now = Date.now();

  return {
    id: createId("chat"),
    title: "New Chat",
    messages: [],
    sessionId: createSessionId(),
    sessionFiles: [],
    createdAt: now,
    updatedAt: now,
  };
}

function createTitleFromMessages(messages = []) {
  const firstUserMessage = messages.find((msg) => msg.role === "user")?.content || "";
  if (!firstUserMessage.trim()) return "New Chat";
  return firstUserMessage.trim().replace(/\s+/g, " ").slice(0, 42);
}

function formatChatTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function MarkdownMessage({ content }) {
  return (
    <div className="nexus-markdown prose prose-slate max-w-none text-sm md:text-[15px]">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cloudLoaded, setCloudLoaded] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeMode, setActiveMode] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [tutorStyleIndex, setTutorStyleIndex] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [sessionId, setSessionId] = useState(createSessionId);
  const [sessionFiles, setSessionFiles] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const modes = [
    { id: "notes", label: "Notes", icon: FileText },
    { id: "ppt", label: "PPT", icon: Presentation },
    { id: "coding", label: "Coding", icon: Code2 },
    { id: "deep-search", label: "Deep Search", icon: Search },
    { id: "exam", label: "Exam Mode", icon: GraduationCap },
    { id: "tutor", label: "Tutor Mode", icon: Brain },
    { id: "visual", label: "Visual Explain", icon: Eye },
  ];

  const modePlaceholders = {
    notes: "Ask a topic to create revision notes...",
    ppt: "Enter a topic to generate PPT content...",
    coding: "Paste code or ask any coding question...",
    "deep-search": "Ask from uploaded PDFs, notes, syllabus or PYQs...",
    exam: "Ask for important questions, PYQ analysis, or study plan...",
    tutor: "Ask a topic to learn it in multiple ways...",
    visual: "Ask a concept to explain visually...",
  };

  const activeModeData = modes.find((mode) => mode.id === activeMode);
  const ActiveModeIcon = activeModeData?.icon;
  const lastAiMessageId = [...messages].reverse().find((m) => m.role === "ai")?.id;

  const sortedConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return [...conversations]
      .filter((chat) => !query || chat.title.toLowerCase().includes(query))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [conversations, searchQuery]);

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      setUser(data.session?.user || null);
      setAuthLoading(false);
    };

    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const mapDbConversation = (chat) => ({
    id: chat.id,
    title: chat.title || "New Chat",
    messages: chat.messages || [],
    sessionId: chat.session_id || createSessionId(),
    sessionFiles: chat.session_files || [],
    createdAt: new Date(chat.created_at).getTime(),
    updatedAt: new Date(chat.updated_at).getTime(),
  });

  const insertConversationToCloud = async (conversation, currentUser = user) => {
    if (!currentUser) return;

    const { error } = await supabase.from("conversations").insert({
      id: conversation.id,
      user_id: currentUser.id,
      title: conversation.title,
      messages: conversation.messages,
      session_id: conversation.sessionId,
      session_files: conversation.sessionFiles,
      created_at: new Date(conversation.createdAt).toISOString(),
      updated_at: new Date(conversation.updatedAt).toISOString(),
    });

    if (error) console.error("Failed to insert conversation:", error);
  };

  const loadCloudConversations = async (currentUser) => {
    try {
      setCloudLoaded(false);

      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        const firstConversation = createConversation();
        await insertConversationToCloud(firstConversation, currentUser);

        setConversations([firstConversation]);
        setCurrentConversationId(firstConversation.id);
        setMessages([]);
        setSessionId(firstConversation.sessionId);
        setSessionFiles([]);
        setCloudLoaded(true);
        return;
      }

      const mapped = data.map(mapDbConversation);
      const activeChat = mapped[0];

      setConversations(mapped);
      setCurrentConversationId(activeChat.id);
      setMessages(activeChat.messages || []);
      setSessionId(activeChat.sessionId || createSessionId());
      setSessionFiles(activeChat.sessionFiles || []);
      setCloudLoaded(true);
    } catch (error) {
      console.error("Failed to load conversations from Supabase:", error);
      setCloudLoaded(true);
    }
  };

  useEffect(() => {
    if (user) {
      loadCloudConversations(user);
    } else {
      setCloudLoaded(false);
      setConversations([]);
      setCurrentConversationId("");
      setMessages([]);
      setSessionId(createSessionId());
      setSessionFiles([]);
      setSelectedFiles([]);
      setInput("");
      setActiveMode("");
    }
  }, [user]);

  useEffect(() => {
    if (!cloudLoaded || !currentConversationId) return;

    setConversations((prev) =>
      prev.map((chat) => {
        if (chat.id !== currentConversationId) return chat;

        return {
          ...chat,
          title: createTitleFromMessages(messages),
          messages,
          sessionId,
          sessionFiles,
          updatedAt: Date.now(),
        };
      })
    );
  }, [messages, sessionId, sessionFiles, currentConversationId, cloudLoaded]);

  const saveConversationToCloud = async (conversation) => {
    if (!user || !conversation) return;

    const { error } = await supabase.from("conversations").upsert(
      {
        id: conversation.id,
        user_id: user.id,
        title: conversation.title || createTitleFromMessages(conversation.messages),
        messages: conversation.messages || [],
        session_id: conversation.sessionId,
        session_files: conversation.sessionFiles || [],
        created_at: new Date(conversation.createdAt || Date.now()).toISOString(),
        updated_at: new Date(conversation.updatedAt || Date.now()).toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) console.error("Failed to save conversation:", error);
  };

  useEffect(() => {
    if (!user || !cloudLoaded || !currentConversationId) return;

    const activeChat = conversations.find((chat) => chat.id === currentConversationId);
    if (!activeChat) return;

    const timer = setTimeout(() => {
      saveConversationToCloud(activeChat);
    }, 700);

    return () => clearTimeout(timer);
  }, [conversations, currentConversationId, user, cloudLoaded]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const getModeLabel = (modeId) => {
    const mode = modes.find((item) => item.id === modeId);
    return mode ? mode.label : "Normal";
  };

  const getFileNamesText = (files) => {
    if (!files || files.length === 0) return null;
    return files.map((file) => file.name).join(", ");
  };

  const syncSessionFiles = (files = []) => {
    const readableFiles = files.filter((file) => file.ok !== false);
    setSessionFiles(readableFiles);
  };

  const callBackend = async ({ cleanInput, selectedMode, files = [], extra = {} }) => {
    const currentSessionId = sessionId;

    const shortHistory = messages.slice(-4).map((msg) => ({
      role: msg.role,
      content: msg.content.length > 800 ? msg.content.slice(0, 800) + "..." : msg.content,
    }));

    if (files.length > 0) {
      const formData = new FormData();
      formData.append("sessionId", currentSessionId);
      formData.append("message", cleanInput);
      formData.append("mode", selectedMode);
      formData.append("history", JSON.stringify(shortHistory));

      files.forEach((file) => formData.append("files", file));
      Object.entries(extra).forEach(([key, value]) => {
        formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });

      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Backend error");

      if (data.sessionId && data.sessionId !== sessionId) setSessionId(data.sessionId);
      if (Array.isArray(data.files)) syncSessionFiles(data.files);
      return data.reply;
    }

    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: currentSessionId,
        message: cleanInput,
        mode: selectedMode,
        history: shortHistory,
        ...extra,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Backend error");

    if (data.sessionId && data.sessionId !== sessionId) setSessionId(data.sessionId);
    if (Array.isArray(data.files)) syncSessionFiles(data.files);
    return data.reply;
  };

  const handleSend = async () => {
    const cleanInput = input.trim();
    if (!cleanInput || isThinking) return;

    const selectedMode = activeMode;
    const filesToSend = selectedFiles;

    const userMessage = {
      id: Date.now(),
      role: "user",
      content: cleanInput,
      mode: "",
      fileNames: getFileNamesText(filesToSend),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsThinking(true);

    try {
      const reply = await callBackend({ cleanInput, selectedMode, files: filesToSend });

      const aiMessage = {
        id: Date.now() + 1,
        role: "ai",
        content: reply,
        mode: selectedMode,
      };

      setMessages((prev) => [...prev, aiMessage]);
      setSelectedFiles([]);
    } catch (error) {
      console.error("Nexus AI API Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "ai",
          content:
            "Backend se connect nahi ho pa raha. Please check karo ki API server running hai.",
          mode: selectedMode,
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleTutorMode = async (aiMessage) => {
    if (isThinking || !aiMessage) return;

    const aiIndex = messages.findIndex((msg) => msg.id === aiMessage.id);
    const previousUserMessage = [...messages]
      .slice(0, aiIndex)
      .reverse()
      .find((msg) => msg.role === "user");

    if (!previousUserMessage) return;

    const currentStyleIndex = tutorStyleIndex;
    setTutorStyleIndex((prev) => prev + 1);
    setIsThinking(true);

    try {
      const reply = await callBackend({
        cleanInput: `Tutor Mode: Teach this topic differently - ${previousUserMessage.content}`,
        selectedMode: "tutor",
        files: [],
        extra: {
          previousQuestion: previousUserMessage.content,
          previousAnswer: aiMessage.content,
          tutorStyleIndex: currentStyleIndex,
        },
      });

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "ai",
          content: reply,
          mode: "tutor",
        },
      ]);
    } catch (error) {
      console.error("Tutor Mode failed:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "ai",
          content: "Tutor Mode response generate nahi ho paaya. Please thodi der baad try karo.",
          mode: "tutor",
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleRegenerate = async () => {
    if (isThinking || !lastAiMessageId) return;

    const lastAiIndex = messages.findIndex((msg) => msg.id === lastAiMessageId);
    const previousUserMessage = [...messages]
      .slice(0, lastAiIndex)
      .reverse()
      .find((msg) => msg.role === "user");

    const lastAiMessage = messages.find((msg) => msg.id === lastAiMessageId);
    if (!previousUserMessage || !lastAiMessage) return;

    const selectedMode = lastAiMessage.mode || "";
    const cleanInput = previousUserMessage.content;

    setMessages((prev) => prev.filter((msg) => msg.id !== lastAiMessageId));
    setIsThinking(true);

    try {
      const reply = await callBackend({ cleanInput, selectedMode, files: [] });
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "ai",
          content: reply,
          mode: selectedMode,
        },
      ]);
    } catch (error) {
      console.error("Regenerate failed:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "ai",
          content: "Response regenerate nahi ho paaya. Please thodi der baad try karo.",
          mode: selectedMode,
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleCopy = async (messageId, content) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  const handleFileSelect = (event) => {
    const newFiles = Array.from(event.target.files || []);

    if (newFiles.length > 0) {
      setSelectedFiles((prev) => {
        const combined = [...prev, ...newFiles];
        const uniqueByName = combined.filter(
          (file, index, arr) =>
            arr.findIndex((item) => item.name === file.name && item.size === file.size) === index
        );
        return uniqueByName.slice(0, 5);
      });

      if (!activeMode) setActiveMode("deep-search");
    }

    event.target.value = "";
  };

  const removeSelectedFile = (indexToRemove) => {
    setSelectedFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const clearPdfSessionMemory = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/session/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
    } catch (error) {
      console.error("Failed to clear PDF session:", error);
    }

    const nextSessionId = createSessionId();
    setSessionId(nextSessionId);
    setSessionFiles([]);
    setSelectedFiles([]);
  };

  const handleNewChat = async () => {
    const newChat = createConversation();

    setConversations((prev) => [newChat, ...prev]);
    setCurrentConversationId(newChat.id);
    setMessages([]);
    setInput("");
    setActiveMode("");
    setSelectedFiles([]);
    setSessionId(newChat.sessionId);
    setSessionFiles([]);
    setIsThinking(false);

    await insertConversationToCloud(newChat);
  };

  const openConversation = (chat) => {
    if (isThinking) return;

    setCurrentConversationId(chat.id);
    setMessages(chat.messages || []);
    setSessionId(chat.sessionId || createSessionId());
    setSessionFiles(chat.sessionFiles || []);
    setInput("");
    setActiveMode("");
    setSelectedFiles([]);
  };

  const deleteConversation = async (chatId, event) => {
    event.stopPropagation();

    const chatToDelete = conversations.find((chat) => chat.id === chatId);

    if (chatToDelete?.sessionId) {
      try {
        await fetch(`${API_BASE_URL}/api/session/${encodeURIComponent(chatToDelete.sessionId)}`, {
          method: "DELETE",
        });
      } catch (error) {
        console.error("Failed to delete chat PDF session:", error);
      }
    }

    if (user) {
      const { error } = await supabase
        .from("conversations")
        .delete()
        .eq("id", chatId)
        .eq("user_id", user.id);

      if (error) console.error("Failed to delete conversation:", error);
    }

    const remaining = conversations.filter((chat) => chat.id !== chatId);

    if (remaining.length === 0) {
      const newChat = createConversation();
      setConversations([newChat]);
      setCurrentConversationId(newChat.id);
      setMessages([]);
      setSessionId(newChat.sessionId);
      setSessionFiles([]);
      await insertConversationToCloud(newChat);
      return;
    }

    setConversations(remaining);

    if (chatId === currentConversationId) {
      openConversation(remaining[0]);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();

    if (!feedbackText.trim()) {
      setFeedbackMessage("Please write your feedback first.");
      return;
    }

    setFeedbackLoading(true);
    setFeedbackMessage("");

    try {
      const { error } = await supabase.from("feedback").insert({
        user_id: user.id,
        email: user.email,
        message: feedbackText.trim(),
      });

      if (error) throw error;

      setFeedbackText("");
      setFeedbackMessage("Thank you! Your feedback has been submitted.");

      setTimeout(() => {
        setShowFeedback(false);
        setFeedbackMessage("");
      }, 1200);
    } catch (error) {
      console.error("Feedback submit failed:", error);
      setFeedbackMessage(error.message || "Feedback submit failed. Please try again.");
    } finally {
      setFeedbackLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 text-slate-600">
        Loading Nexus AI...
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  if (!cloudLoaded) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 text-slate-600">
        Loading your workspace...
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-50 text-slate-900 flex">
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-0"
        } bg-slate-950 text-slate-300 h-full flex flex-col transition-all duration-300 overflow-hidden`}
      >
        <div className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/40 shrink-0">
            <Brain size={18} className="text-white" />
          </div>

          <div className="min-w-0">
            <h1 className="text-sm leading-none text-white font-bold">Nexus AI</h1>
            <p className="text-[10px] text-slate-500 font-medium mt-1">Learn Smarter</p>
          </div>
        </div>

        <div className="px-4 mb-5">
          <button
            onClick={handleNewChat}
            className="w-full py-3 px-4 rounded-xl border border-slate-800 flex items-center gap-3 hover:bg-slate-900 transition text-sm font-medium text-white"
          >
            <Plus size={16} />
            New Chat
          </button>
        </div>

        <div className="px-4 mb-4">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-500 transition"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-1">
          <p className="px-2 text-[10px] uppercase font-bold text-slate-600 mb-2 tracking-widest">
            Recent
          </p>

          {sortedConversations.map((chat) => {
            const isActive = chat.id === currentConversationId;

            return (
              <button
                key={chat.id}
                onClick={() => openConversation(chat)}
                className={`group w-full flex items-center gap-3 p-2 rounded-lg transition text-sm text-left ${
                  isActive ? "bg-slate-900 text-white" : "hover:bg-slate-900 text-slate-300"
                }`}
              >
                <MessageSquare size={14} className="text-slate-600 shrink-0" />

                <div className="flex-1 min-w-0">
                  <div className="truncate">{chat.title}</div>
                  <div className="text-[10px] text-slate-600 mt-0.5 flex items-center gap-2">
                    <span>{formatChatTime(chat.updatedAt)}</span>
                    {chat.sessionFiles?.length > 0 && <span>{chat.sessionFiles.length} PDFs</span>}
                  </div>
                </div>

                <span
                  onClick={(event) => deleteConversation(chat.id, event)}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition"
                  title="Delete chat"
                >
                  <X size={13} />
                </span>
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-900">
          <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-900 cursor-pointer transition">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {user.email?.[0]?.toUpperCase() || "S"}
            </div>

            <div className="flex-1 truncate">
              <p className="text-sm font-medium text-white truncate">Student User</p>
              <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
              <button
                onClick={handleSignOut}
                className="text-[10px] text-slate-500 hover:text-red-400 transition"
              >
                Sign out
              </button>
            </div>

            <Settings size={15} className="text-slate-600 shrink-0" />
          </div>
        </div>
      </aside>

      <main className="flex-1 h-full flex flex-col relative bg-[radial-gradient(circle_at_center,#ffffff_0%,#f8fafc_65%,#eef2ff_100%)]">
        <header className="h-16 flex items-center justify-between px-5 md:px-6 border-b border-slate-200/70 bg-white/70 backdrop-blur-xl">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition"
            title="Toggle Sidebar"
          >
            <Menu size={20} />
          </button>

          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <Sparkles size={16} className="text-indigo-600" />
            Nexus AI Intelligence
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                window.location.href = "/about.html";
              }}
              className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-4 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 hover:shadow-sm transition"
              title="About Nexus AI"
            >
              <Sparkles size={14} />
              About
            </button>

            <button
              onClick={() => setShowFeedback(true)}
              className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 hover:shadow-sm transition"
              title="Send Feedback"
            >
              <MessageSquare size={14} />
              Feedback
            </button>
          </div>
        </header>

        <section className="flex-1 overflow-y-auto px-4 md:px-8 pb-72">
          <div className="max-w-3xl mx-auto space-y-7 py-10">
            {messages.length === 0 && (
              <div className="text-center space-y-6 py-12">
                <div className="w-16 h-16 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-indigo-200 rotate-3">
                  <GraduationCap size={30} />
                </div>

                <div>
                  <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">
                    What do you want to learn today?
                  </h2>
                  <p className="text-slate-500 max-w-md mx-auto mt-3 leading-relaxed">
                    Ask anything about studies, generate professional notes, create PPTs, understand code, search your PDFs, or learn visually.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 max-w-3xl mx-auto pt-4">
                  <button
                    onClick={() => {
                      setActiveMode("exam");
                      setInput(
                        "Based on uploaded PDFs, give important questions, high priority topics, long questions, short questions, diagrams/numericals, 7-day study plan, and final exam strategy. Mention source file names."
                      );
                    }}
                    className="bg-white border border-slate-200 rounded-2xl p-4 text-left hover:border-indigo-300 hover:shadow-md transition"
                  >
                    <p className="text-sm font-semibold text-slate-800">Important Questions</p>
                    <p className="text-xs text-slate-500 mt-1">Exam-focused list</p>
                  </button>

                  <button
                    onClick={() => {
                      setActiveMode("exam");
                      setInput("Analyze uploaded PYQs and tell repeated topics, most probable questions, and exam strategy.");
                    }}
                    className="bg-white border border-slate-200 rounded-2xl p-4 text-left hover:border-indigo-300 hover:shadow-md transition"
                  >
                    <p className="text-sm font-semibold text-slate-800">PYQ Analysis</p>
                    <p className="text-xs text-slate-500 mt-1">Repeated topics</p>
                  </button>

                  <button
                    onClick={() => {
                      setActiveMode("exam");
                      setInput("Create a 7-day study plan from uploaded PDFs for exam preparation.");
                    }}
                    className="bg-white border border-slate-200 rounded-2xl p-4 text-left hover:border-indigo-300 hover:shadow-md transition"
                  >
                    <p className="text-sm font-semibold text-slate-800">7-Day Study Plan</p>
                    <p className="text-xs text-slate-500 mt-1">Daily prep plan</p>
                  </button>

                  <button
                    onClick={() => {
                      setActiveMode("notes");
                      setInput("Create concise revision notes from uploaded PDFs for exam preparation.");
                    }}
                    className="bg-white border border-slate-200 rounded-2xl p-4 text-left hover:border-indigo-300 hover:shadow-md transition"
                  >
                    <p className="text-sm font-semibold text-slate-800">Revision Notes</p>
                    <p className="text-xs text-slate-500 mt-1">Quick revision</p>
                  </button>
                </div>
              </div>
            )}

            {messages.map((message) => {
              const isUser = message.role === "user";

              return (
                <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start gap-3"}`}>
                  {!isUser && (
                    <div className="w-9 h-9 bg-white border border-slate-200 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-1">
                      <Brain size={16} className="text-indigo-600" />
                    </div>
                  )}

                  <div
                    className={`${
                      isUser
                        ? "bg-indigo-600 text-white rounded-2xl rounded-tr-md max-w-[85%]"
                        : "bg-white text-slate-700 rounded-2xl rounded-tl-md max-w-[90%] border border-slate-200"
                    } px-5 py-4 shadow-sm leading-relaxed`}
                  >
                    {message.fileNames && (
                      <div className="mb-2 text-[11px] opacity-80 flex items-center gap-1">
                        <Paperclip size={12} />
                        {message.fileNames}
                      </div>
                    )}

                    {!isUser && message.mode && (
                      <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-1 mb-3 bg-indigo-50 text-indigo-600">
                        {getModeLabel(message.mode)}
                      </div>
                    )}

                    {isUser ? (
                      <div className="whitespace-pre-wrap text-sm md:text-[15px]">{message.content}</div>
                    ) : (
                      <>
                        <MarkdownMessage content={message.content} />

                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-4">
                          <button
                            onClick={() => handleCopy(message.id, message.content)}
                            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 transition"
                          >
                            {copiedId === message.id ? (
                              <>
                                <Check size={14} /> Copied
                              </>
                            ) : (
                              <>
                                <Copy size={14} /> Copy
                              </>
                            )}
                          </button>

                          {message.id === lastAiMessageId && (
                            <button
                              onClick={handleRegenerate}
                              disabled={isThinking}
                              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 disabled:opacity-50 transition"
                            >
                              <RotateCcw size={14} />
                              Regenerate
                            </button>
                          )}

                          <button
                            onClick={() => handleTutorMode(message)}
                            disabled={isThinking}
                            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 disabled:opacity-50 transition"
                          >
                            <Brain size={14} />
                            Tutor Mode
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {isThinking && (
              <div className="flex justify-start gap-3">
                <div className="w-9 h-9 bg-white border border-slate-200 rounded-full flex items-center justify-center shrink-0 shadow-sm">
                  <Brain size={16} className="text-indigo-600" />
                </div>

                <div className="bg-white text-slate-500 px-5 py-4 rounded-2xl rounded-tl-md shadow-sm border border-slate-200 flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-indigo-600" />
                  <span className="text-sm">Nexus AI is thinking...</span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        </section>

        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
          <div className="max-w-3xl mx-auto">
            {(sessionFiles.length > 0 || activeModeData || selectedFiles.length > 0) && (
              <div className="mb-3 space-y-2">
                {sessionFiles.length > 0 && (
                  <div className="rounded-2xl border border-indigo-100 bg-white/90 shadow-sm p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
                        <Database size={14} />
                        PDFs stored in this chat ({sessionFiles.length})
                      </div>
                      <button
                        onClick={clearPdfSessionMemory}
                        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 transition"
                      >
                        <Trash2 size={13} />
                        Clear PDFs
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {sessionFiles.map((file, index) => (
                        <div
                          key={`${file.fileName}-${index}`}
                          className="inline-flex items-center gap-2 rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1.5 text-xs text-indigo-700"
                        >
                          <Paperclip size={13} />
                          <span className="max-w-[180px] truncate">{file.fileName}</span>
                          <span className="text-indigo-400">{file.chars} chars</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {activeModeData && (
                    <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
                      {ActiveModeIcon && <ActiveModeIcon size={14} />}
                      {activeModeData.label} mode active
                      <button
                        onClick={() => setActiveMode("")}
                        className="rounded-full hover:bg-indigo-100 p-0.5"
                        title="Clear mode"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}

                  {selectedFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${file.size}-${index}`}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm"
                    >
                      <Paperclip size={14} />
                      <span className="max-w-[180px] truncate">{file.name}</span>
                      <span className="text-slate-400">{(file.size / 1024 / 1024).toFixed(1)}MB</span>
                      <button
                        onClick={() => removeSelectedFile(index)}
                        className="rounded-full hover:bg-slate-100 p-0.5"
                        title="Remove file"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white/95 backdrop-blur-xl border border-slate-200 rounded-2xl shadow-2xl shadow-slate-200/70 p-3 flex items-end gap-3">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.txt"
                multiple
                onChange={handleFileSelect}
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-10 h-10 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition flex items-center justify-center shrink-0"
                title="Attach PDFs/TXT files"
              >
                <Paperclip size={20} />
              </button>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={activeMode ? modePlaceholders[activeMode] : "Ask anything about studies..."}
                className="flex-1 max-h-32 resize-none bg-transparent outline-none text-slate-800 placeholder:text-slate-400 py-2"
              />

              <button
                onClick={handleSend}
                disabled={!input.trim() || isThinking}
                className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white transition flex items-center justify-center shadow-lg shadow-indigo-200 shrink-0"
              >
                <ArrowUp size={20} />
              </button>
            </div>

            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {modes.map((mode) => {
                const Icon = mode.icon;
                const isActive = activeMode === mode.id;

                return (
                  <button
                    key={mode.id}
                    onClick={() => setActiveMode(isActive ? "" : mode.id)}
                    className={`px-4 py-2 rounded-full border text-xs font-semibold transition-all flex items-center gap-2 ${
                      isActive
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200"
                        : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
                    }`}
                  >
                    <Icon size={14} />
                    {mode.label}
                  </button>
                );
              })}
            </div>

            {activeMode && (
              <p className="text-center text-xs text-slate-500 mt-3">
                {activeMode === "notes" && "Notes mode active: Nexus AI will create clean revision notes."}
                {activeMode === "ppt" && "PPT mode active: Nexus AI will generate slide-by-slide content."}
                {activeMode === "coding" && "Coding mode active: Nexus AI will explain code, dry run, output and logic."}
                {activeMode === "deep-search" && "Deep Search active: upload PDFs once, then ask multiple questions in this chat."}
                {activeMode === "exam" && "Exam Mode active: Nexus AI will create important questions, PYQ analysis, study plan, and revision strategy."}
                {activeMode === "tutor" && "Tutor Mode active: Nexus AI will teach the same concept in multiple different ways."}
                {activeMode === "visual" && "Visual Explain active: Nexus AI will explain using diagrams, flowcharts and analogies."}
              </p>
            )}
          </div>
        </div>
      </main>

      {showFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg rounded-3xl bg-white border border-slate-200 shadow-2xl shadow-slate-900/20 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 text-white flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Feedback for Nexus AI</h2>
                <p className="text-sm text-indigo-100 mt-1">Tell us what to improve, what is missing, or what helped you.</p>
              </div>
              <button
                onClick={() => {
                  setShowFeedback(false);
                  setFeedbackMessage("");
                }}
                className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/10 hover:bg-white/20 transition"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitFeedback} className="p-6 space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-700">Your feedback</label>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  rows={6}
                  placeholder="Example: Exam Mode is useful, but add subject selector..."
                  className="mt-2 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-500 leading-relaxed">
                Logged in as: <span className="font-semibold text-slate-700">{user.email}</span>
              </div>

              {feedbackMessage && (
                <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {feedbackMessage}
                </p>
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowFeedback(false);
                    setFeedbackMessage("");
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={feedbackLoading}
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300 transition"
                >
                  {feedbackLoading ? "Submitting..." : "Submit Feedback"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
