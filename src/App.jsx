import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings, Play, Send, ListOrdered, Trash2, Users } from "lucide-react";

/**
 * Caveman Hunt – QTE-Only MVP (single-file, **plain React/JS**)
 * --------------------------------------------------------------
 * Host creates a temporary lobby (code only), players join by code.
 * Broadcasts via BroadcastChannel with localStorage fallback.
 * Big buttons, configurable names/count, thresholds, and sequence leniency.
 * - Default buttons: 4 → Dodge, Block, Parry, Jump
 * - Results are color-coded
 * - Sequence grading supports +leniency (Perfect/Success/Close/Slow only)
 * - Glow gap between sequence steps (configurable)
 * - Host button greys out briefly on click for feedback (configurable)
 */

// -------------------- Types (JSDoc only) --------------------
/** @typedef {"HOST"|"PLAYER"} Role */
/**
 * @typedef {Object} LobbyConfig
 * @property {string} code
 * @property {number} buttonCount
 * @property {string[]} names
 * @property {{perfect:number, success:number, close:number, slow:number, timeout:number}} thresholds
 * @property {number=} leniencyMs
 * @property {number=} glowGapMs
 * @property {number=} hostFlashMs
 */

// -------------------- Bus (BroadcastChannel + storage fallback) --------------------

const mkBus = (code, relayUrl) => {
  const chanName = `caveman-qte-${code}`;
  const listeners = new Set();

  // 1) Optional WebSocket relay for cross-device
  if (relayUrl && /^wss?:\/\//i.test(relayUrl)) {
    let ws = null;
    let shouldReconnect = true;
    let backoff = 500;
    const emitStatus = (state, extra = {}) => listeners.forEach(l => l({ type: "__STATUS__", transport: "ws", room: chanName, state, relayUrl, ...extra }));

    const connect = () => {
      try { ws = new WebSocket(`${relayUrl}?room=${encodeURIComponent(chanName)}`); } catch { ws = null; }
      if (!ws) return;
      ws.onopen = () => { backoff = 500; emitStatus("open"); };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          const ev = msg && (msg.payload || msg);
          if (!msg.room || msg.room === chanName) listeners.forEach((l) => l(ev));
        } catch {}
      };
      ws.onclose = () => { if (!shouldReconnect) return; emitStatus("closed"); setTimeout(connect, Math.min(backoff, 5000)); backoff *= 1.5; };
      ws.onerror = () => { emitStatus("error"); try { ws.close(); } catch {} };
    };
    connect();

    return {
      post(ev) { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ room: chanName, payload: ev })); } catch {} },
      on(cb) { listeners.add(cb); return () => listeners.delete(cb); },
      destroy() { shouldReconnect = false; try { ws?.close(); } catch {} },
    };
  }

  // 2) Same-browser fallback: BroadcastChannel + localStorage
  /** @type {BroadcastChannel|undefined} */
  let ch;
  try { ch = new BroadcastChannel(chanName); } catch {}
  const storageKey = `${chanName}-fallback`;
  const onStorage = (e) => { if (e.key === storageKey && e.newValue) { try { const ev = JSON.parse(e.newValue); listeners.forEach((l) => l(ev)); } catch {} } };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  // Emit a status event so UI can show transport
  setTimeout(() => listeners.forEach(l => l({ type: "__STATUS__", transport: ch ? "broadcastchannel" : "storage", room: chanName, state: "open" })), 0);

  return {
    post(ev) { ch?.postMessage(ev); try { localStorage.setItem(storageKey, JSON.stringify(ev)); localStorage.removeItem(storageKey); } catch {} },
    on(cb) { listeners.add(cb); if (ch) ch.onmessage = (e) => { listeners.forEach((l) => l(e.data)); }; return () => listeners.delete(cb); },
    destroy() { if (typeof window !== "undefined") window.removeEventListener("storage", onStorage); try { ch?.close(); } catch {} },
  };
};

// -------------------- Utilities --------------------

