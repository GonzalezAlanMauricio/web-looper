import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, Pause, RotateCcw, Plus, Trash2, Scissors, 
  Video, SkipBack, SkipForward, Maximize2, Volume2, 
  MapPin, Check, ChevronLeft, ChevronRight, Gauge,
  Library, Save, FolderOpen
} from 'lucide-react';
import './App.css';

interface Segment {
  id: string;
  start: number;
  end: number;
  name: string;
  color: string;
}

interface Project {
  id: string;
  name: string;
  segments: Segment[];
  lastModified: number;
  videoUrl?: string;
}

const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
  '#ec4899', '#06b6d4', '#84cc16', '#f43f5e', '#6366f1'
];

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [markIn, setMarkIn] = useState<number | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);

  const toggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) {
      playerContainerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // Initialize DB
  const getDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('VideoLooperProjectsDB', 1);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('videos')) {
          db.createObjectStore('videos');
        }
      };
      request.onsuccess = (e: any) => resolve(e.target.result);
      request.onerror = (e) => reject(e);
    });
  };

  // Load projects list and last active project on mount
  useEffect(() => {
    const savedProjects = localStorage.getItem('looper_projects_metadata');
    const lastActiveId = localStorage.getItem('looper_active_project_id');
    
    if (savedProjects) {
      try {
        const parsed = JSON.parse(savedProjects);
        setProjects(parsed);
        if (lastActiveId) {
          loadProject(lastActiveId, parsed);
        }
      } catch (e) {
        console.error('Failed to load projects metadata', e);
      }
    }
    isInitialLoad.current = false;
  }, []);

  // Sync segments to project state and localStorage
  useEffect(() => {
    if (isInitialLoad.current || !activeProjectId) return;
    
    setProjects(prev => {
      const updated = prev.map(p => 
        p.id === activeProjectId 
          ? { ...p, segments, lastModified: Date.now() } 
          : p
      );
      localStorage.setItem('looper_projects_metadata', JSON.stringify(updated));
      return updated;
    });
  }, [segments, activeProjectId]);

  const loadProject = async (id: string, currentProjects?: Project[]) => {
    const projectList = currentProjects || projects;
    const project = projectList.find(p => p.id === id);
    if (!project) return;

    if (project.videoUrl) {
      if (videoSrc && videoSrc.startsWith('blob:')) URL.revokeObjectURL(videoSrc);
      setVideoError(false);
      setVideoSrc(project.videoUrl);
      setSegments(project.segments);
      setActiveProjectId(id);
      localStorage.setItem('looper_active_project_id', id);
      setMarkIn(null);
      return;
    }

    try {
      const db = await getDB();
      const transaction = db.transaction(['videos'], 'readonly');
      const store = transaction.objectStore('videos');
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        if (getRequest.result) {
          if (videoSrc) URL.revokeObjectURL(videoSrc);
          const file = getRequest.result;
          setVideoError(false);
          setVideoSrc(URL.createObjectURL(file));
          setSegments(project.segments);
          setActiveProjectId(id);
          localStorage.setItem('looper_active_project_id', id);
          setMarkIn(null);
        } else {
          // No cached video for this project either (e.g. imported JSON whose URL 404s)
          setVideoError(true);
          setVideoSrc(null);
          setSegments(project.segments);
          setActiveProjectId(id);
          localStorage.setItem('looper_active_project_id', id);
          setMarkIn(null);
        }
      };
    } catch (e) {
      console.error('Failed to load video from IndexedDB', e);
    }
  };

  const deleteProject = async (id: string) => {
    const updatedProjects = projects.filter(p => p.id !== id);
    setProjects(updatedProjects);
    localStorage.setItem('looper_projects_metadata', JSON.stringify(updatedProjects));
    
    const db = await getDB();
    const transaction = db.transaction(['videos'], 'readwrite');
    transaction.objectStore('videos').delete(id);

    if (activeProjectId === id) {
      setActiveProjectId(null);
      setVideoSrc(null);
      setVideoError(false);
      setSegments([]);
      localStorage.removeItem('looper_active_project_id');
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const id = Math.random().toString(36).substring(2, 11);
      const newProject: Project = {
        id,
        name: file.name,
        segments: [],
        lastModified: Date.now()
      };

      try {
        const db = await getDB();
        const transaction = db.transaction(['videos'], 'readwrite');
        transaction.objectStore('videos').put(file, id);
        
        const updatedProjects = [newProject, ...projects];
        setProjects(updatedProjects);
        setSegments([]);
        setActiveProjectId(id);
        setVideoError(false);
        setVideoSrc(URL.createObjectURL(file));
        localStorage.setItem('looper_active_project_id', id);
        localStorage.setItem('looper_projects_metadata', JSON.stringify(updatedProjects));
      } catch (e) {
        console.error('Failed to save video to IndexedDB', e);
      }
    }
  };

  const handleImportProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.video || !Array.isArray(data.segments)) {
        throw new Error('JSON must have a "video" URL and a "segments" array');
      }

      const id = data.id || Math.random().toString(36).substring(2, 11);
      const segments: Segment[] = data.segments.map((s: any, i: number) => ({
        id: s.id || Math.random().toString(36).substring(2, 11),
        start: s.start,
        end: s.end,
        name: s.name || `Segment ${i + 1}`,
        color: s.color || COLORS[i % COLORS.length]
      }));

      const newProject: Project = {
        id,
        name: data.name || file.name.replace(/\.json$/i, ''),
        segments,
        lastModified: Date.now(),
        videoUrl: data.video
      };

      const updatedProjects = [newProject, ...projects.filter(p => p.id !== id)];
      setProjects(updatedProjects);
      setSegments(segments);
      setActiveProjectId(id);
      setVideoError(false);
      setVideoSrc(data.video);
      localStorage.setItem('looper_active_project_id', id);
      localStorage.setItem('looper_projects_metadata', JSON.stringify(updatedProjects));
    } catch (e) {
      console.error('Failed to import project JSON', e);
      alert(`Failed to import project: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleRelinkVideo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activeProjectId) return;

    try {
      const db = await getDB();
      const transaction = db.transaction(['videos'], 'readwrite');
      transaction.objectStore('videos').put(file, activeProjectId);

      if (videoSrc && videoSrc.startsWith('blob:')) URL.revokeObjectURL(videoSrc);
      setVideoError(false);
      setVideoSrc(URL.createObjectURL(file));

      // Drop the stale videoUrl so future loads read from IndexedDB instead
      setProjects(prev => {
        const updated = prev.map(p =>
          p.id === activeProjectId ? { ...p, videoUrl: undefined } : p
        );
        localStorage.setItem('looper_projects_metadata', JSON.stringify(updated));
        return updated;
      });
    } catch (e) {
      console.error('Failed to relink video to IndexedDB', e);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      videoRef.current.playbackRate = playbackSpeed;
    }
  };

  const handleMarkPoint = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    
    if (markIn === null) {
      setMarkIn(time);
    } else {
      const start = Math.min(markIn, time);
      const end = Math.max(markIn, time + 0.1);
      
      const newSegment: Segment = {
        id: Math.random().toString(36).substring(2, 11),
        start,
        end,
        name: `Segment ${segments.length + 1}`,
        color: COLORS[segments.length % COLORS.length]
      };
      
      setSegments([...segments, newSegment]);
      setMarkIn(null);
    }
  };

  const updateSegment = (id: string, field: 'start' | 'end', value: number) => {
    setSegments(segments.map(s => {
      if (s.id === id) {
        const updated = { ...s, [field]: Math.max(0, Math.min(value, duration)) };
        if (field === 'start' && updated.start >= updated.end) updated.end = Math.min(duration, updated.start + 0.05);
        if (field === 'end' && updated.end <= updated.start) updated.start = Math.max(0, updated.end - 0.05);
        return updated;
      }
      return s;
    }));
  };

  const toggleLoop = (id: string) => {
    if (activeSegmentId === id) {
      setActiveSegmentId(null);
    } else {
      setActiveSegmentId(id);
      const segment = segments.find(s => s.id === id);
      if (segment && videoRef.current) {
        videoRef.current.currentTime = segment.start;
        videoRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    if (activeSegmentId) {
      const segment = segments.find(s => s.id === activeSegmentId);
      if (segment && time >= segment.end) {
        videoRef.current.currentTime = segment.start;
      }
    }
  }, [activeSegmentId, segments]);

  const seek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !duration) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    seek(percentage * duration);
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const changeSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  return (
    <div className={`app-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="logo">
          <Video className="logo-icon" />
          <span>Looper Pro</span>
          <button className="collapse-btn" onClick={() => setIsSidebarCollapsed(true)}>
            <ChevronLeft size={20} />
          </button>
        </div>
        
        <div className="sidebar-section">
          <div className="section-header">
            <h3><Library size={16} /> Projects</h3>
            <label className="icon-btn-label" title="Import Project (JSON)">
              <Save size={18} />
              <input type="file" accept="application/json,.json" onChange={handleImportProject} hidden />
            </label>
            <label className="icon-btn-label" title="New Project">
              <Plus size={18} />
              <input type="file" accept="video/*" onChange={handleFileChange} hidden />
            </label>
          </div>
          <div className="projects-list">
            {projects.length === 0 && <p className="empty-msg">No projects yet</p>}
            {projects.map(p => (
              <div key={p.id} className={`project-item ${activeProjectId === p.id ? 'active' : ''}`} onClick={() => loadProject(p.id)}>
                <FolderOpen size={16} />
                <span className="project-name">{p.name}</span>
                <button className="delete-project-btn" onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {activeProjectId && (
          <div className="sidebar-section segments-section">
            <div className="section-header">
              <h3><Scissors size={16} /> Segments</h3>
              <button className="icon-btn" onClick={() => {
                if (!videoRef.current) return;
                const t = videoRef.current.currentTime;
                setSegments([...segments, {
                  id: Math.random().toString(36).substring(2, 11),
                  start: t,
                  end: Math.min(t + 5, duration),
                  name: `Clip ${segments.length + 1}`,
                  color: COLORS[segments.length % COLORS.length]
                }]);
              }}>
                <Plus size={18} />
              </button>
            </div>

            <div className="segments-list">
              {segments.length === 0 ? (
                <div className="empty-state">
                  <p>No segments yet</p>
                  <small>Use markers or "+"</small>
                </div>
              ) : (
                segments.map(s => (
                  <div key={s.id} className={`segment-item ${activeSegmentId === s.id ? 'active' : ''}`} style={{'--segment-color': s.color} as any}>
                    <div className="segment-main">
                      <div className="segment-color-dot" />
                      <input 
                        className="segment-name-input"
                        value={s.name}
                        onChange={(e) => setSegments(segments.map(seg => seg.id === s.id ? {...seg, name: e.target.value} : seg))}
                      />
                    </div>
                    <div className="segment-times">
                      <div className="time-adjust-group">
                        <div className="time-label">Start: {formatTime(s.start)}</div>
                        <div className="adjust-buttons">
                          <button onClick={() => updateSegment(s.id, 'start', s.start - 1)}>-1s</button>
                          <button onClick={() => updateSegment(s.id, 'start', s.start - 0.05)}>-50ms</button>
                          <button onClick={() => updateSegment(s.id, 'start', s.start + 0.05)}>+50ms</button>
                          <button onClick={() => updateSegment(s.id, 'start', s.start + 1)}>+1s</button>
                        </div>
                      </div>
                      <div className="time-adjust-group">
                        <div className="time-label">End: {formatTime(s.end)}</div>
                        <div className="adjust-buttons">
                          <button onClick={() => updateSegment(s.id, 'end', s.end - 1)}>-1s</button>
                          <button onClick={() => updateSegment(s.id, 'end', s.end - 0.05)}>-50ms</button>
                          <button onClick={() => updateSegment(s.id, 'end', s.end + 0.05)}>+50ms</button>
                          <button onClick={() => updateSegment(s.id, 'end', s.end + 1)}>+1s</button>
                        </div>
                      </div>
                    </div>
                    <div className="segment-actions">
                      <button onClick={() => toggleLoop(s.id)} className={activeSegmentId === s.id ? 'btn-looping' : ''}>
                        {activeSegmentId === s.id ? <RotateCcw size={16} className="spinning" /> : <RotateCcw size={16} />}
                        {activeSegmentId === s.id ? 'Looping' : 'Loop'}
                      </button>
                      <button onClick={() => setSegments(segments.filter(seg => seg.id !== s.id))} className="btn-delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </aside>

      {isSidebarCollapsed && (
        <button className="expand-btn" onClick={() => setIsSidebarCollapsed(false)}>
          <ChevronRight size={24} />
        </button>
      )}

      <main className="main-stage">
        {activeProjectId && (videoError || !videoSrc) && projects.some(p => p.id === activeProjectId) ? (
          <div className="hero">
            <div className="hero-content">
              <div className="hero-icon-wrapper">
                <Video size={48} />
              </div>
              <h2>Video not found</h2>
              <p>This project's video couldn't be loaded on this device. Select the matching video file to relink it — segments are preserved.</p>
              <label className="cta-button">
                <Plus size={20} /> Select Video File
                <input type="file" accept="video/*" onChange={handleRelinkVideo} hidden />
              </label>
            </div>
          </div>
        ) : !videoSrc ? (
          <div className="hero">
            <div className="hero-content">
              <div className="hero-icon-wrapper">
                <Video size={48} />
              </div>
              <h2>Manage Projects</h2>
              <p>Create a new project or select an existing one from the sidebar.</p>
              <label className="cta-button">
                <Plus size={20} /> Create New Project
                <input type="file" accept="video/*" onChange={handleFileChange} hidden />
              </label>
            </div>
          </div>
        ) : (
          <div className="player-container" ref={playerContainerRef}>
            <div className="video-viewport">
              <video 
                ref={videoRef}
                src={videoSrc}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onError={() => setVideoError(true)}
                onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}
              />
              
              {activeSegmentId && (
                <div className="loop-indicator">
                  <RotateCcw size={16} className="spinning" />
                  LOOP ACTIVE
                </div>
              )}
            </div>

            <div className="player-ui">
              <div className="timeline-wrapper">
                <div className="time-info">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
                <div 
                  className="timeline" 
                  ref={timelineRef}
                  onClick={handleTimelineClick}
                >
                  <div className="timeline-bg" />
                  <div 
                    className="timeline-progress" 
                    style={{ width: `${(currentTime / duration) * 100}%` }} 
                  />
                  
                  {segments.map(s => (
                    <div 
                      key={s.id}
                      className="timeline-segment"
                      style={{
                        left: `${(s.start / duration) * 100}%`,
                        width: `${((s.end - s.start) / duration) * 100}%`,
                        backgroundColor: s.color
                      }}
                    />
                  ))}

                  {markIn !== null && (
                    <div 
                      className="mark-in-line"
                      style={{ left: `${(markIn / duration) * 100}%` }}
                    >
                      <MapPin size={12} className="mark-icon" />
                    </div>
                  )}

                  <div 
                    className="timeline-handle" 
                    style={{ left: `${(currentTime / duration) * 100}%` }} 
                  />
                </div>
              </div>

              <div className="player-controls">
                <div className="control-group">
                  <button onClick={() => seek(currentTime - 5)}><SkipBack size={20} /></button>
                  <button className="play-btn" onClick={() => isPlaying ? videoRef.current?.pause() : videoRef.current?.play()}>
                    {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
                  </button>
                  <button onClick={() => seek(currentTime + 5)}><SkipForward size={20} /></button>
                </div>

                <div className="control-group center">
                  <button 
                    className={`marker-btn ${markIn !== null ? 'marking' : ''}`}
                    onClick={handleMarkPoint}
                  >
                    {markIn === null ? (
                      <><Scissors size={18} /> Mark Start</>
                    ) : (
                      <><Check size={18} /> Mark End</>
                    )}
                  </button>
                </div>

                <div className="control-group end">
                  <div className="speed-selector">
                    <Gauge size={20} />
                    <select value={playbackSpeed} onChange={(e) => changeSpeed(parseFloat(e.target.value))}>
                      {SPEEDS.map(s => <option key={s} value={s}>{s}x</option>)}
                    </select>
                  </div>
                  <div className="volume-control">
                    <Volume2 size={20} />
                  </div>
                  <button onClick={toggleFullscreen}><Maximize2 size={20} /></button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
