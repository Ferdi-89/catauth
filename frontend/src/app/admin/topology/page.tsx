'use client';

import React, { useState, useEffect } from 'react';
import { 
  GitGraph, Play, Pause, RotateCcw, Search, CheckCircle2, 
  ArrowRight, ShieldAlert, Zap, Server, Database, Activity, Lock 
} from 'lucide-react';
import { WORKFLOW_NODES } from '../../../lib/nodesData';
import { WorkflowNode, NodeType } from '../../../lib/types';

export default function WorkflowTopologyPage() {
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(WORKFLOW_NODES[0]);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Simulation Runner State
  const [activeSimulation, setActiveSimulation] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
  const [simulating, setSimulating] = useState(false);
  const [simulationPath, setSimulationPath] = useState<string[]>([]);
  const [executionLogs, setExecutionLogs] = useState<{ step: number; nodeId: string; title: string; contract: string }[]>([]);

  // Simulation Paths
  const SIMULATION_SCENARIOS = {
    HAPPY_PATH_SSO: {
      name: 'Happy Path SSO & WebAuthn NFC Login',
      description: 'Lolos validasi, challenge fresh, sign_count valid, izin geofence, single-use auth code, dan token exchange.',
      path: [
        'node-1', 'node-2', 'node-3', 'node-5', 'node-12', 'node-9', 'node-10', 'node-7', 
        'node-8', 'node-11', 'node-66', 'node-67', 'node-13', 'node-61', 'node-62', 'node-14', 
        'node-15', 'node-17', 'node-19', 'node-21', 'node-24', 'node-25', 'node-26', 'node-28', 
        'node-29', 'node-30', 'node-31', 'node-32', 'node-33', 'node-34', 'node-35'
      ]
    },
    CLONED_TOKEN_ATTACK: {
      name: 'Cloned Token Counter Attack Simulation',
      description: 'Penyerang mengirim sign_count mundur (<= tersimpan). Terdeteksi anomali pada Node 21 dan diblokir ke Node 22.',
      path: [
        'node-1', 'node-2', 'node-3', 'node-5', 'node-12', 'node-9', 'node-10', 'node-7', 
        'node-8', 'node-11', 'node-66', 'node-67', 'node-13', 'node-61', 'node-62', 'node-14', 
        'node-15', 'node-17', 'node-18'
      ]
    },
    REPLAY_NONCE_ATTACK: {
      name: 'Replay Challenge Nonce Attack Simulation',
      description: 'Penyerang memakai ulang challenge yang telah dihapus atomic GETDEL. Dicegat di Node 14 menuju Node 22.',
      path: [
        'node-1', 'node-2', 'node-3', 'node-5', 'node-12', 'node-9', 'node-10', 'node-7', 
        'node-8', 'node-11', 'node-66', 'node-67', 'node-18'
      ]
    },
    GEOFENCE_REJECTION: {
      name: 'Geofence Region Block Simulation',
      description: 'Akses berasal dari negara terlarang (misal KP). Dicegat di Node 23 menuju Node 24 (Layar Akses Terisolasi).',
      path: [
        'node-1', 'node-2', 'node-3', 'node-5', 'node-12', 'node-9', 'node-10', 'node-7', 
        'node-8', 'node-11', 'node-66', 'node-67', 'node-13', 'node-61', 'node-62', 'node-14', 
        'node-15', 'node-17', 'node-19', 'node-20'
      ]
    },
    REVOCATION_CDC_DLQ: {
      name: 'Admin Revoke, WAL CDC Outbox & DLQ Reconciler',
      description: 'Admin mencabut sesi -> ACID Outbox WAL -> CDC Redis Stream -> Purge Cache -> PyBreaker Webhook -> DLQ -> Reconciler.',
      path: [
        'node-51', 'node-52', 'node-53', 'node-70', 'node-54', 'node-68', 'node-55', 'node-59', 
        'node-60', 'node-71', 'node-72', 'node-68'
      ]
    }
  };

  // Run simulation stepper timer
  useEffect(() => {
    let timer: any;
    if (simulating && currentStepIndex < simulationPath.length - 1) {
      timer = setTimeout(() => {
        const nextIdx = currentStepIndex + 1;
        setCurrentStepIndex(nextIdx);
        const activeNodeId = simulationPath[nextIdx];
        const node = WORKFLOW_NODES.find((n) => n.id === activeNodeId);
        if (node) {
          setSelectedNode(node);
          setExecutionLogs((prev) => [
            ...prev,
            {
              step: nextIdx + 1,
              nodeId: node.id,
              title: node.title,
              contract: node.contract,
            },
          ]);
        }
      }, 700);
    } else if (currentStepIndex >= simulationPath.length - 1 && simulating) {
      setSimulating(false);
    }
    return () => clearTimeout(timer);
  }, [simulating, currentStepIndex, simulationPath]);

  function startScenario(scenarioKey: keyof typeof SIMULATION_SCENARIOS) {
    const scenario = SIMULATION_SCENARIOS[scenarioKey];
    setActiveSimulation(scenarioKey);
    setSimulationPath(scenario.path);
    setCurrentStepIndex(0);
    setExecutionLogs([]);
    setSimulating(true);

    const firstNode = WORKFLOW_NODES.find((n) => n.id === scenario.path[0]);
    if (firstNode) {
      setSelectedNode(firstNode);
      setExecutionLogs([
        {
          step: 1,
          nodeId: firstNode.id,
          title: firstNode.title,
          contract: firstNode.contract,
        },
      ]);
    }
  }

  function resetSimulation() {
    setSimulating(false);
    setActiveSimulation(null);
    setCurrentStepIndex(-1);
    setSimulationPath([]);
    setExecutionLogs([]);
    setSelectedNode(WORKFLOW_NODES[0]);
  }

  // Type color mapping
  const TYPE_COLORS: Record<NodeType, { bg: string; text: string; border: string }> = {
    TRIGGER: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
    SCREEN: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/30' },
    CONDITION: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
    AUTH: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
    API: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
    CACHE: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    DATABASE: { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/30' },
    QUEUE: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' },
    NOTIFICATION: { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/30' },
    EXTERNAL: { bg: 'bg-gray-500/10', text: 'text-gray-300', border: 'border-gray-500/30' },
    STORAGE: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/30' },
    COMMENT: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/30' },
    'LOGIC-MULTI': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  };

  function getNodeColors(type?: string) {
    if (type && TYPE_COLORS[type as NodeType]) {
      return TYPE_COLORS[type as NodeType];
    }
    return { bg: 'bg-neutral-900', text: 'text-neutral-300', border: 'border-neutral-800' };
  }


  const filteredNodes = WORKFLOW_NODES.filter((n) => {
    const matchesFilter = filterType === 'ALL' || n.type === filterType;
    const matchesSearch = searchTerm === '' || 
      n.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      n.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.contract.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-white tracking-tight">Interactive 72-Node Workflow Topology</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary-500/20 text-primary-300 border border-primary-500/30">
              72 Nodes • 71 Directed Edges
            </span>
          </div>
          <p className="text-xs text-gray-400">Visualisasi komprehensif seluruh topologi alur arsitektur Margaret Blueprint dengan simulator eksekusi interaktif.</p>
        </div>

        {/* Simulation Control Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {activeSimulation && (
            <button
              onClick={() => setSimulating(!simulating)}
              className="px-3 py-1.5 rounded-lg bg-card hover:bg-border text-gray-200 border border-border text-xs font-semibold flex items-center space-x-1.5"
            >
              {simulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{simulating ? 'Jeda' : 'Lanjutkan'}</span>
            </button>
          )}

          {activeSimulation && (
            <button
              onClick={resetSimulation}
              className="p-1.5 rounded-lg bg-card hover:bg-border text-gray-400 hover:text-white border border-border text-xs"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Interactive Scenario Launchpad */}
      <div className="bento-card p-4 space-y-3 border border-border">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-200 flex items-center space-x-1.5">
            <Play className="w-3.5 h-3.5 text-primary-400" />
            <span>Pilih Skenario Simulasi Alur:</span>
          </span>
          <span className="text-[10px] font-mono text-gray-400">Real-time Node Traversal</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {Object.entries(SIMULATION_SCENARIOS).map(([key, item]) => {
            const isActive = activeSimulation === key;
            return (
              <button
                key={key}
                onClick={() => startScenario(key as any)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  isActive
                    ? 'bg-primary-500/20 border-primary-500/60 shadow-lg shadow-primary-500/10'
                    : 'bg-card hover:bg-border border-border text-gray-300'
                }`}
              >
                <div className="font-bold text-xs text-white truncate">{item.name}</div>
                <div className="text-[10px] text-gray-400 mt-1 line-clamp-2">{item.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Left side Node Explorer (72 nodes) | Right side Active Inspector & Execution Trace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: 72 Nodes Graph Grid */}
        <div className="lg:col-span-2 space-y-3">
          {/* Search & Filter Bar */}
          <div className="bento-card p-3 border border-border flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari node / contract..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-background border border-border text-xs text-white focus:outline-none focus:border-primary-500"
              />
            </div>

            <div className="flex items-center space-x-1 overflow-x-auto w-full sm:w-auto">
              {['ALL', 'TRIGGER', 'SCREEN', 'CONDITION', 'API', 'CACHE', 'DATABASE', 'QUEUE'].map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-2 py-1 rounded-md text-[10px] font-mono font-bold transition-colors ${
                    filterType === t
                      ? 'bg-primary-500/20 text-primary-300 border border-primary-500/30'
                      : 'text-gray-400 hover:text-white bg-card'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 72 Nodes Interactive Grid */}
          <div className="bento-card p-4 border border-border max-h-[620px] overflow-y-auto space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {filteredNodes.map((node) => {
                const isSelected = selectedNode?.id === node.id;
                const isStepActive = simulationPath[currentStepIndex] === node.id;
                const isVisited = simulationPath.slice(0, currentStepIndex + 1).includes(node.id);
                const colors = getNodeColors(node.type);

                return (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNode(node)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all relative overflow-hidden ${
                      isStepActive
                        ? 'bg-primary-500/30 border-primary-400 ring-2 ring-primary-500 shadow-lg shadow-primary-500/30 transform scale-105 z-10'
                        : isVisited
                        ? 'bg-card/90 border-emerald-500/40 opacity-90'
                        : isSelected
                        ? 'bg-card border-primary-500/50'
                        : 'bg-card/60 hover:bg-card border-border'
                    }`}
                  >
                    {isStepActive && (
                      <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-cyan-400 animate-ping"></div>
                    )}

                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-mono font-bold text-gray-400">
                        #{node.nodeNumber} [{node.id}]
                      </span>
                      <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} border ${colors.border}`}>
                        {node.type}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-white leading-tight mb-1 truncate">
                      {node.title}
                    </h4>

                    <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed">
                      {node.purpose}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Active Node Detail Inspector & Live Traversal Trace */}
        <div className="space-y-4">
          {/* Node Inspector Card */}
          {selectedNode && (() => {
            const activeColors = getNodeColors(selectedNode.type);
            return (
              <div className="bento-card p-6 space-y-4 border-primary-500/30">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${activeColors.bg} ${activeColors.text} border ${activeColors.border}`}>
                    Node {selectedNode.nodeNumber}: {selectedNode.type}
                  </span>
                  <span className="text-xs font-mono text-gray-400">{selectedNode.id}</span>
                </div>


              <div>
                <h3 className="text-lg font-black text-white">{selectedNode.title}</h3>
                <p className="text-xs text-gray-300 mt-1 leading-relaxed">{selectedNode.purpose}</p>
              </div>

              {/* Contract / Execution Specification */}
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block">Contract / Details:</span>
                <div className="p-3 rounded-xl bg-background/80 border border-border text-[11px] font-mono text-cyan-300 break-words">
                  {selectedNode.contract}
                </div>
              </div>

              {/* Branch Targets if Condition */}
              {selectedNode.branchTargets && (
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block">Branch Targets:</span>
                  <div className="space-y-1">
                    {selectedNode.branchTargets.map((b, idx) => (
                      <div key={idx} className="text-[11px] font-mono p-1.5 rounded bg-background text-amber-300 border border-border">
                        {b}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Edges */}
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono pt-2 border-t border-border">
                <div>
                  <span className="text-gray-500 block">Incoming:</span>
                  <span className="text-gray-300">{selectedNode.incoming.join(', ') || 'Root'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Outgoing:</span>
                  <span className="text-primary-400">{selectedNode.outgoing.join(', ') || 'Terminal'}</span>
                </div>
              </div>
            </div>
          );
        })()}


          {/* Live Execution Logs Stream */}
          <div className="bento-card p-5 space-y-3 border border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>Execution Trace Stream ({executionLogs.length})</span>
              </span>
              {simulating && (
                <span className="text-[10px] font-mono text-emerald-400 animate-pulse">
                  Step {currentStepIndex + 1}/{simulationPath.length}
                </span>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2 font-mono text-xs">
              {executionLogs.map((log) => (
                <div key={log.step} className="p-2.5 rounded-lg bg-background/70 border border-border space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-primary-300">Step {log.step}: [{log.nodeId}]</span>
                    <span className="text-[10px] text-gray-500">Executed</span>
                  </div>
                  <div className="text-[11px] text-gray-200">{log.title}</div>
                  <div className="text-[10px] text-gray-400 truncate">{log.contract}</div>
                </div>
              ))}
              {executionLogs.length === 0 && (
                <div className="text-center py-6 text-[11px] text-gray-500">
                  Pilih skenario simulasi di atas untuk melihat jejak eksekusi alur real-time.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
