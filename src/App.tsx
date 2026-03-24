import React, { useState, useEffect, useCallback } from 'react';
import { 
  Trophy, 
  Timer, 
  AlertCircle, 
  RotateCcw, 
  Undo2, 
  Redo2, 
  Pencil, 
  CheckCircle2, 
  Settings, 
  User as UserIcon,
  ChevronLeft,
  ChevronRight,
  Play,
  Moon,
  Sun,
  Feather,
  Leaf,
  Flame,
  Zap,
  Skull
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type Difficulty = 'easy' | 'medium' | 'hard';
type Cell = {
  value: number;
  initial: boolean;
  notes: number[];
  error?: boolean;
};

// --- API Helpers ---
const API = {
  getPuzzle: async (difficulty: Difficulty) => {
    const res = await fetch(`/api/puzzle?difficulty=${difficulty}&t=${Date.now()}`, { cache: 'no-store' });
    return res.json();
  },
  getDaily: async () => {
    const res = await fetch(`/api/daily?t=${Date.now()}`, { cache: 'no-store' });
    return res.json();
  },
  submitScore: async (data: { username: string; time: number; mistakes: number; difficulty: Difficulty; isDaily?: boolean }) => {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  getLeaderboard: async (difficulty: Difficulty) => {
    const res = await fetch(`/api/leaderboard?difficulty=${difficulty}`);
    return res.json();
  },
};

// --- Components ---

const SudokuGrid = ({ 
  grid, 
  selected, 
  onSelect, 
  highlights 
}: { 
  grid: Cell[][], 
  selected: [number, number] | null, 
  onSelect: (r: number, c: number) => void,
  highlights: { row: number; col: number; box: number; value: number }
}) => {
  return (
    <div className="grid grid-cols-9 border-4 border-indigo-200 dark:border-indigo-900 bg-indigo-100 dark:bg-zinc-800 gap-[1px] w-full max-w-[500px] aspect-square overflow-hidden rounded-xl shadow-2xl">
      {grid.map((row, r) => (
        row.map((cell, c) => {
          const isSelected = selected?.[0] === r && selected?.[1] === c;
          const blockIndex = Math.floor(r / 3) * 3 + Math.floor(c / 3);
          const isDarkBlock = blockIndex % 2 === 1;
          const isHighlighted = 
            highlights.row === r || 
            highlights.col === c || 
            highlights.box === blockIndex ||
            (highlights.value !== 0 && cell.value === highlights.value);

          return (
            <motion.div
              key={`${r}-${c}`}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelect(r, c)}
              className={cn(
                "relative flex items-center justify-center text-xl sm:text-2xl font-medium cursor-pointer transition-colors duration-200",
                isDarkBlock ? "bg-zinc-50/50 dark:bg-zinc-800/30" : "bg-white dark:bg-zinc-900",
                (r + 1) % 3 === 0 && r !== 8 && "border-b-2 border-indigo-200 dark:border-indigo-900",
                (c + 1) % 3 === 0 && c !== 8 && "border-r-2 border-indigo-200 dark:border-indigo-900",
                isSelected ? "bg-indigo-200 dark:bg-indigo-800" : isHighlighted ? "bg-indigo-50/80 dark:bg-indigo-900/20" : "",
                cell.initial ? "text-zinc-800 dark:text-zinc-100 font-bold" : "text-indigo-600 dark:text-indigo-400",
                cell.error && "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
              )}
            >
              {cell.value !== 0 ? (
                cell.value
              ) : (
                <div className="grid grid-cols-3 gap-0.5 p-0.5 w-full h-full">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                    <div key={n} className="text-[8px] sm:text-[10px] leading-none flex items-center justify-center text-zinc-500 dark:text-zinc-400 font-bold">
                      {cell.notes.includes(n) ? n : ""}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })
      ))}
    </div>
  );
};

const NumberPad = ({ onInput, disabled }: { onInput: (n: number) => void, disabled?: boolean }) => {
  return (
    <div className="grid grid-cols-5 sm:grid-cols-9 gap-2 w-full max-w-[500px] mt-6">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
        <motion.button
          key={n}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onInput(n)}
          disabled={disabled}
          className="flex items-center justify-center h-12 sm:h-14 bg-white dark:bg-zinc-800 border-2 border-indigo-100 dark:border-zinc-700 rounded-lg text-xl font-semibold text-zinc-900 dark:text-zinc-100 hover:border-indigo-500 dark:hover:border-indigo-400 transition-all disabled:opacity-50 shadow-sm"
        >
          {n}
        </motion.button>
      ))}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => onInput(0)}
        disabled={disabled}
        className="col-span-1 sm:hidden flex items-center justify-center h-12 bg-indigo-50 dark:bg-zinc-800 border-2 border-indigo-100 dark:border-zinc-700 rounded-lg text-sm font-semibold text-indigo-700 dark:text-indigo-400"
      >
        Clear
      </motion.button>
    </div>
  );
};