const randomCode = (len = 5) => Array.from({ length: len }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");

/** @returns {LobbyConfig} */
function defaultConfig(code) {
  return {
    code,
    buttonCount: 4,
    names: ["Dodge", "Block", "Parry", "Jump"],
    thresholds: { perfect: 150, success: 300, close: 500, slow: 800, timeout: 1200 },
    leniencyMs: 0,
    glowGapMs: 120,
    hostFlashMs: 60,
  };
}

function gradeReaction(ms, t) {
  if (ms <= t.perfect) return "Perfect";
  if (ms <= t.success) return "Success";
  if (ms <= t.close) return "Close call";
  if (ms <= t.slow) return "Slow";
  return "Failure";
}

function gradeWithLeniency(ms, t, leniency) {
  const tt = { ...t, perfect: t.perfect + leniency, success: t.success + leniency, close: t.close + leniency, slow: t.slow + leniency };
  return gradeReaction(ms, tt);
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function layoutFor(count) {
  if (count === 2) return "grid-2";
  if (count === 3) return "grid-3"; // kept for tests; UI uses generic grid
  return "grid-else";
}

const gradeColor = (g) => {
  switch (g) {
    case "Perfect": return "bg-green-600 text-white";
    case "Success": return "bg-lime-500 text-slate-900";
    case "Close call": return "bg-yellow-400 text-slate-900";
    case "Slow": return "bg-orange-500 text-white";
    case "Failure": return "bg-red-600 text-white";
    default: return "bg-slate-300 text-slate-900";
  }
};

function time() { const d = new Date(); return d.toLocaleTimeString(); }

// -------------------- Root App --------------------

export default function QTEApp() {
  /** @type {[Role|null, Function]} */
  const [role, setRole] = useState(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [relayUrl, setRelayUrl] = useState("");
  /** @type {[LobbyConfig|null, Function]} */
  const [cfg, setCfg] = useState(null);

  const busRef = useRef(null);
  const [players, setPlayers] = useState({});
  const clientId = useMemo(() => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, []);

  // Press flash states
  const [hostPressed, setHostPressed] = useState(null); // number|null
  const [playerPressed, setPlayerPressed] = useState(null);
  const [net, setNet] = useState({ transport: null, state: "", room: "", relayUrl: "" });

  const createLobby = () => { const c = randomCode(5); const next = defaultConfig(c); setCfg(next); setCode(c); setRole("HOST"); };
  const joinLobby = () => { if (!code || !name.trim()) return; setRole("PLAYER"); };

  useEffect(() => {
    if (!code) return;
    busRef.current?.destroy?.();
    const bus = mkBus(code, relayUrl); busRef.current = bus;

    const unsub = bus.on((ev) => {
      if (ev.type === "CONFIG" && role === "PLAYER") setCfg(ev.config);
      if (role === "HOST") {
        if (ev.type === "HELLO") {
          setPlayers((p) => ({ ...p, [ev.from]: { name: ev.name, lastSeen: Date.now() } }));
          bus.post({ type: "PONG", lobby: code, from: clientId });
          if (cfg) bus.post({ type: "CONFIG", lobby: code, config: cfg });
        } else if (ev.type === "QTE_RESULT") {
          setLog((l) => [{ line: `${time()} ${ev.name} • ${cfg?.names?.[ev.index] || `Button ${ev.index + 1}`} → ${ev.grade} (${ev.rt}ms)`, grade: ev.grade }, ...l]);
        } else if (ev.type === "SEQ_STEP_RESULT") {
          setLog((l) => [{ line: `${time()} ${ev.name} • step ${ev.step + 1}: ${cfg?.names?.[ev.index] || `#${ev.index + 1}`} → ${ev.grade} (${ev.rt}ms)`, grade: ev.grade }, ...l]);
        } else if (ev.type === "SEQ_DONE") {
          setLog((l) => [{ line: `${time()} ${ev.name} • sequence done in ${ev.totalMs}ms — [${(ev.grades||[]).join(", ")}]` }, ...l]);
        }
      }
    });

    if (role === "PLAYER" && name) bus.post({ type: "HELLO", lobby: code, from: clientId, name });
    return () => { unsub?.(); };
  }, [code, role, name, cfg?.code]);

  // Secondary subscription for network status & ping/pong diagnostics
  useEffect(() => {
    const bus = busRef.current; if (!bus) return;
    const off = bus.on((ev) => {
      if (ev.type === "__STATUS__") { setNet({ transport: ev.transport, state: ev.state, room: ev.room, relayUrl: ev.relayUrl || relayUrl }); }
      if (ev.type === "NET_PING" && ev.from !== clientId) {
        setLog((l)=>[{ line: `${time()} Ping from ${ev.name||ev.from}` }, ...l]);
        bus.post({ type: "NET_PONG", lobby: code, from: clientId, name, ts: Date.now() });
      }
      if (ev.type === "NET_PONG") {
        setLog((l)=>[{ line: `${time()} Pong from ${ev.name||ev.from}` }, ...l]);
      }
    });
    return () => off?.();
  }, [code, relayUrl, clientId]);

  useEffect(() => { if (role === "HOST" && cfg && busRef.current) busRef.current.post({ type: "CONFIG", lobby: cfg.code, config: cfg }); }, [cfg, role]);

  const [log, setLog] = useState([]);

  // Player-side active cue / sequence
  const [activeCue, setActiveCue] = useState(null); // {index,start} | null
  const [activeSeq, setActiveSeq] = useState(null); // {seq,at,start} | null
  const [showSeqHighlight, setShowSeqHighlight] = useState(true);
  const seqGapTimer = useRef(null);

  // Host sequence builder
  const [buildingSeq, setBuildingSeq] = useState(null); // number[] | null
  const [targetPlayer, setTargetPlayer] = useState(null);

  const sendSingleQTE = (index) => { if (!cfg) return; busRef.current?.post({ type: "QTE_SINGLE", lobby: cfg.code, index, ts: Date.now() }); };
  const startSequenceBuild = () => setBuildingSeq([]);
  const addSeqButton = (index) => setBuildingSeq((s) => (s ? [...s, index] : s));
  const cancelSequence = () => { setBuildingSeq(null); setTargetPlayer(null); };
  const sendSequenceTo = (client) => {
    if (!cfg || !buildingSeq || buildingSeq.length === 0 || !client) return;
    busRef.current?.post({ type: "SEQ_BEGIN", lobby: cfg.code, to: client, seq: buildingSeq, ts: Date.now() });
    setLog((l) => [{ line: `${time()} Sent sequence [${buildingSeq.map((i) => cfg.names[i]).join(" → ")}] to ${players[client]?.name || client}` }, ...l]);
    setBuildingSeq(null); setTargetPlayer(null);
  };

  // Player bus reactions
  useEffect(() => {
    const bus = busRef.current; if (!bus) return;
    const off = bus.on((ev) => {
      if (role !== "PLAYER" || !cfg) return;
      if (ev.type === "QTE_SINGLE") { setActiveSeq(null); setActiveCue({ index: ev.index, start: ev.ts }); }
      else if (ev.type === "SEQ_BEGIN" && ev.to === clientId) { setActiveCue(null); setActiveSeq({ seq: ev.seq.slice(), at: 0, start: Date.now() }); }
    });
    return () => off?.();
  }, [role, cfg, clientId]);

  const onPlayerClick = (index) => {
    if (!cfg) return; const t = cfg.thresholds;
    if (activeCue && activeCue.index === index) {
      const rt = Math.max(0, Date.now() - activeCue.start);
      const grade = gradeReaction(rt, t);
      busRef.current?.post({ type: "QTE_RESULT", lobby: cfg.code, from: clientId, name, index, rt, grade, ts: Date.now() });
      setActiveCue(null);
    }
  };

  const stepStartRef = useRef(null);
  useEffect(() => { if (activeSeq && stepStartRef.current == null) stepStartRef.current = Date.now(); if (!activeSeq) stepStartRef.current = null; }, [activeSeq]);

  const onPlayerSeqClick = (index) => {
    if (!cfg || !activeSeq) return; const t = cfg.thresholds; const expected = activeSeq.seq[activeSeq.at];
    if (!showSeqHighlight) return; // during gap, ignore clicks
    if (index !== expected) return;
    const now = Date.now(); const rt = Math.max(0, now - (stepStartRef.current || now));
    const grade = gradeWithLeniency(rt, t, cfg.leniencyMs || 0);
    busRef.current?.post({ type: "SEQ_STEP_RESULT", lobby: cfg.code, from: clientId, name, step: activeSeq.at, index, rt, grade, ts: now });
    const nextAt = activeSeq.at + 1;

    // Hide highlight briefly, then advance or finish
    setShowSeqHighlight(false);
    if (seqGapTimer.current) window.clearTimeout(seqGapTimer.current);
    seqGapTimer.current = window.setTimeout(() => {
      setShowSeqHighlight(true);
      if (!activeSeq) return;
      if (nextAt >= activeSeq.seq.length) {
        const totalMs = Date.now() - activeSeq.start;
        busRef.current?.post({ type: "SEQ_DONE", lobby: cfg.code, from: clientId, name, totalMs, grades: [], ts: Date.now() });
        setActiveSeq(null); stepStartRef.current = null;
      } else {
        setActiveSeq({ ...activeSeq, at: nextAt });
        stepStartRef.current = Date.now();
      }
    }, Math.max(40, (cfg?.glowGapMs ?? 120)));
  };

  const updateCount = (n) => setCfg((c) => (c ? { ...c, buttonCount: clamp(n, 2, 6), names: Array.from({ length: clamp(n, 2, 6) }, (_, i) => c.names[i] || `Button ${i + 1}`) } : c));
  const updateName = (i, v) => setCfg((c) => (c ? { ...c, names: c.names.map((n, idx) => (idx === i ? v : n)) } : c));
  const updateThreshold = (k, v) => setCfg((c) => (c ? { ...c, thresholds: { ...c.thresholds, [k]: Math.max(0, v) } } : c));

  const layout = useMemo(() => layoutFor(cfg?.buttonCount || 4), [cfg?.buttonCount]);

  // -------------------- Render --------------------

  if (!role) {
    return (
     <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="max-w-xl w-full p-6">
          <motion.h1 initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-bold mb-4">
            CH Quick Time
          </motion.h1>
          <Card>
            <CardHeader>
              <CardTitle>Start</CardTitle>
              <CardDescription>Host a temporary lobby or join one with a code.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border rounded-2xl p-4">
                  <div className="font-medium mb-2">Host</div>
                  <div className="grid gap-2 mb-2">
                    <Label className="text-xs">Relay URL (optional)</Label>
                    <Input value={relayUrl} onChange={(e) => setRelayUrl(e.target.value)} placeholder="wss://your-relay.example/ws" className="mb-1"/>
                  </div>
                  <Button className="w-full h-12 text-lg" onClick={createLobby}>
                    <Play className="mr-2 h-5 w-5"/>Create lobby
                  </Button>
                </div>
                <div className="border rounded-2xl p-4">
                  <div className="font-medium mb-2">Player</div>
                  <Label className="text-xs">Your name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="mb-2" />
                  <Label className="text-xs">Lobby code</Label>
                  <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="uppercase tracking-widest mb-2" />
                  <Label className="text-xs">Relay URL (optional)</Label>
                  <Input value={relayUrl} onChange={(e) => setRelayUrl(e.target.value)} placeholder="wss://your-relay.example/ws" className="mb-2"/>
                  <Button className="w-full h-12 text-lg" disabled={!name.trim() || code.length < 3} onClick={joinLobby}>
                    <Users className="mr-2 h-5 w-5"/>Join lobby
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
  if (role === "HOST" && cfg) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-6xl mx-auto p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-slate-500">Lobby code</div>
              <div className="text-2xl font-bold tracking-widest">{cfg.code}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRole(null)}>Exit</Button>
            </div>
          </div>

          {/* Connection status */}
          <div className="mb-3 text-xs text-slate-600 flex items-center gap-3">
            <span className={`inline-flex items-center gap-1 ${net.state === 'open' ? 'text-green-700' : 'text-red-700'}`}>
              <span className={`w-2 h-2 rounded-full ${net.state === 'open' ? 'bg-green-500' : 'bg-red-500'}`}></span>
              {net.transport || 'no-transport'} {net.state || ''}
            </span>
            {relayUrl ? <span>relay: <code className="px-1 bg-slate-100 rounded">{relayUrl}</code></span> : <span>relay: (none)</span>}
            <span>room: <code className="px-1 bg-slate-100 rounded">caveman-qte-{cfg.code}</code></span>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => busRef.current?.post({ type: 'NET_PING', lobby: cfg.code, from: clientId, name, ts: Date.now() })}>Ping relay</Button>
            <Button size="sm" className="" variant="secondary" onClick={() => busRef.current?.post({ type: 'CONFIG', lobby: cfg.code, config: cfg })}>Re-send config</Button>
          </div>
              <div className="text-2xl font-bold tracking-widest">{cfg.code}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRole(null)}>Exit</Button>
            </div>
          </div>

          {/* Reflow: removed demo player, so use 4 columns */}
          <div className="grid lg:grid-cols-4 gap-4">
            {/* Left: Controls */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5"/>Controls</CardTitle>
                <CardDescription>Buttons & thresholds</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2 items-end">
                  <div className="col-span-2">
                    <Label>Number of buttons (2–6)</Label>
                    <Input type="number" min={2} max={6} value={cfg.buttonCount} onChange={(e) => updateCount(Number(e.target.value))} className="h-14 text-xl px-5"/>
                  </div>
                  {buildingSeq ? (
                    <Button variant="destructive" onClick={cancelSequence} className="h-14 text-base"><Trash2 className="h-4 w-4 mr-2"/>Cancel</Button>
                  ) : (
                    <Button variant="secondary" onClick={startSequenceBuild} className="h-14 text-base"><ListOrdered className="h-4 w-4 mr-2"/>Sequence</Button>
                  )}
                </div>

                <div className="grid gap-2">
                  {Array.from({ length: cfg.buttonCount }).map((_, i) => (
                    <div key={i} className="grid grid-cols-[auto_1fr] items-center gap-3">
                      <Label className="text-sm w-24">Button {i + 1}</Label>
                      <Input value={cfg.names[i] || ""} onChange={(e) => updateName(i, e.target.value)} placeholder={`Button ${i + 1}`} className="h-14 text-xl px-5"/>
                    </div>
                  ))}
                </div>

                <div className="pt-2">
                  <div className="font-medium mb-2">Grading thresholds (ms)</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {["perfect", "success", "close", "slow", "timeout"].map((k) => (
                      <div key={k} className="grid grid-cols-[auto,1fr,auto] items-center gap-3 min-w-0">
                        <Label className="text-base w-28 capitalize whitespace-nowrap">{k}</Label>
                        <Input
                          type="number"
                          min={0}
                          value={cfg.thresholds[k]}
                          onChange={(e) => updateThreshold(k, Number(e.target.value))}
                          className="h-16 text-2xl px-5 text-right tabular-nums w-full min-w-0"
                        />
                        <div className="text-lg text-slate-500 whitespace-nowrap">ms</div>
                      </div>
                    ))}
                  </div>

                  {/* Feedback settings */}
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="grid grid-cols-[auto_1fr,auto] items-center gap-3">
                      <Label className="text-sm whitespace-nowrap">Glow gap</Label>
                      <Input type="number" min={20} value={cfg.glowGapMs ?? 120} onChange={(e)=> setCfg(c => c ? { ...c, glowGapMs: Math.max(20, Number(e.target.value||0)) } : c)} className="h-12 text-lg px-4 text-right"/>
                      <div className="text-sm text-slate-500">ms</div>
                    </div>
                    <div className="grid grid-cols-[auto_1fr,auto] items-center gap-3">
                      <Label className="text-sm whitespace-nowrap">Click flash</Label>
                      <Input type="number" min={20} value={cfg.hostFlashMs ?? 60} onChange={(e)=> setCfg(c => c ? { ...c, hostFlashMs: Math.max(20, Number(e.target.value||0)) } : c)} className="h-12 text-lg px-4 text-right"/>
                      <div className="text-sm text-slate-500">ms</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <Label className="text-sm">Sequence leniency (ms)</Label>
                  <Input type="number" min={0} value={cfg.leniencyMs ?? 0} onChange={(e)=> setCfg(c => c ? { ...c, leniencyMs: Math.max(0, Number(e.target.value||0)) } : c)} className="h-14 text-xl px-5 w-48"/>
                </div>

                {buildingSeq && (
                  <div className="border rounded-xl p-3">
                    <div className="text-sm mb-2">Sequence: {buildingSeq.length === 0 ? <em>click buttons to add</em> : buildingSeq.map((i) => cfg.names[i]).join(" → ")}</div>
                    <div className="grid grid-cols-1 gap-2">
                      <Label className="text-xs">Send to player</Label>
                      <Select value={targetPlayer || undefined} onValueChange={(v) => setTargetPlayer(v)}>
                        <SelectTrigger><SelectValue placeholder="Choose a player"/></SelectTrigger>
                        <SelectContent>
                          {Object.entries(players).map(([id, p]) => (
                            <SelectItem key={id} value={id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button disabled={!targetPlayer || buildingSeq.length === 0} onClick={() => targetPlayer && sendSequenceTo(targetPlayer)} className="h-12 text-base">
                        <Send className="h-4 w-4 mr-2"/>Send Sequence
                      </Button>
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <div className="text-sm text-slate-500 mb-1">Players in lobby</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.values(players).length === 0 ? <Badge variant="secondary">No players yet</Badge> : Object.values(players).map((p, i) => (<Badge key={i}>{p.name}</Badge>))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Middle: Big Buttons (host triggers single QTE to all) */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Send QTE</CardTitle>
                <CardDescription>Tap a button to cue all players. In Sequence mode, taps build the sequence instead.</CardDescription>
              </CardHeader>
              <CardContent>
                <BigButtons
                  count={cfg.buttonCount}
                  names={cfg.names}
                  layout={layout}
                  onPress={(i) => {
                    // host tap feedback (also during sequence build)
                    setHostPressed(i);
                    setTimeout(() => setHostPressed((p) => (p === i ? null : p)), Math.max(30, cfg.hostFlashMs ?? 60));
                    if (buildingSeq) { addSeqButton(i); return; }
                    sendSingleQTE(i);
                  }}
                  activeIndex={null}
                  pressedIndex={hostPressed}
                />
              </CardContent>
            </Card>

            {/* Log (full width below) */}
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>Results</CardTitle>
                <CardDescription>Latest first</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-56 pr-3">
                  <div className="space-y-2">
                    {log.length === 0 ? (
                      <div className="text-sm text-slate-500">No results yet.</div>
                    ) : (
                      log.map((entry, i) => (
                        <div key={i} className="text-sm font-mono flex items-center gap-2">
                          {entry.grade ? (
                            <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${gradeColor(entry.grade)}`}>{entry.grade}</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-xs bg-slate-200 text-slate-800">Info</span>
                          )}
                          <span>{entry.line}</span>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <div className="lg:col-span-4">
              <TestRunner />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // PLAYER VIEW
  if (role === "PLAYER") {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <div className="max-w-4xl mx-auto p-4 md:p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-slate-400">Lobby {code}</div>
            <div className="text-sm">You: <span className="font-semibold">{name}</span></div>
            <Button variant="outline" onClick={() => setRole(null)}>Exit</Button>
          </div>

          {/* Connection status */}
          <div className="mb-3 text-[11px] text-slate-400 flex items-center gap-3">
            <span className={`inline-flex items-center gap-1 ${net.state === 'open' ? 'text-green-300' : 'text-red-300'}`}>
              <span className={`w-2 h-2 rounded-full ${net.state === 'open' ? 'bg-green-400' : 'bg-red-400'}`}></span>
              {net.transport || 'no-transport'} {net.state || ''}
            </span>
            {relayUrl ? <span>relay: <code className="px-1 bg-slate-800/60 rounded">{relayUrl}</code></span> : <span>relay: (none)</span>}
            <span>room: <code className="px-1 bg-slate-800/60 rounded">caveman-qte-{code}</code></span>
          </div>
            <div className="text-sm">You: <span className="font-semibold">{name}</span></div>
            <Button variant="outline" onClick={() => setRole(null)}>Exit</Button>
          </div>

          {!cfg ? (
            <div className="text-slate-400">Waiting for host… (you can still receive cues)</div>
          ) : (
            <BigButtons
              count={cfg.buttonCount}
              names={cfg.names}
              layout={layoutFor(cfg.buttonCount)}
              onPress={(i) => { if (activeSeq) return onPlayerSeqClick(i); onPlayerClick(i); setPlayerPressed(i); setTimeout(() => setPlayerPressed((p)=> p===i? null : p), Math.max(30, cfg?.hostFlashMs ?? 60)); }}
              activeIndex={showSeqHighlight ? (activeCue?.index ?? (activeSeq ? activeSeq.seq[activeSeq.at] : null)) : null}
              playerMode
              pressedIndex={playerPressed}
            />
          )}

          <div className="mt-6 opacity-80">
            <TestRunner />
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// -------------------- Big Buttons Component --------------------

function BigButtons({ count, names, layout, onPress, activeIndex, playerMode = false, pressedIndex = null }) {
  const buttons = Array.from({ length: count }, (_, i) => ({ i, label: names[i] || `Button ${i + 1}` }));
  const cols = count <= 4 ? 2 : 3;
  return (
    <div className={cols === 2 ? "grid gap-3 grid-cols-2" : "grid gap-3 grid-cols-3"}>
      {buttons.map((b) => (
        <QTEButton key={b.i} label={b.label} active={activeIndex === b.i} onClick={() => onPress(b.i)} playerMode={playerMode} dim={pressedIndex === b.i}/>
      ))}
    </div>
  );
}

function QTEButton({ label, onClick, active, playerMode = false, dim = false }) {
  return (
    <button
      onClick={onClick}
      className={`relative overflow-hidden h-28 md:h-40 lg:h-52 rounded-2xl text-xl md:text-2xl font-semibold flex items-center justify-center select-none border-2 transition-transform ${active ? (playerMode ? "border-yellow-400 shadow-[0_0_0_6px_rgba(250,204,21,0.35)] scale-[1.02]" : "border-slate-800 scale-[1.01]") : "border-slate-300"} ${playerMode ? "bg-slate-800 text-white" : "bg-white text-slate-900"} ${dim ? "opacity-70" : ""}`}
      style={{ touchAction: "manipulation" }}
    >
      {/* Active cue pulse ring (player side) */}
      {active && playerMode && <span className="absolute inset-0 rounded-2xl animate-ping bg-yellow-300/25" />}
      {/* Click flash overlay */}
      {dim && <span className="absolute inset-0 rounded-2xl bg-white/50" />}
      <span className={`${active ? "animate-pulse" : ""}`}>{label}</span>
    </button>
  );
}

// -------------------- Tiny Dev Tests --------------------

function TestRunner() {
  /** @typedef {{name:string, fn:()=>void}} Test */
  const [out, setOut] = useState([]);
  useEffect(() => {
    /** @type {Test[]} */
    const tests = [
      { name: "grade thresholds order", fn: () => {
        const t = defaultConfig("X").thresholds;
        if (!(t.perfect <= t.success && t.success <= t.close && t.close <= t.slow && t.slow <= t.timeout)) throw new Error("bad order");
      }},
      { name: "gradeReaction mapping", fn: () => {
        const t = { perfect: 100, success: 200, close: 300, slow: 400, timeout: 500 };
        const expect = [ [50, "Perfect"], [150, "Success"], [250, "Close call"], [350, "Slow"], [450, "Failure"] ];
        for (const [ms, g] of expect) { const r = gradeReaction(ms, t); if (r !== g) throw new Error(`${ms}→${r}`); }
      }},
      { name: "layout presets", fn: () => {
        if (layoutFor(2) !== "grid-2") throw new Error("2");
        if (layoutFor(3) !== "grid-3") throw new Error("3");
        if (layoutFor(4) !== "grid-else") throw new Error("4");
      }},
      { name: "randomCode charset/len", fn: () => {
        const c = randomCode(6); if (c.length !== 6) throw new Error("len"); if (!/^[A-HJ-NP-Z2-9]+$/.test(c)) throw new Error("charset");
      }},
      { name: "defaultConfig defaults", fn: () => {
        const d = defaultConfig("X");
        if (d.buttonCount !== 4) throw new Error("count");
        const expected = ["Dodge","Block","Parry","Jump"]; if (JSON.stringify(d.names) !== JSON.stringify(expected)) throw new Error("names");
      }},
      { name: "clamp bounds", fn: () => {
        if (clamp(10, 0, 5) !== 5) throw new Error("upper"); if (clamp(-1, 0, 5) !== 0) throw new Error("lower"); if (clamp(3, 0, 5) !== 3) throw new Error("mid");
      }},
      { name: "leniency expands sequence grades", fn: () => {
        const t = { perfect: 100, success: 200, close: 300, slow: 400, timeout: 500 };
        const r1 = gradeWithLeniency(120, t, 0); if (r1 !== "Success") throw new Error("no-len");
        const r2 = gradeWithLeniency(120, t, 30); if (r2 !== "Perfect") throw new Error("len-applied");
      }},
    ];
    const res = tests.map((t) => { try { t.fn(); return { name: t.name, ok: true }; } catch (e) { return { name: t.name, ok: false, msg: e && e.message }; } });
    setOut(res);
  }, []);
  const pass = out.filter((r) => r.ok).length;
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Tests</CardTitle>
        <CardDescription>({pass}/{out.length} passing)</CardDescription>
      </CardHeader>
      <CardContent>
        {out.map((r, i) => (<div key={i} className={`text-sm ${r.ok ? "text-green-700" : "text-red-700"}`}>{r.ok ? "✓" : "✗"} {r.name}{r.msg ? ` — ${r.msg}` : ""}</div>))}
      </CardContent>
    </Card>
  );
}
