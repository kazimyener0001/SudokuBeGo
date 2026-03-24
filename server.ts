import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_FILE = './sudoku_db.json';

interface User {
  id: string;
  username: string;
  created_at: string;
}

interface Score {
  id: string;
  user_id: string;
  difficulty: string;
  time_seconds: number;
  mistakes: number;
  is_daily: boolean;
  completed_at: string;
}

interface Database {
  users: User[];
  scores: Score[];
}

async function getDb(): Promise<Database> {
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    const initialDb: Database = { users: [], scores: [] };
    await fs.writeFile(DB_FILE, JSON.stringify(initialDb, null, 2));
    return initialDb;
  }
}

async function saveDb(db: Database) {
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cors());
  app.use(helmet({
    contentSecurityPolicy: false,
  }));

  // Seeded Random Helper
  const seededRandom = (seed: string) => {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
      h = h << 13 | h >>> 19;
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  };

  // Sudoku Logic
  const generateFullGrid = (rng = Math.random): number[][] => {
    const grid = Array(9).fill(null).map(() => Array(9).fill(0));
    const fill = (row: number, col: number): boolean => {
      if (col === 9) {
        row++;
        col = 0;
      }
      if (row === 9) return true;

      const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => rng() - 0.5);
      for (const num of nums) {
        if (isValid(grid, row, col, num)) {
          grid[row][col] = num;
          if (fill(row, col + 1)) return true;
          grid[row][col] = 0;
        }
      }
      return false;
    };
    fill(0, 0);
    return grid;
  };

  const isValid = (grid: number[][], row: number, col: number, num: number): boolean => {
    for (let i = 0; i < 9; i++) {
      if (grid[row][i] === num || grid[i][col] === num) return false;
    }
    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (grid[startRow + i][startCol + j] === num) return false;
      }
    }
    return true;
  };

  const countSolutions = (grid: number[][], limit = 2): number => {
    let count = 0;
    const solve = (row: number, col: number) => {
      if (col === 9) {
        row++;
        col = 0;
      }
      if (row === 9) {
        count++;
        return;
      }
      if (grid[row][col] !== 0) {
        solve(row, col + 1);
        return;
      }
      for (let num = 1; num <= 9; num++) {
        if (isValid(grid, row, col, num)) {
          grid[row][col] = num;
          solve(row, col + 1);
          grid[row][col] = 0;
          if (count >= limit) return;
        }
      }
    };
    solve(0, 0);
    return count;
  };

  const generatePuzzle = (difficulty: 'easy' | 'medium' | 'hard', rng = Math.random) => {
    const fullGrid = generateFullGrid(rng);
    const puzzle = fullGrid.map(row => [...row]);
    
    const difficultyMap = {
      'easy': 30,
      'medium': 40,
      'hard': 50
    };
    
    let cellsToRemove = difficultyMap[difficulty] || 40;

    // Create a list of all 81 positions and shuffle them
    const positions = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        positions.push({ r, c });
      }
    }
    positions.sort(() => rng() - 0.5);

    for (const pos of positions) {
      if (cellsToRemove <= 0) break;

      const { r, c } = pos;
      const backup = puzzle[r][c];
      puzzle[r][c] = 0;

      const tempGrid = puzzle.map(row => [...row]);
      if (countSolutions(tempGrid) !== 1) {
        // Not unique, put it back
        puzzle[r][c] = backup;
      } else {
        // Successfully removed
        cellsToRemove--;
      }
    }

    return { puzzle, solution: fullGrid };
  };

  const getDailyChallenge = (dateStr: string) => {
    const rng = seededRandom(dateStr);
    return generatePuzzle('hard', rng);
  };

  // API Routes
  app.get('/api/puzzle', (req, res) => {
    const difficulty = (req.query.difficulty as any) || 'medium';
    res.json(generatePuzzle(difficulty));
  });

  app.get('/api/daily', (req, res) => {
    res.json(getDailyChallenge(new Date().toISOString().split('T')[0]));
  });

  app.post('/api/scores', async (req, res) => {
    const schema = z.object({
      username: z.string().min(3).max(20),
      time: z.number().int().positive(),
      mistakes: z.number().int().nonnegative(),
      difficulty: z.enum(['easy', 'medium', 'hard']),
      isDaily: z.boolean().optional(),
    });

    const result = schema.safeParse(req.body);
    if (!result.success) return res.status(400).json(result.error);

    const { username, time, mistakes, difficulty, isDaily } = result.data;

    const minTimeMap: Record<string, number> = {
      'easy': 30,
      'medium': 60,
      'hard': 120
    };
    const minTime = minTimeMap[difficulty] || 60;
    if (time < minTime) {
      return res.status(400).json({ error: 'Suspicious completion time' });
    }

    try {
      const db = await getDb();
      let user = db.users.find(u => u.username === username);
      if (!user) {
        user = { id: nanoid(), username, created_at: new Date().toISOString() };
        db.users.push(user);
      }

      const score: Score = {
        id: nanoid(),
        user_id: user.id,
        difficulty,
        time_seconds: time,
        mistakes,
        is_daily: !!isDaily,
        completed_at: new Date().toISOString()
      };
      db.scores.push(score);
      await saveDb(db);

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.get('/api/leaderboard', async (req, res) => {
    const difficulty = req.query.difficulty || 'medium';
    const db = await getDb();
    
    const isDaily = difficulty === 'daily';
    
    const scores = db.scores
      .filter(s => isDaily ? s.is_daily : (s.difficulty === difficulty && !s.is_daily))
      .map(s => {
        const user = db.users.find(u => u.id === s.user_id);
        return {
          username: user?.username || 'Unknown',
          time_seconds: s.time_seconds,
          mistakes: s.mistakes,
          completed_at: s.completed_at
        };
      })
      .sort((a, b) => a.time_seconds - b.time_seconds || a.mistakes - b.mistakes)
      .slice(0, 10);

    res.json(scores);
  });

  // Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