export default function App() {
  const [view, setView] = useState<'menu' | 'game' | 'leaderboard'>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [grid, setGrid] = useState<Cell[][]>([]);
  const [solution, setSolution] = useState<number[][]>([]);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [time, setTime] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [notesMode, setNotesMode] = useState(false);
  const [history, setHistory] = useState<Cell[][][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [username, setUsername] = useState(localStorage.getItem('sudoku_user') || '');
  const [isDaily, setIsDaily] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Removed automatic prompt on load
  }, [username]);

  // --- Game Logic ---
  const startNewGame = useCallback(async (diff: Difficulty, daily = false) => {
    try {
      let currentUsername = username;
      
      if (!currentUsername) {
        const promptMsg = daily 
          ? "Turnuvada görünecek ismini yaz canım (en az 3 karakter):" 
          : "Oyuna girmek için ismini yaz canım (en az 3 karakter):";
        const name = prompt(promptMsg, currentUsername || "");
        
        if (!name || name.trim().length < 3) {
          if (name !== null) alert("İsim en az 3 karakter olmalı canım!");
          return;
        }
        currentUsername = name.trim();
        setUsername(currentUsername);
        localStorage.setItem('sudoku_user', currentUsername);
      }

      const data = daily ? await API.getDaily() : await API.getPuzzle(diff);
      const newGrid = data.puzzle.map((row: number[]) => 
        row.map((val: number) => ({
          value: val,
          initial: val !== 0,
          notes: [],
        }))
      );
      setGrid(newGrid);
      setSolution(data.solution);
      setDifficulty(diff);
      setIsDaily(daily);
      setTime(0);
      setMistakes(0);
      setIsGameOver(false);
      setSelected(null);
      setHistory([JSON.parse(JSON.stringify(newGrid))]);
      setHistoryIndex(0);
      setView('game');
    } catch (error) {
      console.error("Failed to start game:", error);
      alert("Oyun yüklenirken bir hata oluştu. Lütfen tekrar dene canım.");
    }
  }, [username]);

  useEffect(() => {
    let timer: any;
    if (view === 'game' && !isGameOver) {
      timer = setInterval(() => setTime(t => t + 1), 1000);
    }
    return () => clearInterval(timer);
  }, [view, isGameOver]);

  const handleInput = (num: number) => {
    if (!selected || isGameOver) return;
    const [r, c] = selected;
    if (grid[r][c].initial) return;

    const newGrid = JSON.parse(JSON.stringify(grid));
    
    if (notesMode && num !== 0) {
      const cellNotes = newGrid[r][c].notes;
      if (cellNotes.includes(num)) {
        newGrid[r][c].notes = cellNotes.filter((n: number) => n !== num);
      } else {
        newGrid[r][c].notes.push(num);
      }
    } else {
      if (num !== 0 && num !== solution[r][c]) {
        setMistakes(m => m + 1);
        newGrid[r][c].error = true;
      } else {
        newGrid[r][c].error = false;
      }
      newGrid[r][c].value = num;
      newGrid[r][c].notes = [];
    }

    setGrid(newGrid);
    
    // History
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newGrid)));
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);

    // Check Win
    const isWin = newGrid.every((row: any, ri: number) => 
      row.every((cell: any, ci: number) => cell.value === solution[ri][ci])
    );
    if (isWin) {
      setIsGameOver(true);
      if (username) {
        API.submitScore({ username, time, mistakes, difficulty, isDaily });
      }
    }
  };

  const undo = () => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setGrid(JSON.parse(JSON.stringify(prev)));
      setHistoryIndex(historyIndex - 1);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setGrid(JSON.parse(JSON.stringify(next)));
      setHistoryIndex(historyIndex + 1);
    }
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const highlights = {
    row: selected?.[0] ?? -1,
    col: selected?.[1] ?? -1,
    box: selected ? Math.floor(selected[0] / 3) * 3 + Math.floor(selected[1] / 3) : -1,
    value: selected ? grid[selected[0]][selected[1]].value : 0
  };

  return (
    <div className={cn("min-h-screen transition-colors duration-500", isDarkMode ? "dark bg-zinc-950 text-zinc-100" : "bg-indigo-50/30 text-zinc-900")}>
      <div className="max-w-4xl mx-auto px-4 py-12">
        
        {/* Header */}
        {view !== 'game' && (
          <header className="flex items-center justify-between mb-12">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600 dark:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-200 dark:shadow-none">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-black tracking-tight text-indigo-600 dark:text-indigo-400">SUDOKU</h1>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors"
              >
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              {username ? (
                <button 
                  onClick={() => {
                    const name = prompt("İsmini değiştirmek ister misin canım?", username);
                    if (name && name.trim().length >= 3) {
                      setUsername(name.trim());
                      localStorage.setItem('sudoku_user', name.trim());
                    } else if (name !== null) {
                      alert("İsim en az 3 karakter olmalı canım!");
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full text-sm font-medium shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <UserIcon className="w-4 h-4 text-indigo-500" />
                  {username}
                </button>
              ) : (
                <button 
                  onClick={() => {
                    const name = prompt("İsmini gir canım (en az 3 karakter):");
                    if (name && name.trim().length >= 3) {
                      setUsername(name.trim());
                      localStorage.setItem('sudoku_user', name.trim());
                    } else if (name !== null) {
                      alert("İsim en az 3 karakter olmalı canım!");
                    }
                  }}
                  className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  İsim Belirle
                </button>
              )}
            </div>
          </header>
        )}

        <AnimatePresence mode="wait">
          {view === 'menu' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center py-12"
            >
              <div className="w-full max-w-4xl space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Daily Challenge */}
                  <div className="md:col-span-2 bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-800 p-8 md:p-10 rounded-[2rem] text-white shadow-2xl relative overflow-hidden group">
                    {/* Background decoration */}
                    <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-700"></div>
                    <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-48 h-48 bg-indigo-400 opacity-20 rounded-full blur-2xl"></div>
                    
                    <div className="relative z-10 h-full flex flex-col justify-between min-h-[240px]">
                      <div>
                        <div className="flex items-center gap-2 mb-6">
                          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-black/20 backdrop-blur-md rounded-full text-xs font-bold tracking-wider uppercase border border-white/10">
                            <Trophy className="w-3.5 h-3.5 text-amber-400" />
                            Günün Turnuvası
                          </span>
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 backdrop-blur-md rounded-full border border-red-500/30 ml-auto">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-red-100">CANLI</span>
                          </div>
                        </div>
                        <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">Günün Bulmacası</h2>
                        <p className="text-indigo-100 text-lg max-w-md leading-relaxed">
                          Herkesle aynı bulmacayı çöz, en hızlı sen ol ve sıralamada yerini al!
                        </p>
                      </div>
                      
                      <div className="mt-8 flex items-center gap-4">
                        <button 
                          onClick={() => startNewGame('medium', true)}
                          className="px-8 py-4 bg-white text-indigo-900 rounded-2xl font-bold hover:bg-indigo-50 hover:scale-105 active:scale-95 transition-all flex items-center gap-3 shadow-[0_0_40px_rgba(255,255,255,0.3)]"
                        >
                          <Play className="w-5 h-5 fill-current" />
                          Turnuvaya Katıl
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Leaderboard */}
                  <button
                    onClick={() => setView('leaderboard')}
                    className="bg-white dark:bg-zinc-900 p-8 md:p-10 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 hover:border-amber-500/50 dark:hover:border-amber-500/50 hover:shadow-xl hover:shadow-amber-500/10 transition-all group flex flex-col justify-between min-h-[240px] text-left relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-100 to-transparent dark:from-amber-900/20 opacity-50 rounded-bl-full"></div>
                    
                    <div className="w-16 h-16 bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-500/20 dark:to-orange-500/20 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 shadow-inner relative z-10">
                      <Trophy className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="relative z-10">
                      <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Sıralama</h3>
                      <p className="text-zinc-500 dark:text-zinc-400">Dünya genelindeki en iyi süreleri gör</p>
                    </div>
                  </button>
                </div>

                {/* Classic Modes */}
                <div className="space-y-6">
                  <div className="flex items-center gap-4 px-2">
                    <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800"></div>
                    <span className="text-sm font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Klasik Oyun</span>
                    <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800"></div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { id: 'easy', label: 'Kolay', icon: Leaf, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-500/10', border: 'hover:border-green-500' },
                      { id: 'medium', label: 'Orta', icon: Flame, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'hover:border-amber-500' },
                      { id: 'hard', label: 'Zor', icon: Zap, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-500/10', border: 'hover:border-orange-500' }
                    ].map((diff) => {
                      const Icon = diff.icon;
                      return (
                        <button
                          key={diff.id}
                          onClick={() => startNewGame(diff.id as Difficulty)}
                          className={`p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-center ${diff.border} hover:shadow-lg transition-all group flex flex-col items-center justify-center gap-4`}
                        >
                          <div className={`w-12 h-12 ${diff.bg} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform`}>
                            <Icon className={`w-6 h-6 ${diff.color}`} />
                          </div>
                          <h3 className="font-bold text-zinc-900 dark:text-zinc-100">
                            {diff.label}
                          </h3>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'game' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col w-full"
            >
              {/* Minimal Game Header */}
              <div className="flex items-center justify-between w-full mb-8">
                <button 
                  onClick={() => setView('menu')}
                  className="flex items-center gap-2 text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors font-medium"
                >
                  <ChevronLeft className="w-5 h-5" />
                  Ana Menü
                </button>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors"
                  >
                    {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col lg:flex-row gap-12 items-start">
                {/* Game Area */}
                <div className="flex-1 w-full flex flex-col items-center">
                <div className="w-full flex items-center justify-between mb-6 px-2">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/20 rounded-full text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30">
                      <Timer className="w-4 h-4" />
                      <span className="font-mono text-lg font-bold">{formatTime(time)}</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1 bg-red-50 dark:bg-red-900/20 rounded-full text-red-700 dark:text-red-400 border border-red-100 dark:border-red-900/30">
                      <AlertCircle className="w-4 h-4" />
                      <span className="font-bold">{mistakes} Hata</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isDaily && (
                      <div className="px-2 py-1 bg-amber-500 text-white rounded-full text-[8px] font-black uppercase tracking-widest animate-pulse">
                        TURNUVA
                      </div>
                    )}
                    <div className="px-3 py-1 bg-indigo-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-200 dark:shadow-none">
                      {isDaily ? "Günün Bulmacası" : difficulty}
                    </div>
                  </div>
                </div>

                <SudokuGrid 
                  grid={grid} 
                  selected={selected} 
                  onSelect={(r, c) => setSelected([r, c])}
                  highlights={highlights}
                />

                <NumberPad onInput={handleInput} disabled={isGameOver} />

                {/* Controls */}
                <div className="flex items-center gap-4 mt-8 w-full max-w-[500px]">
                  <button 
                    onClick={undo}
                    className="flex-1 flex flex-col items-center gap-1 p-3 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <Undo2 className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase">Geri</span>
                  </button>
                  <button 
                    onClick={redo}
                    className="flex-1 flex flex-col items-center gap-1 p-3 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <Redo2 className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase">İleri</span>
                  </button>
                  <button 
                    onClick={() => setNotesMode(!notesMode)}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1 p-3 border-2 rounded-xl transition-all",
                      notesMode 
                        ? "bg-zinc-900 border-zinc-900 text-white" 
                        : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    )}
                  >
                    <Pencil className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase">Notlar</span>
                  </button>
                  <button 
                    onClick={() => setView('menu')}
                    className="flex-1 flex flex-col items-center gap-1 p-3 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <RotateCcw className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase">Menü</span>
                  </button>
                </div>
              </div>

              {/* Sidebar / Stats (Desktop) */}
              <div className="hidden lg:block w-72 space-y-6">
                <div className="p-6 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <h3 className="font-bold mb-4 flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                    <Settings className="w-4 h-4" />
                    Oyun Bilgisi
                  </h3>
                  <div className="space-y-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">Zorluk</span>
                      <span className="font-bold capitalize text-zinc-900 dark:text-zinc-100">{difficulty}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">Mod</span>
                      <span className="font-bold text-zinc-900 dark:text-zinc-100">{isDaily ? "Günlük Turnuva" : "Klasik"}</span>
                    </div>
                  </div>
                </div>

                {isDaily && (
                  <div className="p-6 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <h3 className="font-bold mb-4 flex items-center justify-between text-zinc-900 dark:text-zinc-100">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-amber-500" />
                        Günün Sıralaması
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                        <span className="text-[8px] font-black uppercase tracking-tighter text-red-500">CANLI</span>
                      </div>
                    </h3>
                    <DailyLeaderboardSidebar />
                  </div>
                )}
              </div>
              </div>
            </motion.div>
          )}

          {view === 'leaderboard' && (
            <LeaderboardView onBack={() => setView('menu')} difficulty={difficulty} setDifficulty={setDifficulty} />
          )}
        </AnimatePresence>

        {/* Win Modal */}
        <AnimatePresence>
          {isGameOver && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-white dark:bg-zinc-900 p-8 rounded-xl max-w-md w-full border-2 border-zinc-900 dark:border-zinc-100 shadow-2xl text-center"
              >
                <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Trophy className="w-10 h-10 text-amber-500" />
                </div>
                <h2 className="text-4xl font-black mb-2 text-indigo-600 dark:text-indigo-400 tracking-tighter">TEBRİKLER!</h2>
                <p className="text-zinc-600 dark:text-zinc-400 mb-8 font-medium">Harika iş çıkardın, {username || "Usta"}.</p>
                
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="p-6 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-100 dark:border-indigo-900/30 rounded-2xl">
                    <div className="text-[10px] font-black uppercase text-indigo-500 tracking-widest mb-1">Süre</div>
                    <div className="text-3xl font-black text-zinc-900 dark:text-zinc-100">{formatTime(time)}</div>
                  </div>
                  <div className="p-6 bg-red-50 dark:bg-red-900/20 border-2 border-red-100 dark:border-red-900/30 rounded-2xl">
                    <div className="text-[10px] font-black uppercase text-red-500 tracking-widest mb-1">Hata</div>
                    <div className="text-3xl font-black text-zinc-900 dark:text-zinc-100">{mistakes}</div>
                  </div>
                </div>

                <div className="space-y-3">
                  <button 
                    onClick={() => setView('menu')}
                    className="w-full py-4 bg-zinc-900 text-white rounded-lg font-bold hover:bg-zinc-800 transition-colors"
                  >
                    Menüye Dön
                  </button>
                  <button 
                    onClick={() => setView('leaderboard')}
                    className="w-full py-4 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-2 border-zinc-200 dark:border-zinc-700 rounded-lg font-bold hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Sıralamayı Gör
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}

const DailyLeaderboardSidebar = () => {
  const [scores, setScores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchScores = () => {
      API.getLeaderboard('daily').then(data => {
        setScores(data);
        setLoading(false);
      });
    };
    
    fetchScores();
    const interval = setInterval(fetchScores, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="text-xs text-zinc-500">Yükleniyor...</div>;
  if (scores.length === 0) return <div className="text-xs text-zinc-500 italic">Henüz skor yok.</div>;

  return (
    <div className="space-y-3">
      {scores.slice(0, 5).map((score, i) => (
        <div key={i} className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className={cn(
              "w-4 h-4 rounded-full flex items-center justify-center font-bold text-[8px] flex-shrink-0",
              i === 0 ? "bg-amber-100 text-amber-600" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
            )}>
              {i + 1}
            </span>
            <span className="font-bold truncate text-zinc-900 dark:text-zinc-100">{score.username}</span>
          </div>
          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
            {Math.floor(score.time_seconds / 60)}:{(score.time_seconds % 60).toString().padStart(2, '0')}
          </span>
        </div>
      ))}
    </div>
  );
};

const LeaderboardView = ({ onBack, difficulty, setDifficulty }: { onBack: () => void, difficulty: Difficulty, setDifficulty: (d: Difficulty) => void }) => {
  const [scores, setScores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchScores = () => {
      setLoading(true);
      API.getLeaderboard(difficulty).then(data => {
        setScores(data);
        setLoading(false);
      });
    };
    
    fetchScores();
    
    let interval: any;
    if (difficulty === 'daily') {
      interval = setInterval(fetchScores, 30000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [difficulty]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-2xl mx-auto"
    >
      <div className="flex items-center justify-between mb-8">
        <button onClick={onBack} className="flex items-center gap-2 text-zinc-700 hover:text-zinc-900 transition-colors">
          <ChevronLeft className="w-5 h-5" />
          Geri
        </button>
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          {difficulty === 'daily' && <Trophy className="w-6 h-6 text-amber-500" />}
          {difficulty === 'daily' ? 'Günün Turnuvası' : 'Sıralama'}
        </h2>
      </div>

      <div className="flex gap-1 mb-8 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl overflow-x-auto no-scrollbar">
        {['easy', 'medium', 'hard', 'daily'].map((d) => (
          <button
            key={d}
            onClick={() => setDifficulty(d as any)}
            className={cn(
              "flex-shrink-0 py-2 px-3 rounded-lg text-[10px] font-bold capitalize transition-all",
              difficulty === d 
                ? "bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100" 
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
             {d === 'easy' ? 'Kolay' : 
             d === 'medium' ? 'Orta' : 
             d === 'hard' ? 'Zor' : (
               <div className="flex items-center gap-1">
                 Günlük
                 <span className="relative flex h-1.5 w-1.5">
                   <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                   <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                 </span>
               </div>
             )}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-zinc-500">Yükleniyor...</div>
        ) : scores.length > 0 ? (
          <div className="divide-y-2 divide-zinc-100 dark:divide-zinc-800">
            {scores.map((score, i) => (
              <div key={i} className="flex items-center justify-between p-6 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                    i === 0 ? "bg-amber-100 text-amber-600" : 
                    i === 1 ? "bg-zinc-100 text-zinc-600" : 
                    i === 2 ? "bg-orange-100 text-orange-600" : "text-zinc-400"
                  )}>
                    {i + 1}
                  </div>
                  <div>
                    <div className="font-bold text-zinc-900 dark:text-zinc-100">{score.username}</div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">{new Date(score.completed_at).toLocaleDateString('tr-TR')}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                    {Math.floor(score.time_seconds / 60)}:{(score.time_seconds % 60).toString().padStart(2, '0')}
                  </div>
                  <div className="text-[10px] font-bold uppercase text-zinc-400">{score.mistakes} Hata</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center text-zinc-500">Henüz skor yok. İlk sen ol!</div>
        )}
      </div>
    </motion.div>
  );
};
