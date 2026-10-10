'use client';

import React, { useEffect, useState, useCallback } from 'react';

const PILLARS = [
  {
    id: 'p1',
    emoji: '💼',
    color: 'border-blue-500',
    bg: 'bg-blue-950/30',
    badge: 'text-blue-400 bg-blue-950 border-blue-800',
    name: 'Pillar 1: Business Model',
    desc: 'AI channels · hyperpersonalization · data monetization',
    agents: ['CSO', 'Gooru Agent', 'Sales Agent'],
  },
  {
    id: 'p2',
    emoji: '⚙️',
    color: 'border-green-500',
    bg: 'bg-green-950/30',
    badge: 'text-green-400 bg-green-950 border-green-800',
    name: 'Pillar 2: Operating Model',
    desc: 'AI-first workflows · human+AI teams · zero-marginal-cost scaling',
    agents: ['COO', 'PABK Agent', 'FCP Agent', 'Physiorehab Agent', 'Gema Mobil Agent'],
  },
  {
    id: 'p3',
    emoji: '🏛️',
    color: 'border-amber-500',
    bg: 'bg-amber-950/30',
    badge: 'text-amber-400 bg-amber-950 border-amber-800',
    name: 'Pillar 3: Governance',
    desc: 'Real-time decision control · 5 CEO approval gates',
    agents: ['Corporate Secretary'],
    gates: ['Budget > 50M IDR', 'New Hiring', 'External Contracts', 'Production Deployments', 'Strategic Pivots'],
  },
  {
    id: 'p4',
    emoji: '🧑‍🤝‍🧑',
    color: 'border-purple-500',
    bg: 'bg-purple-950/30',
    badge: 'text-purple-400 bg-purple-950 border-purple-800',
    name: 'Pillar 4: Workforce & Culture',
    desc: 'Humans as AI orchestrators · reskilling · human-AI culture',
    agents: ['Personal Assistant', 'HR Agent'],
  },
  {
    id: 'p5',
    emoji: '🔧',
    color: 'border-red-500',
    bg: 'bg-red-950/30',
    badge: 'text-red-400 bg-red-950 border-red-800',
    name: 'Pillar 5: Technology & Data',
    desc: 'AI agent infrastructure · data platform · scale',
    agents: ['CTO Platform', 'Platform Agent', 'Security Agent', 'Data Agent', 'Marketing Agent'],
  },
];

type LiveAgent = { id: string; name: string; role?: string };

export function GenerateCompanyView() {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [logs, setLogs] = useState<{ text: string; type: string }[]>([]);
  const [liveAgents, setLiveAgents] = useState<LiveAgent[]>([]);

  const addLog = useCallback((text: string, type = 'info') => {
    setLogs((l) => [{ text: `[${new Date().toLocaleTimeString()}] ${text}`, type }, ...l].slice(0, 100));
  }, []);

  useEffect(() => {
    setStatus('connecting');
    const ws = new WebSocket('ws://localhost:18789');

    ws.onopen = () => {
      setStatus('connected');
      addLog('Connected to ws://localhost:18789', 'success');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'res' && data.payload?.agents) {
          setLiveAgents(data.payload.agents);
          addLog(`Loaded ${data.payload.agents.length} agents`, 'success');
        }
      } catch {
        addLog(`Raw: ${event.data}`, 'info');
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      addLog('Connection closed', 'warn');
    };

    return () => ws.close();
  }, [addLog]);

  const liveMap = new Map(liveAgents.map((a) => [a.name, a]));
  const totalAgents = PILLARS.reduce((s, p) => s + p.agents.length, 0);

  const statusColor =
    status === 'connected' ? 'text-green-400' :
    status === 'connecting' ? 'text-yellow-400' : 'text-red-400';

  const statusLabel =
    status === 'connected' ? 'Connected' :
    status === 'connecting' ? 'Connecting…' : 'Disconnected';

  return (
    <div className="p-6 max-w-5xl mx-auto text-foreground">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Agentic Organization</h1>
        <p className="text-muted-foreground text-sm mt-1">
          McKinsey 5-Pillar Framework · CEO: <strong>Faza</strong> (Above the Loop) · {totalAgents} agents
        </p>
      </div>

      {/* Status bar */}
      <div className="mb-6 p-3 bg-card border rounded-lg flex items-center justify-between text-sm">
        <div>
          <span className="text-muted-foreground">Gateway: </span>
          <span className={statusColor}>{statusLabel}</span>
          <span className="text-muted-foreground ml-4">Active agents: </span>
          <span className="font-bold">{liveAgents.length}</span>
          <span className="text-muted-foreground"> / {totalAgents}</span>
        </div>
        <div className="text-muted-foreground text-xs">ws://localhost:18789</div>
      </div>

      {/* CEO */}
      <div className="mb-4 p-4 bg-yellow-950/20 border border-yellow-800/50 rounded-lg flex items-start gap-3">
        <span className="text-2xl">👑</span>
        <div>
          <div className="font-bold flex items-center gap-2">
            CEO — Faza
            <span className="text-xs bg-yellow-900/50 text-yellow-400 border border-yellow-700/50 px-2 py-0.5 rounded-full">
              Above the Loop
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">Human orchestrator · Controls all 5 pillars · 5 approval gates active</div>
        </div>
      </div>

      {/* 5 Pillars */}
      <div className="space-y-3">
        {PILLARS.map((pillar) => {
          const activeCount = pillar.agents.filter((n) => liveMap.has(n)).length;
          return (
            <div key={pillar.id} className={`border-l-4 ${pillar.color} ${pillar.bg} rounded-lg overflow-hidden`}>
              <div className="p-3 flex items-center gap-2">
                <span className="text-lg">{pillar.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                    {pillar.name}
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${pillar.badge}`}>
                      {activeCount}/{pillar.agents.length} active
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{pillar.desc}</div>
                </div>
              </div>

              <div className="border-t border-white/5 divide-y divide-white/5">
                {pillar.agents.map((agentName) => {
                  const live = liveMap.get(agentName);
                  return (
                    <div key={agentName} className="px-4 py-2 flex items-center gap-2 text-sm">
                      <span className={live ? 'text-green-400' : 'text-muted-foreground/40'}>●</span>
                      <span className={live ? 'font-medium' : 'text-muted-foreground/60'}>{agentName}</span>
                      {live?.role && (
                        <span className="text-xs text-muted-foreground ml-1">— {live.role}</span>
                      )}
                      {!live && (
                        <span className="text-xs text-muted-foreground/40 ml-auto">not spawned</span>
                      )}
                    </div>
                  );
                })}

                {pillar.gates && (
                  <div className="px-4 py-2">
                    <div className="text-xs text-muted-foreground mb-1">Approval Gates:</div>
                    <div className="flex flex-wrap gap-1">
                      {pillar.gates.map((g) => (
                        <span key={g} className="text-xs bg-red-950/50 text-red-400 border border-red-900/50 px-2 py-0.5 rounded-full">
                          🔒 {g}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Log */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Event Log</h2>
        <div className="h-40 overflow-y-auto bg-black/60 text-xs p-3 rounded-lg font-mono space-y-0.5">
          {logs.length === 0 && <div className="text-muted-foreground">Waiting for events…</div>}
          {logs.map((l, i) => (
            <div key={i} className={
              l.type === 'success' ? 'text-green-400' :
              l.type === 'error' ? 'text-red-400' :
              l.type === 'warn' ? 'text-yellow-400' : 'text-blue-400'
            }>{l.text}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
