"use client";

import { useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";

type P2PMessage = {
  id: number;
  from: string;
  to: string;
  body: string;
  raw: string;
};

const AGENT_COLORS = [
  "text-cyan-300",
  "text-emerald-300",
  "text-violet-300",
  "text-amber-300",
  "text-fuchsia-300",
  "text-sky-300",
  "text-rose-300",
  "text-teal-300",
];

const agentColorCache = new Map<string, string>();
let colorIndex = 0;

function agentColor(name: string): string {
  if (!agentColorCache.has(name)) {
    agentColorCache.set(name, AGENT_COLORS[colorIndex % AGENT_COLORS.length]);
    colorIndex++;
  }
  return agentColorCache.get(name)!;
}

function parseMessage(raw: string, id: number): P2PMessage | null {
  const match = raw.match(/^\[([^\]]+?)\s*->\s*([^\]]+?)\]\s*([\s\S]*)$/);
  if (!match) {
    return { id, from: "system", to: "*", body: raw, raw };
  }
  return { id, from: match[1].trim(), to: match[2].trim(), body: match[3].trim(), raw };
}

export function P2PMeetingRoom() {
  const [messages, setMessages] = useState<P2PMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/mailbox");
        const data: { messages?: string[]; error?: string } = await res.json();
        if (data.messages) {
          const parsed = data.messages
            .map((raw, i) => parseMessage(raw, i))
            .filter(Boolean) as P2PMessage[];
          setMessages(parsed);
          setError(null);
        }
      } catch {
        setError("Cannot reach mailbox.");
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  return (
    <div className="flex h-full flex-col bg-[#060b10]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <Users className="h-4 w-4 text-cyan-400/70" />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">
          Meeting Room
        </span>
        <span className="ml-auto font-mono text-[10px] text-white/30">
          P2P · live
        </span>
        <span
          className="ml-1 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400"
          aria-label="Live"
        />
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {error ? (
          <div className="py-6 text-center font-mono text-[11px] text-red-400/70">
            {error}
          </div>
        ) : messages.length === 0 ? (
          <div className="py-10 text-center font-mono text-[11px] text-white/25">
            No inter-agent messages yet.
            <br />
            <span className="mt-1 block text-[10px] text-white/15">
              Messages appear here when agents communicate via P2P.
            </span>
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.from === "system") {
              return (
                <div
                  key={msg.id}
                  className="my-1 rounded border border-white/5 bg-white/3 px-3 py-1.5 font-mono text-[11px] text-white/35"
                >
                  {msg.body}
                </div>
              );
            }
            return (
              <div key={msg.id} className="group mb-3 flex gap-2.5">
                {/* Avatar */}
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border border-white/10 bg-white/5 font-mono text-[10px] font-bold uppercase ${agentColor(msg.from)}`}
                >
                  {msg.from.slice(0, 1)}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  {/* Name row */}
                  <div className="mb-0.5 flex items-baseline gap-1.5">
                    <span
                      className={`font-mono text-[11px] font-semibold ${agentColor(msg.from)}`}
                    >
                      {msg.from}
                    </span>
                    <span className="font-mono text-[10px] text-white/25">→</span>
                    <span
                      className={`font-mono text-[10px] ${agentColor(msg.to)}`}
                    >
                      {msg.to}
                    </span>
                  </div>

                  {/* Body */}
                  <div className="font-mono text-[12px] leading-relaxed text-white/70">
                    {msg.body}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer note */}
      <div className="shrink-0 border-t border-white/5 px-4 py-2 font-mono text-[10px] text-white/20">
        Read-only · agents communicate autonomously via P2P matrix
      </div>
    </div>
  );
}
