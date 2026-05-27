import { useState } from "react";
import { Brain, Loader2 } from "lucide-react";
import { supabase } from "./lib/supabase";

function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleAuth = async (e) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      setMessage("Email and password required.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        setMessage("Signup successful. Please check your email if confirmation is enabled.");
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_center,#ffffff_0%,#f8fafc_65%,#eef2ff_100%)] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-2xl shadow-slate-200/80 p-8">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-200">
            <Brain size={28} />
          </div>

          <h1 className="text-3xl font-bold text-slate-900 mt-4">
            Nexus AI
          </h1>
          <p className="text-slate-500 mt-1">Learn Smarter</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              type="email"
              placeholder="student@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              type="password"
              placeholder="Minimum 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {message && (
            <p className="text-sm text-center text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold flex items-center justify-center gap-2 transition"
          >
            {loading && <Loader2 size={18} className="animate-spin" />}
            {isLogin ? "Login" : "Create Account"}
          </button>
        </form>

        <button
          onClick={() => {
            setIsLogin(!isLogin);
            setMessage("");
          }}
          className="w-full text-center text-sm text-slate-500 hover:text-indigo-600 mt-5"
        >
          {isLogin
            ? "New student? Create account"
            : "Already have an account? Login"}
        </button>
      </div>
    </div>
  );
}

export default Auth;