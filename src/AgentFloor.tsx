import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Activity, ArrowUpRight, Box, Braces, Check, ChevronDown, CircleHelp, Clock3, Coffee, Cuboid, Eye, Grid2X2, Layers, MapPin, Maximize, Minus, MousePointer2, Palette, Pause, Play, Plug, Plus, Radio, RotateCcw, Search, Settings2, SlidersHorizontal, Trash2, Users, X, Zap } from 'lucide-react';
import { FloorScene, type SceneOptions } from './FloorScene';
import { connectEventSource, type ConnectionStatus } from './adapters';
import { demoAgents, seedDemo, startDemo } from './demo';
import { accentColors, createFloor, defaultFloors, FLOORS_STORAGE_KEY, loadFloors, MAX_FLOORS, surfaces, wallColors, type FloorConfig } from './floors';
import { createFloorStore, type Agent, type AgentStatus, type ArtStyle, type FloorStore, type Theme, type Zone } from './protocol';

export interface AgentFloorProps { store?: FloorStore; demo?: boolean; title?: string; theme?: Theme; art?: ArtStyle; floors?: FloorConfig[]; className?: string }
const zoneNames: Record<Zone, string> = { desks: 'Workstations', meeting: 'Meeting room', lounge: 'The lounge', lab: 'Build lab' };
const statusNames: Record<AgentStatus, string> = { working: 'Working', thinking: 'Thinking', idle: 'Idle', blocked: 'Blocked' };
const floorToggles: [keyof Pick<FloorConfig, 'meeting' | 'lounge' | 'lab' | 'plants'>, string][] = [['meeting', 'Meeting room'], ['lounge', 'Lounge'], ['lab', 'Build lab'], ['plants', 'Plants']];

function IconButton({ label, children, onClick, active = false }: { label: string; children: ReactNode; onClick: () => void; active?: boolean }) {
  return <button type="button" className={`af-icon-button ${active ? 'is-active' : ''}`} aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

function BrandMark({ size = 30 }: { size?: number }) {
  return <svg viewBox="0 0 256 256" width={size} height={size} aria-hidden="true"><circle cx="128" cy="42" r="26" fill="var(--af-accent)" /><path fill="currentColor" d="M40 134 L128 83.2 L216 134 L128 184.8 Z M40 160 L128 210.8 L216 160 V186 L128 236.8 L40 186 Z" /></svg>;
}

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="af-dialog" aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header><h2>{title}</h2><IconButton label="Close dialog" onClick={onClose}><X size={19} /></IconButton></header>{children}
  </dialog>;
}

function readAppearance(theme: Theme, art: ArtStyle): SceneOptions {
  const defaults = { theme, art, labels: true, motion: !window.matchMedia('(prefers-reduced-motion: reduce)').matches, shadows: true };
  try {
    const saved = JSON.parse(localStorage.getItem('agent-floor-ui:appearance') ?? 'null');
    if (!saved) return defaults;
    return { ...defaults, theme: ['studio', 'midnight', 'blueprint'].includes(saved.theme) ? saved.theme : theme, art: ['soft', 'voxel', 'wireframe'].includes(saved.art) ? saved.art : art, labels: typeof saved.labels === 'boolean' ? saved.labels : true, shadows: typeof saved.shadows === 'boolean' ? saved.shadows : true };
  } catch { return defaults; }
}

