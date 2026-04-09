"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const THINKING_WORDS = [
  "Thinking",
  "Querying data",
  "Analyzing",
  "Crunching numbers",
  "Benchmarking",
  "Evaluating partnerships",
  "Scanning portfolios",
  "Mapping opportunities",
  "Processing",
  "Connecting dots",
  "Valuing activations",
  "Auditing performance",
  "Comparing markets",
  "Running the numbers",
  "Building insights",
];

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinkingWord, setThinkingWord] = useState(THINKING_WORDS[0]);
  const [elapsed, setElapsed] = useState(0);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Restore password from sessionStorage or check if auth is needed
  useEffect(() => {
    const saved = sessionStorage.getItem("elcaptain_password");
    if (saved) {
      setPassword(saved);
      return;
    }
    // Probe the API to see if auth is required
    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "ping" }] }),
    }).then((res) => {
      if (res.status === 401) setNeedsAuth(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!loading) { setElapsed(0); return; }
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    if (!loading) return;
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % THINKING_WORDS.length;
      setThinkingWord(THINKING_WORDS[i]);
    }, 20000);
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  async function sendMessages(msgs: Message[], currentPassword: string) {
    setLoading(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (currentPassword) {
        headers["Authorization"] = `Bearer ${currentPassword}`;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ messages: msgs }),
      });

      if (res.status === 401) {
        setNeedsAuth(true);
        setPendingMessage(msgs[msgs.length - 1].content);
        // Remove the user message we just added since we can't process it yet
        setMessages(msgs.slice(0, -1));
        return;
      }

      const data = await res.json();
      setMessages([
        ...msgs,
        { role: "assistant", content: data.response },
      ]);
    } catch {
      setMessages([
        ...msgs,
        {
          role: "assistant",
          content: "Error connecting to the API. Is the server running?",
        },
      ]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: Message = { role: "user", content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");

    await sendMessages(newMessages, password);
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pwd = password.trim();
    if (!pwd) return;

    setAuthError(false);
    setLoading(true);

    try {
      // Validate password with a lightweight probe
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${pwd}`,
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "ping" }] }),
      });

      if (res.status === 401) {
        setAuthError(true);
        setLoading(false);
        return;
      }

      // Password correct — save and close overlay
      sessionStorage.setItem("elcaptain_password", pwd);
      setPassword(pwd);
      setNeedsAuth(false);

      // If there was a pending message, replay it
      if (pendingMessage) {
        const userMessage: Message = { role: "user", content: pendingMessage };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setPendingMessage(null);
        const data = await res.json();
        setMessages([...newMessages, { role: "assistant", content: data.response }]);
      }
    } catch {
      setAuthError(true);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white text-zinc-900">
      {/* Header */}
      <header className="border-b border-zinc-200 px-6 py-3 flex-shrink-0 flex items-center justify-between">
        <img
          src="/elcaptain-color.png"
          alt="ElCaptain — powered by horizm"
          className="h-10"
        />
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
          >
            Clear Context
          </button>
        )}
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <img
                src="/elcaptain-color.png"
                alt="ElCaptain"
                className="h-16 mx-auto mb-6"
              />
              <p className="text-zinc-500 mb-6">
                Benchmark performance, spot underpriced opportunities, and
                reallocate with confidence — backed by real data from 15K+
                teams and creators across 128 countries.
              </p>
              <div className="flex flex-col gap-2 text-sm text-zinc-400">
                <p className="italic">
                  &quot;Which athletes in the UK are generating the highest ROI
                  relative to their audience size?&quot;
                </p>
                <p className="italic">
                  &quot;I have $200K to invest in creator partnerships in
                  Brazil. Where should I allocate it?&quot;
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-gradient-to-r from-[#E63371] to-[#7B1FA2] text-white"
                    : "bg-zinc-100 text-zinc-900 prose prose-sm prose-zinc max-w-none [&>hr]:my-4"
                }`}
              >
                {m.role === "user" ? (
                  <span className="whitespace-pre-wrap">{m.content}</span>
                ) : (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      table: ({ children }) => (
                        <div className="overflow-x-auto my-2">
                          <table className="min-w-full text-xs border-collapse">
                            {children}
                          </table>
                        </div>
                      ),
                      th: ({ children }) => (
                        <th className="border border-zinc-300 bg-zinc-200 px-2 py-1 text-left font-semibold">
                          {children}
                        </th>
                      ),
                      td: ({ children }) => (
                        <td className="border border-zinc-300 px-2 py-1">
                          {children}
                        </td>
                      ),
                      code: ({ className, children }) => {
                        const content = String(children).trim();
                        if (className === "language-html" && content.includes("<")) {
                          return (
                            <iframe
                              srcDoc={content}
                              className="w-full rounded-lg border border-zinc-200 my-2"
                              style={{ height: "420px" }}
                              sandbox="allow-scripts"
                            />
                          );
                        }
                        return (
                          <code className={`${className || ""} bg-zinc-200 px-1 py-0.5 rounded text-xs`}>
                            {children}
                          </code>
                        );
                      },
                      pre: ({ children }) => <>{children}</>,
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-zinc-100 rounded-2xl px-4 py-3 text-sm text-zinc-400">
                <span className="animate-pulse">{thinkingWord}...</span>
                <span className="text-zinc-400 ml-2 text-xs">{elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`}</span>
              </div>
            </div>
          )}

          <div ref={messagesEnd} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-zinc-200 px-6 py-4 flex-shrink-0">
        <form
          onSubmit={handleSubmit}
          className="max-w-3xl mx-auto flex gap-3 items-end"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about partnerships, ROI, benchmarks, or budget allocation..."
            rows={1}
            className="flex-1 resize-none rounded-xl bg-zinc-50 border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-[#E63371] focus:ring-1 focus:ring-[#E63371]"
            style={{ maxHeight: "200px" }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl bg-gradient-to-r from-[#E63371] to-[#7B1FA2] px-5 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            Send
          </button>
        </form>
      </div>

      {/* Auth overlay */}
      {needsAuth && (
        <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
          <div className="max-w-sm w-full mx-4">
            <img
              src="/elcaptain-color.png"
              alt="ElCaptain"
              className="h-12 mx-auto mb-6"
            />
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setAuthError(false); }}
                placeholder="Enter password"
                autoFocus
                className="w-full rounded-xl bg-zinc-50 border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-[#E63371] focus:ring-1 focus:ring-[#E63371]"
              />
              {authError && (
                <p className="text-sm text-red-500">Incorrect password</p>
              )}
              <button
                type="submit"
                disabled={loading || !password.trim()}
                className="w-full rounded-xl bg-gradient-to-r from-[#E63371] to-[#7B1FA2] px-5 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {loading ? "Verifying..." : "Access"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
