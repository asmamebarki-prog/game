/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

// EXACT CONSTANTS
const TOKEN_COLORS = ['#ff5d66', '#1878ee', '#18a75b', '#8a4de1', '#ef8b20'];
const LADDERS: Record<number, number> = { 2: 9, 7: 14, 12: 19 };
const SNAKES: Record<number, number> = { 11: 10, 13: 8, 15: 6 };

// Exact Serpentine 5x4 Grid:
// Row 0 (top):    20, 19, 18, 17, 16
// Row 1:          11, 12, 13, 14, 15
// Row 2:          10,  9,  8,  7,  6
// Row 3 (bottom):  1,  2,  3,  4,  5
const SQUARE_ORDER = [
  20, 19, 18, 17, 16,
  11, 12, 13, 14, 15,
  10,  9,  8,  7,  6,
   1,  2,  3,  4,  5,
];

const DICE_ROTATIONS: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: -90 },
  3: { x: 0, y: -180 },
  4: { x: 0, y: 90 },
  5: { x: -90, y: 0 },
  6: { x: 90, y: 0 },
};

// Fallback / authoritative URLs
const ASSETS = {
  board: '/board.png',
  title: '/title.png',
  avatar: '/avatar.png',
};

interface Player {
  id: number;
  name: string;
  isCpu: boolean;
  color: string;
  position: number;
  trophies: number;
  earnedSquares: Set<number>;
}