export function AgentFloor({ store: providedStore, demo = !providedStore, title = 'The Workshop', theme = 'studio', art = 'soft', floors: initialFloors = defaultFloors, className = '' }: AgentFloorProps) {
  const [store] = useState(() => {
    if (providedStore) {
      if (demo && !providedStore.getSnapshot().agents.length) seedDemo(providedStore);
      return providedStore;
    }
    const created = createFloorStore();
    if (demo) seedDemo(created);
    return created;
  });
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [options, setOptions] = useState<SceneOptions>(() => readAppearance(theme, art));
  const [isDemo, setIsDemo] = useState(demo);
  const [playing, setPlaying] = useState(true);
  const [dialog, setDialog] = useState<'appearance' | 'connect' | 'help' | 'floor' | null>(null);
  const [mobilePanel, setMobilePanel] = useState<'floor' | 'agents' | 'activity'>('floor');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [endpoint, setEndpoint] = useState('http://127.0.0.1:4310/events');
  const [connection, setConnection] = useState<ConnectionStatus>('disconnected');
  const [connectionError, setConnectionError] = useState('');
  const [renderError, setRenderError] = useState('');
  const [retry, setRetry] = useState(0);
  const [floors, setFloors] = useState<FloorConfig[]>(() => loadFloors(initialFloors));
  const [floorId, setFloorId] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const scene = useRef<FloorScene | null>(null);
  const disconnect = useRef<(() => void) | null>(null);
  const activityPanel = useRef<HTMLElement>(null);
  const currentFloor = floors.find(floor => floor.id === floorId) ?? floors[0];
  const floorIndex = floors.indexOf(currentFloor);
  const floorOf = (agent: Agent) => (agent.floor && floors.some(floor => floor.id === agent.floor) ? agent.floor : floors[0].id);
  const floorName = (floor: FloorConfig) => floor.name.trim() || 'Untitled floor';
  const floorAgents = state.agents.filter(agent => floorOf(agent) === currentFloor.id);
  const selected = state.agents.find(agent => agent.id === selectedId);
  const popupAgent = floorAgents.find(agent => agent.id === (hoveredId ?? selectedId));
  const popupActivity = popupAgent && state.activities.find(item => item.id === popupAgent.id);
  const visibleAgents = state.agents.filter(agent => `${agent.name} ${agent.role}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || agent.status === filter));
  const working = state.agents.filter(agent => agent.status === 'working').length;
  const thinking = state.agents.filter(agent => agent.status === 'thinking').length;
  const idle = state.agents.filter(agent => agent.status === 'idle').length;
  const blocked = state.agents.filter(agent => agent.status === 'blocked').length;

  useEffect(() => {
    if (!viewport.current) return;
    try { scene.current = new FloorScene(viewport.current, options, currentFloor, { onSelect: setSelectedId, onHover: setHoveredId }); setRenderError(''); }
    catch { setRenderError('The 3D workspace could not start. Check that WebGL is enabled in your browser.'); }
    return () => { scene.current?.dispose(); scene.current = null; };
  }, [retry]);
  useEffect(() => { scene.current?.setFloor(currentFloor, floorAgents); }, [currentFloor, state.agents, floors, retry]);
  useEffect(() => { scene.current?.setSelection(selectedId); }, [selectedId, state.agents, currentFloor, retry]);
  useEffect(() => { scene.current?.trackElement(popupRef.current, popupAgent?.id ?? null); }, [popupAgent?.id, retry]);
  useEffect(() => {
    const sanitized = floors.map((floor, index) => ({ ...floor, name: floor.name.trim() || `Floor ${index + 1}` }));
    try { localStorage.setItem(FLOORS_STORAGE_KEY, JSON.stringify(sanitized)); } catch {}
  }, [floors]);
  useEffect(() => {
    scene.current?.configure({ ...options, motion: options.motion && playing });
    try { localStorage.setItem('agent-floor-ui:appearance', JSON.stringify(options)); } catch {}
  }, [options, playing, retry]);
  useEffect(() => { if (isDemo && playing) return startDemo(store); }, [isDemo, playing, store]);
  useEffect(() => () => { disconnect.current?.(); }, []);

  const patchOptions = (patch: Partial<SceneOptions>) => setOptions(previous => ({ ...previous, ...patch }));
  const patchFloor = (patch: Partial<FloorConfig>) => setFloors(previous => previous.map(floor => floor.id === currentFloor.id ? { ...floor, ...patch } : floor));
  const addFloor = () => {
    const floor = createFloor(floors);
    setFloors([...floors, floor]);
    setFloorId(floor.id);
    setConfirmRemove(false);
    setDialog('floor');
  };
  const removeFloor = () => {
    const remaining = floors.filter(floor => floor.id !== currentFloor.id);
    setFloors(remaining);
    setFloorId(remaining[0].id);
    setConfirmRemove(false);
    setDialog(null);
  };
  const selectAgent = (agent: Agent) => { setSelectedId(agent.id); setFloorId(floorOf(agent)); };
  const connect = () => {
    setConnectionError('');
    try {
      disconnect.current?.();
      const cleanup = connectEventSource(store, endpoint, setConnection);
      disconnect.current = cleanup;
      if (isDemo) store.reset();
      setIsDemo(false);
      setDialog(null);
    } catch (error) { setConnectionError(error instanceof Error ? error.message : 'Connection failed'); }
  };
  const enableDemo = () => {
    disconnect.current?.(); disconnect.current = null;
    store.reset();
    seedDemo(store); setIsDemo(true); setPlaying(true); setDialog(null);
  };
  const showActivity = () => { setMobilePanel('activity'); activityPanel.current?.focus(); };

  return <div className={`agent-floor af-theme-${options.theme} ${className}`} data-panel={mobilePanel}>
    <nav className="af-rail" aria-label="Workspace navigation">
      <a className="af-brand" href="#" aria-label="Agent Floor home" onClick={event => { event.preventDefault(); setMobilePanel('floor'); }}><BrandMark /></a>
      <div className="af-rail-main">
        <IconButton label="Workspace" active={mobilePanel === 'floor'} onClick={() => setMobilePanel('floor')}><Grid2X2 size={21} /></IconButton>
        <IconButton label="Agents" active={mobilePanel === 'agents'} onClick={() => setMobilePanel('agents')}><Users size={21} /></IconButton>
        <IconButton label="Activity" active={mobilePanel === 'activity'} onClick={showActivity}><Activity size={21} /></IconButton>
        <span className="af-rail-divider" />
        <IconButton label="Integrations" active={dialog === 'connect'} onClick={() => setDialog('connect')}><Plug size={21} /></IconButton>
      </div>
      <div className="af-rail-bottom">
        <IconButton label="Appearance" active={dialog === 'appearance'} onClick={() => setDialog('appearance')}><Palette size={21} /></IconButton>
        <IconButton label="Help and shortcuts" onClick={() => setDialog('help')}><CircleHelp size={21} /></IconButton>
        <span className="af-owner" title="Local workspace">AF</span>
      </div>
    </nav>

    <div className="af-shell">
      <header className="af-header">
        <div className="af-wordmark">agent<span>floor</span><span className="af-version">BETA</span></div>
        <div className="af-header-divider" />
        <div className="af-project"><span className="af-project-icon"><Box size={16} /></span><span>{title}</span></div>
        <div className="af-header-right"><span className={`af-source ${isDemo ? 'demo' : ''}`}><span className="af-dot" />{isDemo ? 'Demo workspace' : connection === 'connected' ? 'Connected' : providedStore ? 'Local event API' : connection === 'connecting' ? 'Connecting' : 'Not connected'}</span><button className="af-button af-connect-button" onClick={() => setDialog('connect')}><Plug size={15} /> Connect <span className="af-hide-small">a project</span></button></div>
      </header>

      <div className="af-workspace-heading">
        <div><div className="af-eyebrow">MISSION CONTROL <span>/</span> FLOOR {String(floorIndex + 1).padStart(2, '0')}</div><h1>Your agents, in their element<span>.</span></h1><p>{title} <span className="af-heading-separator">/</span> {floorName(currentFloor)} <span className="af-heading-separator">/</span> {floorAgents.length} here, {state.agents.length} total</p></div>
        <button className="af-button af-appearance-button" onClick={() => { setConfirmRemove(false); setDialog('floor'); }}><Settings2 size={16} /> Customize floor</button>
      </div>

      <div className="af-workarea">
        <aside className="af-roster" aria-label="Agents">
          <div className="af-panel-heading"><h2>The crew <span>{state.agents.length.toString().padStart(2, '0')}</span></h2><button className="af-text-button" onClick={() => setDialog('connect')} title="Connect an agent source"><Plus size={17} /></button></div>
          <label className="af-search"><Search size={15} /><input aria-label="Search agents" placeholder="Find an agent..." value={search} onChange={event => setSearch(event.target.value)} /></label>
          <div className="af-roster-filter"><span>ON THIS FLOOR</span><label><select aria-label="Filter agents by status" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All statuses</option><option value="working">Working</option><option value="thinking">Thinking</option><option value="idle">Idle</option><option value="blocked">Blocked</option></select><ChevronDown size={12} /></label></div>
          <div className="af-agent-list">
            {visibleAgents.map(agent => <button key={agent.id} className={`af-agent-row ${selectedId === agent.id ? 'selected' : ''}`} onClick={() => selectAgent(agent)} aria-pressed={selectedId === agent.id}>
              <span className="af-avatar" style={{ '--agent-color': agent.color } as React.CSSProperties}><span className="af-avatar-face"><i /><i /></span><span className={`af-status-dot ${agent.status}`} /></span>
              <span className="af-agent-info"><strong>{agent.name}</strong><span>{agent.role}</span>{floors.length > 1 && <span className="af-agent-floor"><Layers size={9} /> {floorName(floors.find(floor => floor.id === floorOf(agent))!)}</span>}</span><span className={`af-agent-status ${agent.status}`} title={agent.status}>{agent.status === 'working' ? <Zap size={12} /> : agent.status === 'thinking' ? <span className="af-thinking">···</span> : agent.status === 'blocked' ? '!' : <Coffee size={12} />}</span>
            </button>)}
            {!visibleAgents.length && <p className="af-empty">{state.agents.length ? 'No matching agents.' : 'No agents on this floor yet.'}</p>}
          </div>
          <div className="af-roster-bottom">
            {selected ? <div className="af-selected-detail"><div className="af-eyebrow">SELECTED AGENT</div><strong><span style={{ background: selected.color }} />{selected.name}</strong><p>{selected.task}</p><label>Location<select aria-label={`Move ${selected.name}`} value={selected.zone} onChange={event => store.dispatch({ type: 'agent.move', id: selected.id, zone: event.target.value })}>{Object.entries(zoneNames).map(([zone, name]) => <option key={zone} value={zone}>{name}</option>)}</select></label>{floors.length > 1 && <label>Floor<select aria-label={`Floor for ${selected.name}`} value={floorOf(selected)} onChange={event => { store.dispatch({ type: 'agent.move', id: selected.id, zone: selected.zone, floor: event.target.value }); setFloorId(event.target.value); }}>{floors.map(floor => <option key={floor.id} value={floor.id}>{floorName(floor)}</option>)}</select></label>}</div> : <div className="af-floor-info"><span className="af-floor-info-icon"><Layers size={20} /></span><div><strong>One floor. Many possibilities.</strong><span>{isDemo ? 'Sandbox environment' : 'Event-driven workspace'}</span></div></div>}
            <div className="af-roster-footer"><span className="af-dot" />{isDemo ? 'All systems simulated' : 'Ready for agent events'}<span>v0.1.0</span></div>
          </div>
        </aside>

        <main className="af-stage" aria-label="3D workspace">
          <div className="af-stage-top"><div className="af-floor-tabs" aria-label="Floors" role="group"><span className="af-live-dot" title="Live floor" />{floors.map((floor, index) => <button key={floor.id} type="button" className={floor.id === currentFloor.id ? 'active' : ''} aria-pressed={floor.id === currentFloor.id} onClick={() => setFloorId(floor.id)}><span className="af-floor-number">{String(index + 1).padStart(2, '0')}</span><span className="af-floor-name">{floorName(floor)}</span><span className="af-floor-count">{state.agents.filter(agent => floorOf(agent) === floor.id).length}</span></button>)}{floors.length < MAX_FLOORS && <IconButton label="Add floor" onClick={addFloor}><Plus size={14} /></IconButton>}</div><div className="af-stage-actions"><IconButton label="Customize this floor" onClick={() => { setConfirmRemove(false); setDialog('floor'); }}><SlidersHorizontal size={15} /></IconButton><IconButton label={playing ? 'Pause movement' : 'Resume movement'} onClick={() => setPlaying(previous => !previous)}>{playing ? <Pause size={15} /> : <Play size={15} />}</IconButton><IconButton label="Reset camera" onClick={() => scene.current?.resetView()}><RotateCcw size={15} /></IconButton></div></div>
          <div className="af-scene" ref={viewport} />
          {popupAgent && <div ref={popupRef} className={`af-agent-popup ${popupAgent.id === selectedId ? 'pinned' : ''}`} style={{ visibility: 'hidden' }} aria-label={`${popupAgent.name} task status`}>
            <div className="af-popup-head"><span className="af-popup-swatch" style={{ background: popupAgent.color }} /><div><strong>{popupAgent.name}</strong><span>{popupAgent.role}</span></div><span className={`af-status-pill ${popupAgent.status}`}>{statusNames[popupAgent.status]}</span>{popupAgent.id === selectedId && <IconButton label="Close details" onClick={() => setSelectedId(null)}><X size={13} /></IconButton>}</div>
            <div className="af-popup-label">CURRENT TASK</div>
            <p className="af-popup-task">{popupAgent.task}</p>
            {popupAgent.progress !== undefined && <div className="af-progress"><div><span>Progress</span><span>{Math.round(popupAgent.progress)}%</span></div><div className="af-progress-track" role="progressbar" aria-label={`${popupAgent.name} task progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(popupAgent.progress)}><span style={{ width: `${popupAgent.progress}%`, background: popupAgent.color }} /></div></div>}
            <div className="af-popup-meta"><MapPin size={11} /> {zoneNames[popupAgent.zone]} <span>/</span> {floorName(currentFloor)}</div>
            {popupActivity && <div className="af-popup-latest"><Clock3 size={11} /><p>{popupActivity.message}</p><time dateTime={new Date(popupActivity.time).toISOString()}>{new Date(popupActivity.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>}
          </div>}
          {renderError && <div className="af-render-error" role="alert"><Box size={28} /><p>{renderError}</p><button className="af-button" onClick={() => setRetry(previous => previous + 1)}>Retry 3D</button></div>}
          <div className="af-stage-compass" aria-hidden="true"><span>N</span><ArrowUpRight size={20} /><span>E</span></div>
          <div className="af-view-tools"><IconButton label="Zoom in" onClick={() => scene.current?.zoom(1)}><Plus size={17} /></IconButton><IconButton label="Zoom out" onClick={() => scene.current?.zoom(-1)}><Minus size={17} /></IconButton><span /><IconButton label="Top view" onClick={() => scene.current?.topView()}><Maximize size={16} /></IconButton><IconButton label="Toggle name labels" active={options.labels} onClick={() => patchOptions({ labels: !options.labels })}><Eye size={16} /></IconButton></div>
          <div className="af-scene-footer"><span><MousePointer2 size={12} /> Hover or select an agent</span><div className="af-view-switch"><button className="active" onClick={() => scene.current?.resetView()}><Cuboid size={13} /> Isometric</button><button onClick={() => scene.current?.topView()}><Grid2X2 size={13} /> Top</button></div><span className="af-three-credit">THREE.JS <span>↗</span></span></div>
        </main>

        <aside className="af-activity" aria-label="Live activity" ref={activityPanel} tabIndex={-1}>
          <div className="af-panel-heading"><h2>Live activity</h2><span className="af-live-badge"><span className="af-dot" />{playing ? 'LIVE' : 'PAUSED'}</span></div>
          <div className="af-activity-caption">{isDemo ? 'A little progress, all the time.' : 'Updates from your connected agents.'}</div>
          <div className="af-feed">
            {state.activities.map((item, index) => {
              const agent = state.agents.find(entry => entry.id === item.id) ?? (isDemo ? demoAgents.find(entry => entry.id === item.id) : undefined);
              return <article className="af-feed-item" key={item.key}><span className="af-feed-marker" style={{ '--agent-color': agent?.color ?? '#83958f' } as React.CSSProperties}>{index === 0 ? <Zap size={12} /> : <Check size={11} />}</span><div><div className="af-feed-meta"><strong>{agent?.name ?? item.id}</strong><time dateTime={new Date(item.time).toISOString()}>{new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><p>{item.message}</p>{index === 0 && <span className="af-new-tag">LATEST UPDATE</span>}</div></article>;
            })}
            {!state.activities.length && <div className="af-empty"><Radio size={24} /><p>Waiting for the first event.</p></div>}
          </div>
          <div className="af-integration-nudge"><span className="af-code-icon"><Braces size={21} /></span><strong>Bring your own agents.</strong><p>Same floor. Your stack.</p><button onClick={() => setDialog('connect')}>Connect a source <ArrowUpRight size={15} /></button></div>
        </aside>
      </div>

      <section className="af-stats" aria-label="Workspace statistics"><div className="af-stat"><span className="af-stat-icon"><Users size={18} /></span><div><span>Agents on floor</span><strong>{state.agents.length.toString().padStart(2, '0')}<small>total</small></strong></div></div><div className="af-stat"><span className="af-stat-icon working"><Zap size={18} /></span><div><span>Working</span><strong>{working.toString().padStart(2, '0')}<small>in the flow</small></strong></div></div><div className="af-stat"><span className="af-stat-icon thinking"><Activity size={18} /></span><div><span>Thinking</span><strong>{thinking.toString().padStart(2, '0')}<small>connecting dots</small></strong></div></div><div className="af-stat"><span className="af-stat-icon idle"><Coffee size={18} /></span><div><span>{blocked ? 'Blocked / idle' : 'Taking a breather'}</span><strong>{(idle + blocked).toString().padStart(2, '0')}<small>{blocked ? `${blocked} need attention` : 'standing by'}</small></strong></div></div></section>
      <footer className="af-footer"><span><span className="af-dot" />{isDemo ? 'Demo mode' : connection === 'connected' ? 'Event stream connected' : providedStore ? 'Local integration' : 'Waiting for connection'}<span className="af-footer-separator">/</span>{isDemo ? 'No real agents connected' : `${state.revision} events received`}</span><span>Built for the way agents work.<span className="af-footer-separator">/</span><button onClick={() => setDialog('connect')}>Integration API <ArrowUpRight size={11} /></button></span></footer>
    </div>

    {dialog === 'appearance' && <Dialog title="Make it your floor" onClose={() => setDialog(null)}><div className="af-dialog-body"><p className="af-dialog-intro">Appearance</p><fieldset><legend>Theme</legend><div className="af-theme-picker">{([['studio', 'Daylight studio'], ['midnight', 'After hours'], ['blueprint', 'Blueprint']] as [Theme, string][]).map(([value, name]) => <button key={value} className={options.theme === value ? 'chosen' : ''} aria-pressed={options.theme === value} onClick={() => patchOptions({ theme: value })}><span className={`af-theme-sample ${value}`}><span /><span /><span />{options.theme === value && <Check size={17} />}</span><span>{name}</span></button>)}</div></fieldset><fieldset><legend>Art direction</legend><div className="af-art-picker">{([['soft', 'Soft 3D', <Cuboid size={23} />], ['voxel', 'Voxel', <Box size={23} />], ['wireframe', 'Wireframe', <Grid2X2 size={23} />]] as [ArtStyle, string, ReactNode][]).map(([value, name, icon]) => <button key={value} className={options.art === value ? 'chosen' : ''} aria-pressed={options.art === value} onClick={() => patchOptions({ art: value })}>{icon}<span>{name}</span></button>)}</div></fieldset><div className="af-toggle-list">{([['labels', 'Agent & zone labels'], ['motion', 'Character animation'], ['shadows', 'Soft shadows']] as [keyof Pick<SceneOptions, 'labels' | 'motion' | 'shadows'>, string][]).map(([key, name]) => <label key={key}>{name}<input type="checkbox" role="switch" checked={options[key]} onChange={event => patchOptions({ [key]: event.target.checked })} /></label>)}</div><button className="af-button af-full-width" onClick={() => setDialog(null)}>Done <Check size={15} /></button></div></Dialog>}

    {dialog === 'connect' && <Dialog title="Connect your agents" onClose={() => setDialog(null)}><div className="af-dialog-body"><div className="af-connection-status"><Plug size={22} /><div><strong>{isDemo ? 'You are in the sandbox' : connection === 'connected' ? 'Your event stream is connected' : 'Ready for a live source'}</strong><p>{isDemo ? 'Connect a source to replace the demo crew.' : `Stream status: ${connection}`}</p></div></div><form onSubmit={event => { event.preventDefault(); connect(); }}><label className="af-field">Server-sent events endpoint<input type="url" required value={endpoint} onChange={event => setEndpoint(event.target.value)} placeholder="http://127.0.0.1:4310/events" /></label>{connectionError && <p className="af-form-error" role="alert">{connectionError}</p>}<button type="submit" className="af-button af-primary af-full-width"><Radio size={16} /> Connect event stream</button></form><div className="af-code-section"><h3>Local relay</h3><pre><code>npx agent-floor-ui relay</code></pre><h3>Publish an event</h3><pre><code>{`POST http://127.0.0.1:4310/events\nContent-Type: application/json\n\n{\n  "type": "agent.move",\n  "id": "your-agent-id",\n  "zone": "lab"\n}`}</code></pre><p>Register agents with <code>agent.upsert</code> first. The relay accepts events from your own adapter, script, or agent hooks.</p></div><div className="af-dialog-actions">{!isDemo && <button className="af-button" onClick={() => { disconnect.current?.(); disconnect.current = null; }}>Disconnect stream</button>}<button className="af-button" onClick={enableDemo}><Play size={14} /> {isDemo ? 'Restart demo' : 'Use demo crew'}</button></div></div></Dialog>}

    {dialog === 'floor' && <Dialog title="Customize floor" onClose={() => setDialog(null)}><div className="af-dialog-body">
      <p className="af-dialog-intro">Floor {String(floorIndex + 1).padStart(2, '0')} of {floors.length}</p>
      <label className="af-field">Floor name<input value={currentFloor.name} maxLength={40} placeholder="Untitled floor" onChange={event => patchFloor({ name: event.target.value })} /></label>
      <fieldset><legend>Flooring</legend><div className="af-surface-picker">{surfaces.map(([value, name]) => <button key={value} type="button" className={currentFloor.surface === value ? 'chosen' : ''} aria-pressed={currentFloor.surface === value} onClick={() => patchFloor({ surface: value })}><span className={`af-surface-sample ${value}`} style={value === 'carpet' ? { background: currentFloor.accent } : undefined} /><span>{name}</span></button>)}</div></fieldset>
      <fieldset><legend>Wall color</legend><div className="af-swatches">{wallColors.map(color => <button key={color} type="button" aria-label={`Wall color ${color}`} aria-pressed={currentFloor.wall === color} className={currentFloor.wall === color ? 'chosen' : ''} style={{ background: color }} onClick={() => patchFloor({ wall: color })}>{currentFloor.wall === color && <Check size={13} />}</button>)}</div></fieldset>
      <fieldset><legend>Rug and carpet accent</legend><div className="af-swatches">{accentColors.map(color => <button key={color} type="button" aria-label={`Accent color ${color}`} aria-pressed={currentFloor.accent === color} className={currentFloor.accent === color ? 'chosen' : ''} style={{ background: color }} onClick={() => patchFloor({ accent: color })}>{currentFloor.accent === color && <Check size={13} />}</button>)}</div></fieldset>
      <fieldset><legend>Workstations</legend><div className="af-segmented">{([2, 4, 6] as const).map(count => <button key={count} type="button" aria-pressed={currentFloor.desks === count} className={currentFloor.desks === count ? 'chosen' : ''} onClick={() => patchFloor({ desks: count })}>{count} desks</button>)}</div></fieldset>
      <div className="af-toggle-list">{floorToggles.map(([key, name]) => <label key={key}>{name}<input type="checkbox" role="switch" checked={currentFloor[key]} onChange={event => patchFloor({ [key]: event.target.checked })} /></label>)}</div>
      <div className="af-dialog-actions"><button type="button" className="af-button" onClick={() => setDialog('appearance')}><Palette size={14} /> Theme and art style</button>{floors.length > 1 && (confirmRemove ? <button type="button" className="af-button af-danger" onClick={removeFloor}><Trash2 size={14} /> Confirm: agents move to {floorName(floors.find(floor => floor.id !== currentFloor.id)!)}</button> : <button type="button" className="af-button af-danger" onClick={() => setConfirmRemove(true)}><Trash2 size={14} /> Remove floor</button>)}</div>
      <button type="button" className="af-button af-primary af-full-width af-dialog-done" onClick={() => setDialog(null)}>Done <Check size={15} /></button>
    </div></Dialog>}

    {dialog === 'help' && <Dialog title="Workspace reference" onClose={() => setDialog(null)}><div className="af-dialog-body af-help"><h3>Explore the floor</h3><p>Drag to orbit. Scroll or pinch to zoom. Hover a character to see its task and status; select it to pin the card. Switch floors with the tabs above the scene.</p><h3>Floors</h3><p>Add up to {MAX_FLOORS} floors and customize flooring, colors, desks, and rooms. Floors are saved in this browser. Agents choose a floor with the optional <code>floor</code> field; unknown floors fall back to the first floor.</p><h3>Integration modes</h3><p>Embed the React component, mount the JavaScript plugin, or connect a server-sent event stream. Install the included skill into a VS Code or Claude project for integration guidance.</p><h3>Demo & live data</h3><p>Demo mode simulates six agents. Live mode only reflects events from your source; it does not automatically observe editor sessions or execute agent tasks.</p><h3>Event types</h3><pre>agent.upsert<br />agent.move<br />agent.remove<br />activity</pre></div></Dialog>}
  </div>;
}