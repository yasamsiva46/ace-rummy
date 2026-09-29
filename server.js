const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// HTML ఫైల్‌ను డైరెక్ట్ లింక్ ద్వారా బ్రౌజర్‌కు అందించడం
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// సిస్టమ్ Local IP కనుగొనే ఫంక్షన్ (వైఫై లింక్ కోసం)
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (let devName in interfaces) {
    for (let iface of interfaces[devName]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const suits = ['♠', '♥', '♦', '♣'];
const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDoubleDeck() {
  let deck = [];
  for (let d = 1; d <= 2; d++) {
    for (let suit of suits) {
      for (let value of values) {
        let color = (suit === '♥' || suit === '♦') ? 'red' : 'black';
        deck.push({ id: Math.random().toString(36).substr(2, 9), suit, value, color });
      }
    }
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

let players = [];
let gameStarted = false;
let closedDeck = [];
let openDeck = [];
let currentTurnIndex = 0;
let hasDrawnCard = false;
let wildJoker = null;
let discardHistory = [];

let turnTimer = null;
let currentTimerSeconds = 30;
let isExtraTime = false;

function startTurnTimer() {
  clearInterval(turnTimer);
  currentTimerSeconds = 30;
  isExtraTime = false;

  const currentPlayer = players[currentTurnIndex];
  const isFirstRound = currentPlayer && currentPlayer.turnsPlayed === 0;

  turnTimer = setInterval(() => {
    currentTimerSeconds--;
    io.emit('timer_update', { 
      seconds: currentTimerSeconds, 
      isExtra: isExtraTime,
      isFirstRound: isFirstRound 
    });

    if (currentTimerSeconds <= 0) {
      if (!isExtraTime && isFirstRound) {
        isExtraTime = true;
        currentTimerSeconds = 15;
      } else {
        clearInterval(turnTimer);
        autoPassTurn();
      }
    }
  }, 1000);
}

function autoPassTurn() {
  const player = players[currentTurnIndex];
  if (!player) return;

  if (!hasDrawnCard && closedDeck.length > 0) {
    player.cards.push(closedDeck.pop());
  }
  if (player.cards.length > 13) {
    const discarded = player.cards.pop();
    openDeck.push(discarded);
    discardHistory.unshift({ player: player.name, card: discarded });
  }

  player.turnsPlayed = (player.turnsPlayed || 0) + 1;
  io.to(player.id).emit('my_cards_updated', { cards: player.cards });
  currentTurnIndex = (currentTurnIndex + 1) % players.length;
  hasDrawnCard = false;
  broadcastGameState();
  startTurnTimer();
}

function broadcastGameState() {
  players.forEach((p, idx) => {
    io.to(p.id).emit('turn_update', {
      isMyTurn: idx === currentTurnIndex,
      turnPlayerName: players[currentTurnIndex].name,
      hasDrawn: hasDrawnCard,
      openCard: openDeck[openDeck.length - 1],
      closedCardsCount: closedDeck.length,
      discardHistory: discardHistory.slice(0, 15)
    });
  });
}

io.on('connection', (socket) => {
  socket.on('join_game', (data) => {
    if (players.length >= 6) {
      socket.emit('game_full', { message: 'టేబుల్ ఫుల్ అయింది (గరిష్టంగా 6గురు ప్లేయర్లు)!' });
      return;
    }

    if (gameStarted) {
      socket.emit('game_full', { message: 'ఆట ఇప్పటికే ప్రారంభమైంది! దయచేసి తర్వాతి రౌండ్ వరకు ఆగండి.' });
      return;
    }

    const isHost = players.length === 0;
    players.push({ 
      id: socket.id, 
      name: data.playerName || `Player ${players.length + 1}`, 
      cards: [],
      turnsPlayed: 0,
      isHost: isHost
    });

    // లాబీలో ఉన్న అందరికీ అప్‌డేట్ పంపడం
    io.emit('lobby_update', {
      players: players.map(p => ({ name: p.name, isHost: p.isHost })),
      canStart: players.length >= 2,
      hostId: players[0].id
    });
  });

  // హోస్ట్ గేమ్ ప్రారంభించినప్పుడు
  socket.on('start_game_now', () => {
    if (players.length < 2 || gameStarted) return;
    if (players[0].id !== socket.id) return; // హోస్ట్ మాత్రమే స్టార్ట్ చేయగలరు

    gameStarted = true;
    closedDeck = shuffle(createDoubleDeck());
    openDeck = [];
    discardHistory = [];
    wildJoker = closedDeck.pop();

    players.forEach(p => {
      p.cards = closedDeck.splice(0, 13);
      p.turnsPlayed = 0;
    });

    openDeck.push(closedDeck.pop());
    currentTurnIndex = 0;
    hasDrawnCard = false;

    players.forEach((p) => {
      const opponents = players.filter(pl => pl.id !== p.id).map(pl => ({ name: pl.name, count: pl.cards.length }));
      io.to(p.id).emit('game_started', {
        cards: p.cards,
        opponents: opponents,
        wildJoker: wildJoker
      });
    });

    broadcastGameState();
    startTurnTimer();
  });

  socket.on('draw_card', (data) => {
    if (!gameStarted) return;
    const player = players[currentTurnIndex];
    if (player.id !== socket.id || hasDrawnCard) return;

    let pickedCard = (data.source === 'open' && openDeck.length > 0) ? openDeck.pop() : closedDeck.pop();
    if (pickedCard) {
      player.cards.push(pickedCard);
      hasDrawnCard = true;
      socket.emit('my_cards_updated', { cards: player.cards });
      broadcastGameState();
    }
  });

  socket.on('discard_card', (data) => {
    if (!gameStarted) return;
    const player = players[currentTurnIndex];
    if (player.id !== socket.id || !hasDrawnCard) return;

    const cardIndex = player.cards.findIndex(c => c.id === data.cardId);
    if (cardIndex !== -1) {
      const discCard = player.cards.splice(cardIndex, 1)[0];
      openDeck.push(discCard);
      discardHistory.unshift({ player: player.name, card: discCard });

      player.turnsPlayed = (player.turnsPlayed || 0) + 1;
      socket.emit('my_cards_updated', { cards: player.cards });

      currentTurnIndex = (currentTurnIndex + 1) % players.length;
      hasDrawnCard = false;
      broadcastGameState();
      startTurnTimer();
    }
  });

  socket.on('declare_show', () => {
    if (!gameStarted) return;
    const player = players[currentTurnIndex];
    if (player.id !== socket.id || !hasDrawnCard) return;

    clearInterval(turnTimer);
    gameStarted = false;

    io.emit('game_result', {
      winnerName: player.name,
      message: `🏆 అద్భుతం! ${player.name} సరైన షోతో మ్యాచ్ గెలిచారు.`
    });
  });

  socket.on('disconnect', () => {
    players = players.filter(p => p.id !== socket.id);
    if (players.length < 2 && gameStarted) {
      gameStarted = false;
      clearInterval(turnTimer);
      io.emit('game_reset_due_to_disconnect', { message: 'ప్లేయర్లు నిష్క్రమించడం వల్ల గేమ్ ఆగిపోయింది.' });
    }
    io.emit('lobby_update', {
      players: players.map(p => ({ name: p.name, isHost: p.isHost })),
      canStart: players.length >= 2,
      hostId: players.length > 0 ? players[0].id : null
    });
  });
});
// --- యూజర్ల లాగిన్ & అడ్మిన్ కాయిన్స్ కోడ్ ప్రారంభం ---
const fs = require('fs');
const USERS_FILE = './users.json';

if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({}));
}

function getUsers() {
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '{}');
    } catch(e) {
        return {};
    }
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

app.use(express.json());

// అడ్మిన్ పేజీ ఓపెన్ అవ్వడానికి
app.get('/admin', (req, res) => {
    res.sendFile(__dirname + '/admin.html');
});

// లాగిన్ / సైన్ అప్
app.post('/api/auth', (req, res) => {
    const { name, phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'ఫోన్ నంబర్ మరియు పాస్‌వర్డ్ తప్పనిసరి' });

    let users = getUsers();
    if (!users[phone]) {
        // కొత్త వారికి 100 బోనస్ కాయిన్స్
        users[phone] = { name: name || 'Player', phone, password, coins: 100 };
        saveUsers(users);
        return res.json({ success: true, message: 'అకౌంట్ క్రియేట్ అయింది!', user: users[phone] });
    } else {
        if (users[phone].password === password) {
            return res.json({ success: true, message: 'లాగిన్ విజయవంతమైంది!', user: users[phone] });
        } else {
            return res.status(401).json({ error: 'తప్పుడు పాస్‌వర్డ్!' });
        }
    }
});

