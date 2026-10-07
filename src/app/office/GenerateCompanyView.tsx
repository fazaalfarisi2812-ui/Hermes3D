'use client';

import React, { useEffect, useState } from 'react';

export function GenerateCompanyView() {
  const [status, setStatus] = useState('Disconnected');
  const [logs, setLogs] = useState<string[]>([]);
  const [companyData, setCompanyData] = useState<any>(null);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:18789');

    ws.onopen = () => {
      setStatus('Connected to Hermes Gateway');
      setLogs((l) => [...l, 'Connected to ws://localhost:18789']);
      ws.send(JSON.stringify({ type: 'get_status' }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLogs((l) => [...l, `Received: ${event.data}`]);
        if (data.type === 'status' || data.company) {
          setCompanyData(data.company || data);
        }
      } catch (e) {
        setLogs((l) => [...l, `Raw: ${event.data}`]);
      }
    };

    ws.onclose = () => {
      setStatus('Disconnected');
      setLogs((l) => [...l, 'Connection closed']);
    };

    return () => {
      ws.close();
    };
  }, []);

  const triggerGeneration = () => {
    setLogs((l) => [...l, 'Triggering company structure generation...']);
    // Send command to adapter
  };

  return (
    <div className="p-8 max-w-6xl mx-auto text-foreground">
      <h1 className="text-3xl font-bold mb-4">Hermes3D Corporate Command Center</h1>
      <div className="mb-4 p-4 bg-card border rounded shadow flex justify-between items-center">
        <div>
          <span className="font-semibold">Gateway Status: </span>
          <span className={status.includes('Connected') ? 'text-green-500' : 'text-yellow-500'}>{status}</span>
        </div>
        <button
          onClick={triggerGeneration}
          className="bg-primary text-primary-foreground px-4 py-2 rounded font-medium hover:opacity-90"
        >
          Initialize Division Teams
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-4 bg-card border rounded shadow">
          <h2 className="text-xl font-semibold mb-3">Divisions & Active Projects</h2>
          <ul className="space-y-2">
            <li className="p-2 bg-muted rounded">
              <strong>1. AI Products Division</strong>: Gooru AI Tutor
            </li>
            <li className="p-2 bg-muted rounded">
              <strong>2. ERP Services Division</strong>: PABK, Farrel, Physiorehab, Gema Mobil
            </li>
            <li className="p-2 bg-muted rounded">
              <strong>3. Platform & Infra Division</strong>: Core Systems & DevOps
            </li>
            <li className="p-2 bg-muted rounded">
              <strong>4. Growth Division</strong>: Marketing, Sales & OKRs
            </li>
          </ul>
        </div>

        <div className="p-4 bg-card border rounded shadow">
          <h2 className="text-xl font-semibold mb-3">Live Event Log</h2>
          <div className="h-64 overflow-y-auto bg-black text-green-400 p-3 font-mono text-xs rounded">
            {logs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