export default function App() {
  // GAME MODES & SETTINGS
  const [screen, setScreen] = useState<'settings' | 'game'>('settings');
  const [mode, setMode] = useState<'cpu' | 'local'>('cpu');
  const [playerCount, setPlayerCount] = useState<number>(2);
  const [customNames, setCustomNames] = useState<string[]>(['', '', '', '', '']);
  const [namesUnsaved, setNamesUnsaved] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // QUESTION BANK
  const [questions, setQuestions] = useState<Record<number, { q: string; a: string }>>(() => {
    const init: Record<number, { q: string; a: string }> = {};
    for (let i = 1; i <= 20; i++) init[i] = { q: '', a: '' };
    try {
      const saved = localStorage.getItem('snakeTrailQuestions');
      if (saved) {
        const parsed = JSON.parse(saved);
        for (let i = 1; i <= 20; i++) {
          if (parsed[i]) {
            init[i] = {
              q: String(parsed[i].q || '').trim(),
              a: String(parsed[i].a || '').trim(),
            };
          }
        }
      }
    } catch {}
    return init;
  });

  const [bulkQText, setBulkQText] = useState('');
  const [bulkAText, setBulkAText] = useState('');
  const [selectedSquareToEdit, setSelectedSquareToEdit] = useState<number>(1);
  const [singleQText, setSingleQText] = useState('');
  const [singleAText, setSingleAText] = useState('');
  const [editorFeedback, setEditorFeedback] = useState<{ msg: string; isError: boolean } | null>(null);

  // ACTIVE GAME STATE
  const [players, setPlayers] = useState<Player[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [rolledValue, setRolledValue] = useState<number>(0);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Click the dice to roll.');
  const [canExecuteMove, setCanExecuteMove] = useState<boolean>(false);

  // DICE 3D ROTATION STATE
  const [diceRotation, setDiceRotation] = useState<{ x: number; y: number }>({ x: -12, y: 16 });

  // MODAL & OVERLAYS
  const [modalSquare, setModalSquare] = useState<number | null>(null);
  const [modalAnswerInput, setModalAnswerInput] = useState<string>('');
  const [modalFeedback, setModalFeedback] = useState<{ msg: string; type: 'wrong' | 'correct' | 'info' } | null>(null);

  const [snakeToastMsg, setSnakeToastMsg] = useState<string | null>(null);
  const [winner, setWinner] = useState<{ name: string; color: string; reason: string } | null>(null);

  // Audio Context Ref
  const audioCtxRef = useRef<AudioContext | null>(null);
  const boardCanvasRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);

  // WEB AUDIO SYNTHESIZER
  const playSound = useCallback((type: 'save' | 'roll' | 'step' | 'blocked' | 'ladder' | 'snake' | 'wrong' | 'correct' | 'trophy' | 'victory') => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        const AudioClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioClass) {
          audioCtxRef.current = new AudioClass();
        }
      }
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;

      if (type === 'save') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now);
        osc.frequency.setValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'roll') {
        for (let i = 0; i < 7; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const t = now + i * 0.11;
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(180 + Math.random() * 260, t);
          gain.gain.setValueAtTime(0.18, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.08);
        }
      } else if (type === 'step') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(580, now + 0.12);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === 'blocked') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.25);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'ladder') {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const t = now + idx * 0.12;
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.22, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.24);
        });
      } else if (type === 'snake') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(820, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.55);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.55);
      } else if (type === 'wrong') {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc1.frequency.setValueAtTime(185, now);
        osc2.frequency.setValueAtTime(220, now);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.35);
        osc2.stop(now + 0.35);
      } else if (type === 'correct') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (type === 'trophy') {
        const freqs = [587.33, 783.99, 987.77, 1174.66];
        freqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const t = now + idx * 0.14;
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.28, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.3);
        });
      } else if (type === 'victory') {
        const melody = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
        const times = [0, 0.16, 0.32, 0.48, 0.72, 0.95];
        melody.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const t = now + times[idx];
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.3, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.45);
        });
      }
    } catch {}
  }, [soundEnabled]);

  // LOAD SAVED NAMES ON MOUNT
  useEffect(() => {
    try {
      const saved = localStorage.getItem('snakeTrailNames');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setCustomNames(prev => {
            const next = [...prev];
            parsed.forEach((n, i) => {
              if (i < 5) next[i] = String(n || '').slice(0, 22);
            });
            return next;
          });
        }
      }
    } catch {}
  }, []);

  // Update single square editor fields on selection change
  useEffect(() => {
    const sq = questions[selectedSquareToEdit] || { q: '', a: '' };
    setSingleQText(sq.q);
    setSingleAText(sq.a);
  }, [selectedSquareToEdit, questions]);

  // SAVE NAMES
  const handleSaveNames = () => {
    const effectiveCount = mode === 'cpu' ? 2 : playerCount;
    const namesToSave = [];
    for (let i = 0; i < effectiveCount; i++) {
      if (mode === 'cpu' && i === 1) namesToSave.push('CPU');
      else namesToSave.push(customNames[i]?.trim().slice(0, 22) || '');
    }
    try {
      localStorage.setItem('snakeTrailNames', JSON.stringify(namesToSave));
    } catch {}
    setNamesUnsaved(false);
    playSound('save');
  };

  // BULK IMPORT QUESTIONS
  const handleApplyBulkQuestions = () => {
    const qLines = bulkQText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const aLines = bulkAText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    if (qLines.length === 0 || aLines.length === 0) {
      setEditorFeedback({ msg: 'Please enter non-empty questions and answers.', isError: true });
      return;
    }
    if (qLines.length !== aLines.length) {
      setEditorFeedback({
        msg: `Mismatch: ${qLines.length} questions vs ${aLines.length} answers. Line counts must be equal.`,
        isError: true,
      });
      return;
    }
    if (qLines.length > 20) {
      setEditorFeedback({ msg: 'Cannot import more than 20 lines (1 per square).', isError: true });
      return;
    }

    setQuestions(prev => {
      const next = { ...prev };
      for (let i = 0; i < qLines.length; i++) {
        next[i + 1] = { q: qLines[i], a: aLines[i] };
      }
      try {
        localStorage.setItem('snakeTrailQuestions', JSON.stringify(next));
      } catch {}
      return next;
    });

    setEditorFeedback({ msg: `✓ Successfully imported ${qLines.length} questions!`, isError: false });
    playSound('save');
  };

  const handleClearAllQuestions = () => {
    if (!window.confirm('Clear all 20 questions?')) return;
    const next: Record<number, { q: string; a: string }> = {};
    for (let i = 1; i <= 20; i++) next[i] = { q: '', a: '' };
    setQuestions(next);
    setBulkQText('');
    setBulkAText('');
    try {
      localStorage.setItem('snakeTrailQuestions', JSON.stringify(next));
    } catch {}
    setEditorFeedback({ msg: 'All questions cleared.', isError: false });
    playSound('save');
  };

  const handleSaveSingleSquare = () => {
    setQuestions(prev => {
      const next = {
        ...prev,
        [selectedSquareToEdit]: { q: singleQText.trim(), a: singleAText.trim() },
      };
      try {
        localStorage.setItem('snakeTrailQuestions', JSON.stringify(next));
      } catch {}
      return next;
    });
    setEditorFeedback({ msg: `✓ Saved square ${selectedSquareToEdit} question!`, isError: false });
    playSound('save');
  };

  const handleClearSingleSquare = () => {
    setQuestions(prev => {
      const next = {
        ...prev,
        [selectedSquareToEdit]: { q: '', a: '' },
      };
      try {
        localStorage.setItem('snakeTrailQuestions', JSON.stringify(next));
      } catch {}
      return next;
    });
    setSingleQText('');
    setSingleAText('');
    setEditorFeedback({ msg: `Square ${selectedSquareToEdit} cleared.`, isError: false });
    playSound('save');
  };

  // START GAME
  const handleStartGame = () => {
    const effectiveCount = mode === 'cpu' ? 2 : playerCount;
    const newPlayers: Player[] = [];

    for (let i = 0; i < effectiveCount; i++) {
      let name = '';
      if (mode === 'cpu' && i === 1) {
        name = 'CPU';
      } else {
        name = customNames[i]?.trim() || `P${i + 1}`;
      }

      newPlayers.push({
        id: i,
        name,
        isCpu: mode === 'cpu' && i === 1,
        color: TOKEN_COLORS[i],
        position: 0,
        trophies: 0,
        earnedSquares: new Set<number>(),
      });
    }

    setPlayers(newPlayers);
    setActiveIndex(0);
    setRolledValue(0);
    setIsBusy(false);
    setIsRolling(false);
    setWinner(null);
    setCanExecuteMove(false);
    setStatusMessage('Click the dice to roll.');
    setDiceRotation({ x: -12, y: 16 });
    setScreen('game');
    playSound('save');
  };

  const handleRestartGame = () => {
    setPlayers(prev =>
      prev.map(p => ({
        ...p,
        position: 0,
        trophies: 0,
        earnedSquares: new Set<number>(),
      }))
    );
    setActiveIndex(0);
    setRolledValue(0);
    setIsBusy(false);
    setIsRolling(false);
    setWinner(null);
    setCanExecuteMove(false);
    setStatusMessage('Game restarted. Click the dice to roll.');
    setDiceRotation({ x: -12, y: 16 });
    playSound('save');
  };

  // TURN PASSING
  const passToNextPlayer = useCallback((playerList: Player[], currentIdx: number) => {
    const nextIdx = (currentIdx + 1) % playerList.length;
    setActiveIndex(nextIdx);
    setRolledValue(0);
    setCanExecuteMove(false);

    const nextPlayer = playerList[nextIdx];
    if (nextPlayer.isCpu) {
      setIsBusy(true);
      setStatusMessage(`${nextPlayer.name} is thinking...`);
      setTimeout(() => {
        triggerCpuRoll(nextPlayer, nextIdx);
      }, 1000);
    } else {
      setIsBusy(false);
      setStatusMessage(`It's ${nextPlayer.name}'s turn. Click the dice to roll.`);
    }
  }, []);

  // VICTORY TRIGGER
  const triggerVictory = useCallback((victor: Player, reason: string) => {
    setWinner({
      name: victor.name,
      color: victor.color,
      reason,
    });
    setIsBusy(true);
    setCanExecuteMove(false);
    playSound('victory');
  }, [playSound]);

  // CHECK SQUARE EVENTS (LADDERS, SNAKES, 20)
  const checkSquareEvents = useCallback((activeP: Player, pIdx: number) => {
    const currentPos = activeP.position;

    if (currentPos === 20) {
      triggerVictory(activeP, 'reached square 20!');
      return;
    }

    if (LADDERS[currentPos]) {
      const destination = LADDERS[currentPos];
      setStatusMessage(`Ladder! ${activeP.name} climbs to square ${destination}. 🪜`);
      playSound('ladder');

      setTimeout(() => {
        setPlayers(prev => {
          const next = [...prev];
          next[pIdx] = { ...next[pIdx], position: destination };
          return next;
        });

        setTimeout(() => {
          if (destination === 20) {
            triggerVictory(activeP, 'reached square 20!');
          } else {
            passToNextPlayer(players, pIdx);
          }
        }, 800);
      }, 600);
      return;
    }

    if (SNAKES[currentPos]) {
      const destination = SNAKES[currentPos];
      setStatusMessage(`Oh no! A snake bites ${activeP.name} and slides the token down to square ${destination}. 🐍`);
      playSound('snake');

      setSnakeToastMsg(`${activeP.name} got bitten by a snake!`);
      setTimeout(() => {
        setSnakeToastMsg(null);
      }, 1500);

      setTimeout(() => {
        setPlayers(prev => {
          const next = [...prev];
          next[pIdx] = { ...next[pIdx], position: destination };
          return next;
        });

        setTimeout(() => {
          passToNextPlayer(players, pIdx);
        }, 800);
      }, 800);
      return;
    }

    passToNextPlayer(players, pIdx);
  }, [passToNextPlayer, playSound, players, triggerVictory]);

  // MOVEMENT STEP BY STEP
  const stepMove = useCallback((pIdx: number, stepsRemaining: number) => {
    if (stepsRemaining <= 0) {
      setPlayers(current => {
        const activeP = current[pIdx];
        checkSquareEvents(activeP, pIdx);
        return current;
      });
      return;
    }

    setPlayers(current => {
      const next = [...current];
      next[pIdx] = { ...next[pIdx], position: next[pIdx].position + 1 };
      return next;
    });
    playSound('step');

    setTimeout(() => {
      stepMove(pIdx, stepsRemaining - 1);
    }, 320);
  }, [checkSquareEvents, playSound]);

  // ROLL LOGIC
  const rollDiceInternal = useCallback((activeP: Player, pIdx: number) => {
    setIsBusy(true);
    setIsRolling(true);
    setCanExecuteMove(false);
    setStatusMessage('Rolling the dice...');
    playSound('roll');

    const rollVal = Math.floor(Math.random() * 6) + 1;
    setRolledValue(rollVal);

    const baseRot = DICE_ROTATIONS[rollVal];
    const spinX = baseRot.x + 720 - 12;
    const spinY = baseRot.y + 720 + 16;
    setDiceRotation({ x: spinX, y: spinY });

    setTimeout(() => {
      setDiceRotation({ x: baseRot.x - 12, y: baseRot.y + 16 });
      setIsRolling(false);

      const plural = rollVal === 1 ? 'space' : 'spaces';

      if (activeP.position + rollVal > 20) {
        setStatusMessage(`${activeP.name} rolled ${rollVal}. Needs an exact roll. The token stays put.`);
        playSound('blocked');
        setTimeout(() => {
          passToNextPlayer(players, pIdx);
        }, 1800);
        return;
      }

      if (activeP.isCpu) {
        setStatusMessage(`${activeP.name} rolled ${rollVal}! Moving ${rollVal} ${plural}...`);
        setTimeout(() => {
          stepMove(pIdx, rollVal);
        }, 700);
      } else {
        setStatusMessage(`${activeP.name} rolled ${rollVal}! Click move to advance.`);
        setCanExecuteMove(true);
        setIsBusy(false);
      }
    }, 1000);
  }, [passToNextPlayer, playSound, players, stepMove]);

  const triggerCpuRoll = (cpuP: Player, pIdx: number) => {
    rollDiceInternal(cpuP, pIdx);
  };

  const handleHumanDiceClick = () => {
    if (isBusy || isRolling || winner) return;
    const activeP = players[activeIndex];
    if (!activeP || activeP.isCpu) return;
    rollDiceInternal(activeP, activeIndex);
  };

  const handleExecuteMove = () => {
    if (isBusy || !canExecuteMove || winner) return;
    setCanExecuteMove(false);
    setIsBusy(true);
    stepMove(activeIndex, rolledValue);
  };

  // QUESTION DIALOG CLICK
  const handleOpenQuestion = (sqNum: number) => {
    if (isBusy || winner) return;
    const activeP = players[activeIndex];
    if (!activeP || activeP.isCpu) return;

    const sqData = questions[sqNum];
    if (!sqData || !sqData.q.trim()) {
      alert(`No question is saved for square ${sqNum} yet. Add it in settings.`);
      return;
    }

    setModalSquare(sqNum);
    setModalAnswerInput('');
    setModalFeedback(null);
    setTimeout(() => {
      modalInputRef.current?.focus();
    }, 50);
  };

  const handleAnswerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (modalSquare === null) return;

    const sqData = questions[modalSquare];
    const activeP = players[activeIndex];
    const userAns = modalAnswerInput.trim().replace(/\s+/g, ' ').toLowerCase();
    const expectedAns = (sqData.a || '').trim().replace(/\s+/g, ' ').toLowerCase();

    if (userAns !== expectedAns) {
      setModalFeedback({
        msg: 'Not quite—try again. Check spelling and spacing.',
        type: 'wrong',
      });
      playSound('wrong');
      return;
    }

    if (activeP.earnedSquares.has(modalSquare)) {
      setModalFeedback({
        msg: 'Correct! You already earned the trophy for this square.',
        type: 'info',
      });
      playSound('correct');
      setTimeout(() => {
        setModalSquare(null);
      }, 1500);
      return;
    }

    // Award trophy
    const updatedEarned = new Set(activeP.earnedSquares);
    updatedEarned.add(modalSquare);
    const newTrophies = activeP.trophies + 1;

    setPlayers(prev => {
      const next = [...prev];
      next[activeIndex] = {
        ...next[activeIndex],
        trophies: newTrophies,
        earnedSquares: updatedEarned,
      };
      return next;
    });

    setModalFeedback({
      msg: 'Correct! Trophy earned! ✨🏆',
      type: 'correct',
    });
    playSound('trophy');

    if (newTrophies >= 5) {
      setTimeout(() => {
        setModalSquare(null);
        setPlayers(prev => {
          const next = [...prev];
          next[activeIndex] = { ...next[activeIndex], position: 20 };
          return next;
        });
        triggerVictory(activeP, 'collected five trophies!');
      }, 1200);
    } else {
      setTimeout(() => {
        setModalSquare(null);
      }, 1500);
    }
  };

  // COMPUTED TOKEN POSITIONS (Centering + Clustered Math)
  const [tokenCoords, setTokenCoords] = useState<Record<number, { top: number; left: number }>>({});

  const updateTokenPositions = useCallback(() => {
    if (!boardCanvasRef.current || !dockRef.current) return;
    const boardRect = boardCanvasRef.current.getBoundingClientRect();
    const dockRect = dockRef.current.getBoundingClientRect();

    const groups: Record<number, Player[]> = {};
    players.forEach(p => {
      if (!groups[p.position]) groups[p.position] = [];
      groups[p.position].push(p);
    });

    const newCoords: Record<number, { top: number; left: number }> = {};

    Object.entries(groups).forEach(([posStr, group]) => {
      const pos = parseInt(posStr, 10);
      const count = group.length;

      if (pos === 0) {
        // In dock
        const slotWidth = dockRect.width / (players.length + 1);
        group.forEach(p => {
          newCoords[p.id] = {
            left: dockRect.left - boardRect.left + slotWidth * (p.id + 1),
            top: dockRect.top - boardRect.top + dockRect.height / 2,
          };
        });
        return;
      }

      const cellEl = boardCanvasRef.current?.querySelector(`[data-square="${pos}"]`);
      if (!cellEl) return;
      const cellRect = cellEl.getBoundingClientRect();
      const centerX = cellRect.left + cellRect.width / 2 - boardRect.left;
      const centerY = cellRect.top + cellRect.height / 2 - boardRect.top;

      const tokenSize = Math.max(24, Math.min(cellRect.width * 0.42, 42));
      const dist = tokenSize * 0.35;

      group.forEach((p, idx) => {
        let offsetX = 0;
        let offsetY = 0;

        if (count === 1) {
          offsetX = 0;
          offsetY = 0;
        } else if (count === 2) {
          offsetX = idx === 0 ? -dist : dist;
          offsetY = 0;
        } else if (count === 3) {
          if (idx === 0) { offsetX = -dist; offsetY = -dist * 0.7; }
          else if (idx === 1) { offsetX = dist; offsetY = -dist * 0.7; }
          else { offsetX = 0; offsetY = dist * 0.7; }
        } else if (count === 4) {
          offsetX = idx % 2 === 0 ? -dist : dist;
          offsetY = idx < 2 ? -dist : dist;
        } else if (count === 5) {
          if (idx === 0) { offsetX = -dist; offsetY = -dist; }
          else if (idx === 1) { offsetX = dist; offsetY = -dist; }
          else if (idx === 2) { offsetX = -dist; offsetY = dist; }
          else if (idx === 3) { offsetX = dist; offsetY = dist; }
          else { offsetX = 0; offsetY = 0; }
        }

        newCoords[p.id] = {
          left: centerX + offsetX,
          top: centerY + offsetY,
        };
      });
    });

    setTokenCoords(newCoords);
  }, [players]);

  useEffect(() => {
    updateTokenPositions();
    window.addEventListener('resize', updateTokenPositions);
    return () => window.removeEventListener('resize', updateTokenPositions);
  }, [updateTokenPositions]);

  // Keyboard Escape for modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalSquare !== null) {
        setModalSquare(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalSquare]);

  const activePlayer = players[activeIndex] || null;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_50%_15%,#0d3875_0%,#071f47_45%,#030e22_100%)] text-white font-['Trebuchet_MS','Arial_Rounded_MT_Bold',sans-serif] flex flex-col overflow-x-hidden">
      {/* Header */}
      <header className="w-full max-w-[1320px] mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <img
          src={ASSETS.title}
          alt="SNAKES AND LADDER"
          className="w-[min(72vw,720px)] h-[120px] max-[480px]:w-[min(64vw,250px)] max-[480px]:h-[46px] object-cover object-[left_40%] rounded-xl drop-shadow-[0_6px_14px_rgba(2,20,50,0.85)] pointer-events-none select-none"
        />
        <div className="flex items-center gap-3">
          <a
            href="/snake-learning-game-latest-edition.html"
            download="snake-learning-game-latest-edition.html"
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-[#0d3b7d] hover:bg-[#144d9f] border border-cyan-400 rounded-full shadow transition-all text-white"
            title="Download single-file offline HTML"
          >
            💾 Standalone HTML
          </a>
          <button
            type="button"
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              if (next) playSound('correct');
            }}
            aria-pressed={soundEnabled}
            aria-label="Toggle sound effects"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 max-[480px]:px-3 max-[480px]:py-2 max-[480px]:text-xs text-sm font-bold bg-gradient-to-br from-[#0d3b7d] to-[#071d42] border-2 border-cyan-400 hover:border-yellow-400 rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.4)] transition-all cursor-pointer whitespace-nowrap"
          >
            {soundEnabled ? '🔊 Sound on' : '🔇 Sound off'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-[1320px] mx-auto px-4 pb-8 flex-1 flex flex-col">
        {screen === 'settings' ? (
          /* SETTINGS VIEW */
          <section className="max-w-[780px] w-full mx-auto my-3 bg-gradient-to-b from-[#0e2f63] to-[#081d3f] border-2 border-cyan-400 rounded-3xl p-6 md:p-8 shadow-[0_16px_40px_rgba(0,0,0,0.6),0_0_28px_rgba(56,189,248,0.25)]">
            <h1 className="text-2xl md:text-3xl font-extrabold mb-1 drop-shadow">Set up your game</h1>
            <p className="text-slate-300 text-sm md:text-base mb-6 leading-relaxed">
              Choose how to play, save the player names, and add your learning questions.
            </p>

            <div className="text-cyan-400 font-bold uppercase text-sm tracking-wider mb-3">Play Mode</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-5" role="radiogroup">
              <button
                type="button"
                onClick={() => setMode('cpu')}
                aria-pressed={mode === 'cpu'}
                className={`text-left p-4 rounded-2xl border-2 transition-all flex flex-col gap-1 cursor-pointer ${
                  mode === 'cpu'
                    ? 'border-[#ffd85b] bg-gradient-to-br from-[#103975] to-[#0c2b5c] shadow-[0_0_20px_rgba(255,216,91,0.35)] outline-2 outline-[#ffd85b]'
                    : 'border-blue-900 bg-gradient-to-br from-[#092044] to-[#05142d] hover:border-cyan-400'
                }`}
              >
                <span className="text-lg font-extrabold flex items-center gap-2">🤖 Versus computer</span>
                <span className="text-xs text-slate-400">One human player competing with an automatic CPU opponent.</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('local')}
                aria-pressed={mode === 'local'}
                className={`text-left p-4 rounded-2xl border-2 transition-all flex flex-col gap-1 cursor-pointer ${
                  mode === 'local'
                    ? 'border-[#ffd85b] bg-gradient-to-br from-[#103975] to-[#0c2b5c] shadow-[0_0_20px_rgba(255,216,91,0.35)] outline-2 outline-[#ffd85b]'
                    : 'border-blue-900 bg-gradient-to-br from-[#092044] to-[#05142d] hover:border-cyan-400'
                }`}
              >
                <span className="text-lg font-extrabold flex items-center gap-2">👥 Various players</span>
                <span className="text-xs text-slate-400">2 to 5 local players sharing one screen together.</span>
              </button>
            </div>

            {mode === 'local' && (
              <div className="flex items-center gap-3 p-3 bg-black/20 rounded-xl border border-blue-900 mb-5">
                <span className="text-sm font-bold text-slate-200">Number of players:</span>
                <div className="flex gap-2">
                  {[2, 3, 4, 5].map(cnt => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setPlayerCount(cnt)}
                      aria-pressed={playerCount === cnt}
                      className={`w-11 h-11 rounded-xl font-extrabold border-2 cursor-pointer transition-all ${
                        playerCount === cnt
                          ? 'bg-[#0876ed] border-[#ffd85b] shadow-[0_0_12px_rgba(255,216,91,0.4)] text-white'
                          : 'bg-[#092044] border-blue-900 text-white hover:border-cyan-400'
                      }`}
                    >
                      {cnt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Player Names */}
            <div className="text-cyan-400 font-bold uppercase text-sm tracking-wider mb-3">Player Names</div>
            <div className="bg-black/25 border border-blue-900 rounded-2xl p-4 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                {Array.from({ length: mode === 'cpu' ? 2 : playerCount }).map((_, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 bg-[#061937] border border-blue-700 rounded-xl px-3 py-2">
                    <div
                      className="w-4.5 h-4.5 rounded-full border-2 border-white shadow flex-shrink-0"
                      style={{ backgroundColor: TOKEN_COLORS[idx] }}
                    />
                    {mode === 'cpu' && idx === 1 ? (
                      <input
                        type="text"
                        value="CPU"
                        readOnly
                        className="bg-transparent text-white font-semibold outline-none w-full opacity-70"
                      />
                    ) : (
                      <input
                        type="text"
                        maxLength={22}
                        placeholder={`P${idx + 1}`}
                        value={customNames[idx] || ''}
                        onChange={e => {
                          const val = e.target.value;
                          setCustomNames(prev => {
                            const next = [...prev];
                            next[idx] = val;
                            return next;
                          });
                          setNamesUnsaved(true);
                        }}
                        className="bg-transparent text-white font-semibold outline-none w-full placeholder:text-slate-500"
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleSaveNames}
                  className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 border-2 border-green-400 font-bold px-4 py-2 rounded-xl shadow cursor-pointer transition-all"
                >
                  Save player names
                </button>
                <span className={`text-sm font-bold ${namesUnsaved ? 'text-amber-400' : 'text-green-400'}`}>
                  {namesUnsaved ? 'Unsaved changes' : `✓ ${mode === 'cpu' ? 2 : playerCount} names saved`}
                </span>
              </div>
            </div>

            {/* Questions Details */}
            <details className="bg-black/25 border border-blue-900 rounded-2xl p-4 mb-7 group">
              <summary className="font-extrabold text-[#ffd85b] cursor-pointer outline-none flex items-center justify-between text-base select-none">
                <span>Add or edit my questions</span>
                <span className="transition-transform group-open:rotate-180">▾</span>
              </summary>
              <div className="mt-4 pt-4 border-t border-blue-900">
                <p className="text-xs text-slate-300 mb-3 leading-relaxed">
                  Bulk import: Enter questions and matching answers (one per line). Equal line count required (up to 20).
                  Square 1 gets line 1, square 2 gets line 2, etc.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Questions, one per line:</label>
                    <textarea
                      value={bulkQText}
                      onChange={e => setBulkQText(e.target.value)}
                      placeholder={'What is 5 + 5?\nWhat is the capital of France?\nWhat planet is closest to the Sun?'}
                      className="w-full h-32 bg-[#061937] border border-blue-600 rounded-xl p-2.5 text-xs text-white outline-none resize-y"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Answers, one per line:</label>
                    <textarea
                      value={bulkAText}
                      onChange={e => setBulkAText(e.target.value)}
                      placeholder={'10\nParis\nMercury'}
                      className="w-full h-32 bg-[#061937] border border-blue-600 rounded-xl p-2.5 text-xs text-white outline-none resize-y"
                    />
                  </div>
                </div>

                <div className="flex gap-2.5 flex-wrap mb-4">
                  <button
                    type="button"
                    onClick={handleApplyBulkQuestions}
                    className="px-3.5 py-2 text-xs font-bold rounded-lg bg-sky-700 hover:bg-sky-600 border border-sky-400 text-white cursor-pointer"
                  >
                    Import bulk questions
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAllQuestions}
                    className="px-3.5 py-2 text-xs font-bold rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-500 text-white cursor-pointer"
                  >
                    Clear all questions
                  </button>
                </div>

                {/* Single square editor */}
                <div className="bg-[#071f45] border border-blue-900 rounded-xl p-3">
                  <div className="text-xs font-bold text-blue-300 mb-2">Single-square editor (Squares 1 to 20):</div>
                  <div className="flex gap-2 flex-wrap items-center">
                    <select
                      value={selectedSquareToEdit}
                      onChange={e => setSelectedSquareToEdit(parseInt(e.target.value, 10))}
                      className="bg-[#092653] border border-cyan-400 text-white font-bold px-3 py-1.5 rounded-lg text-sm outline-none"
                    >
                      {Array.from({ length: 20 }, (_, i) => i + 1).map(sq => (
                        <option key={sq} value={sq}>Square {sq}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Question text"
                      value={singleQText}
                      onChange={e => setSingleQText(e.target.value)}
                      className="flex-1 min-w-[150px] bg-[#092653] border border-blue-800 rounded-lg px-3 py-1.5 text-sm text-white outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Exact answer"
                      value={singleAText}
                      onChange={e => setSingleAText(e.target.value)}
                      className="flex-1 min-w-[120px] bg-[#092653] border border-blue-800 rounded-lg px-3 py-1.5 text-sm text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSaveSingleSquare}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-green-700 hover:bg-green-600 border border-green-400 text-white cursor-pointer"
                    >
                      Save this square
                    </button>
                    <button
                      type="button"
                      onClick={handleClearSingleSquare}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-500 text-white cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {editorFeedback && (
                  <div className={`mt-2.5 text-xs font-bold ${editorFeedback.isError ? 'text-rose-400' : 'text-green-400'}`}>
                    {editorFeedback.msg}
                  </div>
                )}
              </div>
            </details>

            {/* Start Button */}
            <button
              type="button"
              onClick={handleStartGame}
              className="w-full bg-gradient-to-r from-green-500 via-green-600 to-green-700 hover:from-green-400 hover:to-green-600 border-2 border-green-300 font-extrabold text-xl py-4 rounded-2xl shadow-[0_8px_24px_rgba(22,163,74,0.4)] cursor-pointer transition-transform hover:-translate-y-0.5 active:translate-y-0 text-white"
            >
              Start the game ▶
            </button>
          </section>
        ) : (
          /* GAME VIEW */
          <section className="w-full">
            <div className="flex items-center justify-between gap-3 mb-3">
              <button
                type="button"
                onClick={() => setScreen('settings')}
                className="bg-gradient-to-br from-[#0e3770] to-[#082147] border-2 border-cyan-400 hover:border-[#ffd85b] font-bold text-sm px-4 py-2 rounded-xl shadow cursor-pointer transition-all"
              >
                ← Back to settings
              </button>
              <button
                type="button"
                onClick={handleRestartGame}
                className="bg-gradient-to-br from-[#0e3770] to-[#082147] border-2 border-cyan-400 hover:border-[#ffd85b] font-bold text-sm px-4 py-2 rounded-xl shadow cursor-pointer transition-all"
              >
                ↻ Restart game
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_310px] gap-5 items-start">
              {/* BOARD COLUMN */}
              <div className="flex flex-col gap-3.5 w-full">
                {/* Board Frame Container */}
                <div className="p-3 max-[480px]:p-2 rounded-3xl max-[480px]:rounded-2xl bg-gradient-to-br from-[#40e8ff] via-[#0876ed] to-[#582bc2] shadow-[0_0_38px_rgba(255,216,91,0.42),0_0_16px_rgba(64,232,255,0.6),inset_0_2px_4px_rgba(255,255,255,0.4),0_18px_40px_rgba(0,0,0,0.6)]">
                  <div
                    ref={boardCanvasRef}
                    className="relative w-full aspect-[5/4] rounded-2xl max-[480px]:rounded-xl overflow-hidden bg-[#06193b]"
                  >
                    {/* Baked Artwork */}
                    <img
                      src={ASSETS.board}
                      alt="Snakes and Ladders Game Board"
                      className="absolute left-[49.5%] top-[52.8%] w-[120%] h-[123%] -translate-x-1/2 -translate-y-1/2 object-fill pointer-events-none select-none z-1"
                    />

                    {/* 20 Serpentine Grid Hit Areas */}
                    <div className="absolute inset-0 grid grid-cols-5 grid-rows-4 z-2">
                      {SQUARE_ORDER.map(sqNum => {
                        let colIdx = 0;
                        if (sqNum >= 16) colIdx = 20 - sqNum;
                        else if (sqNum >= 11) colIdx = sqNum - 11;
                        else if (sqNum >= 6) colIdx = 10 - sqNum;
                        else colIdx = sqNum - 1;

                        const colColors = ['#18a75b', '#1878ee', '#8a4de1', '#ff5d66', '#ef8b20'];
                        const hasQ = Boolean(questions[sqNum]?.q?.trim());
                        const isSquare10 = sqNum === 10;

                        return (
                          <div
                            key={sqNum}
                            data-square={sqNum}
                            className="relative w-full h-full select-none"
                          >
                            <button
                              type="button"
                              onClick={() => handleOpenQuestion(sqNum)}
                              aria-label={`Open question for square ${sqNum}`}
                              className={`absolute top-[11%] w-[clamp(20px,3.2vw,30px)] h-[clamp(20px,3.2vw,30px)] rounded-full border-2 border-white text-white font-extrabold text-[clamp(11px,1.8vw,15px)] flex items-center justify-center shadow-[0_3px_8px_rgba(0,0,0,0.5)] cursor-pointer z-10 transition-transform hover:scale-115 ${
                                isSquare10 ? 'right-[24%]' : 'right-[7%]'
                              } ${hasQ ? 'bg-[#18a75b]! shadow-[0_0_12px_rgba(34,197,94,0.85)]!' : ''}`}
                              style={{
                                backgroundColor: hasQ ? '#18a75b' : colColors[colIdx],
                              }}
                            >
                              ?
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Rendered Player Tokens */}
                    <div className="absolute inset-0 pointer-events-none z-15">
                      {players.map((p, idx) => {
                        const coords = tokenCoords[p.id] || { top: -100, left: -100 };
                        return (
                          <div
                            key={p.id}
                            className="absolute w-[clamp(24px,4vw,42px)] h-[clamp(24px,4vw,42px)] rounded-full border-[2.5px] border-white text-white font-extrabold text-[clamp(12px,2vw,18px)] flex items-center justify-center shadow-[0_4px_10px_rgba(0,0,0,0.65),inset_0_2px_4px_rgba(255,255,255,0.6)] -translate-x-1/2 -translate-y-1/2 transition-[top,left] duration-300 ease-out z-20"
                            style={{
                              backgroundColor: p.color,
                              top: `${coords.top}px`,
                              left: `${coords.left}px`,
                            }}
                          >
                            {idx + 1}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Starting Dock */}
                <div
                  ref={dockRef}
                  className="bg-gradient-to-b from-[#071d42] to-[#030e23] border-2 border-blue-800 rounded-2xl p-3 min-h-[64px] flex items-center justify-between gap-4 shadow-[0_6px_18px_rgba(0,0,0,0.4)]"
                >
                  <div className="text-cyan-400 font-extrabold text-sm tracking-wider flex items-center gap-2">
                    <span>⚓</span> STARTING DOCK
                  </div>
                  <div className="flex-1 flex justify-end gap-3 min-h-[44px]">
                    {/* Tokens at pos 0 are placed mathematically */}
                  </div>
                </div>
              </div>

              {/* CONTROL COLUMN (SIDEBAR) */}
              <aside className="flex flex-col gap-4 w-full">
                <div className="bg-gradient-to-b from-[#fefefd] to-[#f4f0e6] text-[#0f172a] border-[3px] border-cyan-400 outline-[3px] outline-blue-700 rounded-3xl p-5 shadow-[0_16px_36px_rgba(0,0,0,0.55)]">
                  <div className="text-center mb-3">
                    <div className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">CURRENT TURN</div>
                    <div
                      className="text-2xl font-black mt-0.5"
                      style={{ color: activePlayer?.color || '#0f172a' }}
                    >
                      {activePlayer?.name || 'P1'}
                    </div>
                  </div>

                  <div className="bg-slate-200 border border-slate-300 rounded-xl p-2.5 text-sm font-bold text-slate-800 text-center min-h-[44px] flex items-center justify-center mb-4 leading-snug">
                    {statusMessage}
                  </div>

                  {/* Dice + Mascot row */}
                  <div className="flex items-center justify-center gap-4 mb-4">
                    {/* Mascot with 3 animated bouncing ? */}
                    <div className="relative w-[86px] flex flex-col items-center">
                      <div className="flex gap-1.5 mb-1 h-5">
                        <span className="text-amber-600 font-black text-base animate-bounce">?</span>
                        <span className="text-blue-600 font-black text-base animate-bounce [animation-delay:0.2s]">?</span>
                        <span className="text-rose-600 font-black text-base animate-bounce [animation-delay:0.4s]">?</span>
                      </div>
                      <div className="w-[82px] h-[82px] rounded-2xl border-[3px] border-cyan-400 bg-white overflow-hidden shadow">
                        <img src={ASSETS.avatar} alt="Game Mascot" className="w-full h-full object-cover" />
                      </div>
                    </div>

                    {/* 3D Dice */}
                    <button
                      type="button"
                      onClick={handleHumanDiceClick}
                      disabled={isBusy || activePlayer?.isCpu}
                      aria-label="Roll the 3D dice"
                      className="w-24 h-24 bg-transparent border-none p-0 cursor-pointer [perspective:600px] flex items-center justify-center outline-none disabled:cursor-not-allowed"
                    >
                      <div
                        className="w-[76px] h-[76px] relative [transform-style:preserve-3d] transition-transform duration-1000 ease-[cubic-bezier(0.2,0.9,0.3,1.2)]"
                        style={{
                          transform: `rotateX(${diceRotation.x}deg) rotateY(${diceRotation.y}deg)`,
                        }}
                      >
                        {/* 6 FACES (Translated 38px) */}
                        {/* Face 1 */}
                        <div className="absolute w-[76px] h-[76px] bg-gradient-to-br from-[#32dfff] via-[#087cf4] to-[#061c52] border-2 border-[#ffd85b] rounded-[15px] p-2 grid grid-cols-3 grid-rows-3 [backface-visibility:hidden] [transform:rotateY(0deg)_translateZ(38px)] shadow-[inset_0_0_10px_rgba(6,28,82,0.8),0_0_8px_rgba(8,124,244,0.5)]">
                          <div /><div /><div />
                          <div />
                          <div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" />
                          <div />
                          <div /><div /><div />
                        </div>

                        {/* Face 2 */}
                        <div className="absolute w-[76px] h-[76px] bg-gradient-to-br from-[#32dfff] via-[#087cf4] to-[#061c52] border-2 border-[#ffd85b] rounded-[15px] p-2 grid grid-cols-3 grid-rows-3 [backface-visibility:hidden] [transform:rotateY(90deg)_translateZ(38px)] shadow-[inset_0_0_10px_rgba(6,28,82,0.8),0_0_8px_rgba(8,124,244,0.5)]">
                          <div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" /><div /><div />
                          <div /><div /><div />
                          <div /><div />
                          <div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" />
                        </div>

                        {/* Face 3 */}
                        <div className="absolute w-[76px] h-[76px] bg-gradient-to-br from-[#32dfff] via-[#087cf4] to-[#061c52] border-2 border-[#ffd85b] rounded-[15px] p-2 grid grid-cols-3 grid-rows-3 [backface-visibility:hidden] [transform:rotateY(180deg)_translateZ(38px)] shadow-[inset_0_0_10px_rgba(6,28,82,0.8),0_0_8px_rgba(8,124,244,0.5)]">
                          <div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" /><div /><div />
                          <div />
                          <div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" />
                          <div />
                          <div /><div />
                          <div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" />
                        </div>

                        {/* Face 4 */}
                        <div className="absolute w-[76px] h-[76px] bg-gradient-to-br from-[#32dfff] via-[#087cf4] to-[#061c52] border-2 border-[#ffd85b] rounded-[15px] p-2 grid grid-cols-3 grid-rows-3 [backface-visibility:hidden] [transform:rotateY(-90deg)_translateZ(38px)] shadow-[inset_0_0_10px_rgba(6,28,82,0.8),0_0_8px_rgba(8,124,244,0.5)]">
                          <div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" /><div /><div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" />
                          <div /><div /><div />
                          <div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" /><div /><div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" />
                        </div>

                        {/* Face 5 */}
                        <div className="absolute w-[76px] h-[76px] bg-gradient-to-br from-[#32dfff] via-[#087cf4] to-[#061c52] border-2 border-[#ffd85b] rounded-[15px] p-2 grid grid-cols-3 grid-rows-3 [backface-visibility:hidden] [transform:rotateX(90deg)_translateZ(38px)] shadow-[inset_0_0_10px_rgba(6,28,82,0.8),0_0_8px_rgba(8,124,244,0.5)]">
                          <div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" /><div /><div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" />
                          <div />
                          <div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" />
                          <div />
                          <div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" /><div /><div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" />
                        </div>

                        {/* Face 6 */}
                        <div className="absolute w-[76px] h-[76px] bg-gradient-to-br from-[#32dfff] via-[#087cf4] to-[#061c52] border-2 border-[#ffd85b] rounded-[15px] p-2 grid grid-cols-3 grid-rows-3 [backface-visibility:hidden] [transform:rotateX(-90deg)_translateZ(38px)] shadow-[inset_0_0_10px_rgba(6,28,82,0.8),0_0_8px_rgba(8,124,244,0.5)]">
                          <div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" /><div /><div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" />
                          <div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" /><div /><div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" />
                          <div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" /><div /><div className="w-3.5 h-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff5aa,#f1be32_60%,#a97705_100%)] shadow-[0_0_5px_rgba(255,216,91,0.8)] m-auto" />
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Move spaces glowing action button */}
                  {canExecuteMove && (
                    <button
                      type="button"
                      onClick={handleExecuteMove}
                      className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 border-2 border-amber-200 text-white font-extrabold text-base py-3 rounded-xl shadow-[0_6px_18px_rgba(217,119,6,0.45)] cursor-pointer mb-4 animate-pulse"
                    >
                      Move {rolledValue} {rolledValue === 1 ? 'space' : 'spaces'} ▶
                    </button>
                  )}

                  {/* Scoreboard List */}
                  <div className="flex flex-col gap-2 border-t border-slate-200 pt-3.5">
                    {players.map((p, idx) => (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between p-2 rounded-xl transition-all ${
                          idx === activeIndex
                            ? 'border-2 border-blue-500 bg-sky-100 shadow-[0_0_12px_rgba(8,118,237,0.25)]'
                            : 'border-2 border-transparent bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded-full border-2 border-white shadow flex-shrink-0"
                            style={{ backgroundColor: p.color }}
                          />
                          <span className="text-sm font-bold text-slate-900">{p.name}</span>
                        </div>
                        <span className="text-xs font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-300">
                          🏆 {p.trophies}/5
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer Signature */}
                <footer className="text-center py-1">
                  <div className="text-sm font-extrabold text-[#ffd85b] drop-shadow-[0_0_10px_rgba(255,216,91,0.5)]">
                    Dr.Abir Wafa
                  </div>
                  <div className="text-xs text-slate-200 mt-0.5">
                    Head of EdTech at Edulixa
                  </div>
                </footer>
              </aside>
            </div>
          </section>
        )}
      </main>

      {/* QUESTION MODAL */}
      {modalSquare !== null && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-[#030e22]/85 backdrop-blur-xs flex items-center justify-center p-4 z-50"
        >
          <div className="bg-gradient-to-b from-[#0e2f63] to-[#071c3d] border-[3px] border-cyan-400 rounded-3xl w-full max-w-[520px] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_30px_rgba(56,189,248,0.35)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-extrabold text-[#ffd85b]">Square {modalSquare} question</h2>
              <button
                type="button"
                onClick={() => setModalSquare(null)}
                className="text-slate-300 hover:text-white text-2xl font-bold leading-none cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="bg-[#061937] border border-blue-900 rounded-xl p-4 text-white font-medium text-base leading-relaxed mb-4">
              {questions[modalSquare]?.q || 'No question text.'}
            </div>

            <form onSubmit={handleAnswerSubmit}>
              <label className="block text-xs text-slate-300 mb-1.5 font-semibold">Your Answer:</label>
              <input
                ref={modalInputRef}
                type="text"
                autoComplete="off"
                placeholder="Type your answer..."
                value={modalAnswerInput}
                onChange={e => setModalAnswerInput(e.target.value)}
                className="w-full bg-[#092653] border-2 border-blue-600 focus:border-cyan-400 rounded-xl px-3.5 py-3 text-white font-semibold outline-none mb-3 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"
              />

              {modalFeedback && (
                <div
                  className={`text-sm font-extrabold text-center mb-3 min-h-[22px] ${
                    modalFeedback.type === 'wrong'
                      ? 'text-rose-400'
                      : modalFeedback.type === 'correct'
                      ? 'text-green-400'
                      : 'text-cyan-400'
                  }`}
                >
                  {modalFeedback.msg}
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setModalSquare(null)}
                  className="px-4 py-2 text-sm font-bold rounded-xl bg-slate-600 hover:bg-slate-500 border border-slate-400 text-white cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-extrabold rounded-xl bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 border-2 border-green-400 text-white cursor-pointer shadow-[0_4px_14px_rgba(22,163,74,0.4)]"
                >
                  Check my answer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SNAKE BITE TOAST */}
      {snakeToastMsg && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900/95 border-[3px] border-red-500 rounded-3xl p-6 flex flex-col items-center gap-2.5 z-40 shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_30px_rgba(239,68,68,0.4)] animate-bounce">
          <div className="text-6xl">😢</div>
          <div className="text-lg font-extrabold text-red-300 text-center">{snakeToastMsg}</div>
        </div>
      )}

      {/* VICTORY OVERLAY */}
      {winner && (
        <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,#0e3770_0%,#061937_55%,#020b18_100%)] flex flex-col items-center justify-center p-6 text-center z-50">
          {/* Confetti */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {Array.from({ length: 90 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-2.5 h-4.5 rounded-[3px] animate-[confettiFall_3s_linear_infinite]"
                style={{
                  left: `${(i * 1.1) % 100}%`,
                  top: '-20px',
                  backgroundColor: ['#ffd85b', '#38bdf8', '#ff5d66', '#18a75b', '#a855f7', '#ffffff'][i % 6],
                  animationDuration: `${2.2 + (i % 5) * 0.5}s`,
                  animationDelay: `${(i % 10) * 0.25}s`,
                }}
              />
            ))}
          </div>

          <div className="text-8xl md:text-9xl mb-3 animate-pulse drop-shadow-[0_0_25px_rgba(255,216,91,0.8)]">🏆</div>
          <h1 className="text-4xl md:text-6xl font-black text-[#ffd85b] drop-shadow-[0_0_20px_rgba(255,216,91,0.6)] mb-2">
            Victory!
          </h1>
          <div className="text-2xl md:text-3xl font-extrabold text-white mb-2" style={{ color: winner.color }}>
            {winner.name}
          </div>
          <div className="text-lg md:text-xl text-blue-200 font-semibold mb-7">
            {winner.reason}
          </div>
          <button
            type="button"
            onClick={handleRestartGame}
            className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 border-[3px] border-green-300 text-white font-black text-xl px-9 py-4 rounded-full shadow-[0_10px_30px_rgba(34,197,94,0.5)] cursor-pointer transition-transform hover:scale-105 active:scale-95"
          >
            Play again
          </button>
        </div>
      )}
    </div>
  );
}