// అడ్మిన్ పాస్‌వర్డ్
const ADMIN_SECRET = 'admin@123';

// ప్లేయర్ల లిస్ట్ చూడటం
app.get('/api/admin/users', (req, res) => {
    const key = req.headers['x-admin-key'];
    if (key !== ADMIN_SECRET) return res.status(403).json({ error: 'అనుమతి లేదు' });
    res.json(getUsers());
});

// కాయిన్స్ యాడ్ / తీసివేత
app.post('/api/admin/update-coins', (req, res) => {
    const key = req.headers['x-admin-key'];
    if (key !== ADMIN_SECRET) return res.status(403).json({ error: 'అనుమతి లేదు' });

    const { phone, amount } = req.body;
    let users = getUsers();

    if (!users[phone]) return res.status(404).json({ error: 'ప్లేయర్ దొరకలేదు' });

    users[phone].coins = Math.max(0, (users[phone].coins || 0) + Number(amount));
    saveUsers(users);

    res.json({ success: true, newBalance: users[phone].coins });
});
// --- యూజర్ల లాగిన్ & అడ్మిన్ కాయిన్స్ కోడ్ ముగింపు ---
const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`===========================================================`);
  console.log(`🎮 VNS రమ్మీ సర్వర్ విజయవంతంగా ప్రారంభమైంది!`);
  console.log(`💻 మీ కంప్యూటర్‌లో ఓపెన్ చేయడానికి లింక్: http://localhost:${PORT}`);
  console.log(`📱 6గురు ప్లేయర్లకు పంపాల్సిన వైఫై/మొబైల్ లింక్: http://${ip}:${PORT}`);
  console.log(`===========================================================`);
});