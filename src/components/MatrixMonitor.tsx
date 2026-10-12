"use client";
import { useEffect, useState, useRef } from "react";

export function MatrixMonitor() {
  const [messages, setMessages] = useState<string[]>([]);
  const [min, setMin] = useState(false);
  const [pos, setPos] = useState({ x: 20, y: 20 });
  const dragRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/mailbox");
        const data = await res.json();
        if (data.messages) setMessages(data.messages);
      } catch (e) {}
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, initX: pos.x, initY: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPos({
      x: dragRef.current.initX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.initY + (e.clientY - dragRef.current.startY)
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
  };

  return (
    <div style={{
      position: 'fixed', top: pos.y, left: pos.x, zIndex: 9999,
      backgroundColor: 'rgba(0,0,0,0.8)', color: '#0f0',
      borderRadius: '8px', border: '1px solid #333',
      fontFamily: 'monospace', fontSize: '12px', width: '350px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
    }}>
      <div 
        onPointerDown={handlePointerDown} 
        onPointerMove={handlePointerMove} 
        onPointerUp={handlePointerUp}
        style={{ padding: '8px', cursor: 'move', backgroundColor: '#222', borderRadius: min ? '8px' : '8px 8px 0 0', display: 'flex', justifyContent: 'space-between', userSelect: 'none' }}
      >
        <span style={{color: '#fff', fontWeight: 'bold'}}>P2P Matrix Monitor</span>
        <button onPointerDown={(e)=> e.stopPropagation()} onClick={() => setMin(!min)} style={{background:'none', border:'none', color:'#fff', cursor:'pointer'}}>{min ? 'Buka' : 'Tutup'}</button>
      </div>
      {!min && (
        <div style={{ padding: '10px', maxHeight: '300px', overflowY: 'auto' }}>
          {messages.length === 0 ? <div>No messages yet...</div> : null}
          {messages.map((m, i) => (
            <div key={i} style={{ borderBottom: '1px solid #222', padding: '4px 0' }}>{m}</div>
          ))}
        </div>
      )}
    </div>
  );
}
