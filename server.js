// Simple Node.js WebSocket Server for Multiplayer Snake Game
const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Game state
const gameState = {
  snakes: new Map(),
  food: new Map(),
  obstacles: new Map(),
  gameArea: { width: 40, height: 30 }
};

// Predefined unique colors for players
const PLAYER_COLORS = [
  '#ff6b6b', // Red
  '#4ecdc4', // Teal
  '#45b7d1', // Blue
  '#96ceb4', // Green
  '#ffeaa7', // Yellow
  '#ddd6fe', // Purple
  '#fd79a8', // Pink
  '#fdcb6e', // Orange
  '#6c5ce7', // Violet
  '#a29bfe', // Light Purple
  '#fd79a8', // Rose
  '#00b894', // Emerald
  '#e17055', // Coral
  '#81ecec', // Cyan
  '#fab1a0', // Peach
  '#00cec9', // Turquoise
  '#55a3ff', // Light Blue
  '#ff7675', // Light Red
  '#74b9ff', // Sky Blue
  '#fd79a8'  // Magenta
];

// Track used colors
const usedColors = new Set();

// Fruit types with different rarities and point values
const FRUIT_TYPES = {
  apple: { emoji: '🍎', color: '#ff4444', points: 1, rarity: 0.6, name: 'Apple' },
  banana: { emoji: '🍌', color: '#ffdd44', points: 2, rarity: 0.25, name: 'Banana' },
  grape: { emoji: '🍇', color: '#8844ff', points: 3, rarity: 0.1, name: 'Grapes' },
  cherry: { emoji: '🍒', color: '#ff1144', points: 5, rarity: 0.04, name: 'Cherry' },
  diamond: { emoji: '💎', color: '#44ffff', points: 10, rarity: 0.01, name: 'Diamond' }
};

console.log('🐍 Starting Snake Game Server...');

// Helper functions
function getRandomPosition() {
  return {
    x: Math.floor(Math.random() * gameState.gameArea.width),
    y: Math.floor(Math.random() * gameState.gameArea.height)
  };
}
function isObstacleAt(pos) {
  return Array.from(gameState.obstacles.values()).some(obs => obs.x === pos.x && obs.y === pos.y);
}
function isPositionOccupied(pos) {
  // Check snakes
  for (let snake of gameState.snakes.values()) {
    if (snake.body.some(segment => segment.x === pos.x && segment.y === pos.y)) {
      return true;
    }
  }
  // Check obstacles
  return isObstacleAt(pos);
}
function selectFruitType() {
  const random = Math.random();
  let cumulativeChance = 0;

  for (const [type, config] of Object.entries(FRUIT_TYPES)) {
    cumulativeChance += config.rarity;
    if (random <= cumulativeChance) {
      return { type, ...config };
    }
  }

  return { type: 'apple', ...FRUIT_TYPES.apple };
}

function generateObstacles() {
  const obstacleCount = 12;
  let generated = 0;

  for (let i = 0; i < obstacleCount; i++) {
    const pos = getRandomPosition();
    const centerX = Math.floor(gameState.gameArea.width / 2);
    const centerY = Math.floor(gameState.gameArea.height / 2);
    const distanceFromCenter = Math.abs(pos.x - centerX) + Math.abs(pos.y - centerY);

    if (distanceFromCenter > 5 && !isPositionOccupied(pos)) {
      gameState.obstacles.set(`obstacle_${i}`, {
        id: `obstacle_${i}`,
        x: pos.x,
        y: pos.y,
        type: 'rock'
      });
      generated++;
    }
  }

  console.log(`✅ Generated ${generated} obstacles`);
}
function generateFood() {
  const maxAttempts = 30;
  let attempts = 0;
  let foodGenerated = 0;

  while (gameState.food.size < 10 && attempts < maxAttempts) {
    const pos = getRandomPosition();

    if (!isPositionOccupied(pos)) {
      const fruitType = selectFruitType();
      const foodId = `food_${Date.now()}_${Math.random()}`;
      gameState.food.set(foodId, {
        id: foodId,
        x: pos.x,
        y: pos.y,
        type: fruitType.type,
        emoji: fruitType.emoji,
        color: fruitType.color,
        points: fruitType.points,
        name: fruitType.name
      });
      foodGenerated++;
    }
    attempts++;
  }

  console.log(`🍎 Generated ${foodGenerated} food items, total: ${gameState.food.size}`);
}
function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}
function gameLoop() {
  let gameStateChanged = false;
  // Move snakes
  gameState.snakes.forEach((snake) => {
    if (snake.body.length === 0) return;
    const head = snake.body[0];
    const newHead = {
      x: head.x + snake.direction.x,
      y: head.y + snake.direction.y
    };

    // Wrap around boundaries
    if (newHead.x < 0) newHead.x = gameState.gameArea.width - 1;
    if (newHead.x >= gameState.gameArea.width) newHead.x = 0;
    if (newHead.y < 0) newHead.y = gameState.gameArea.height - 1;
    if (newHead.y >= gameState.gameArea.height) newHead.y = 0;

    // Check obstacle collision
    if (isObstacleAt(newHead)) {
      let newPos = getRandomPosition();
      let attempts = 0;
      while (isPositionOccupied(newPos) && attempts < 20) {
        newPos = getRandomPosition();
        attempts++;
      }

      snake.body = [newPos];
      snake.score = Math.max(1, Math.floor(snake.score * 0.7));
      gameStateChanged = true;
      return;
    }

    snake.body.unshift(newHead);

    // Check food collision
    let ateFood = false;
    gameState.food.forEach((food, foodId) => {
      if (newHead.x === food.x && newHead.y === food.y) {
        gameState.food.delete(foodId);
        snake.score += food.points;
        ateFood = true;
        gameStateChanged = true;

        // Add segments for high-value fruits
        for (let i = 1; i < food.points; i++) {
          const lastSegment = snake.body[snake.body.length - 1];
          snake.body.push({ ...lastSegment });
        }
      }
    });
    if (!ateFood) {
      snake.body.pop();
    }
  });

  // Ensure minimum food count
  if (gameState.food.size < 6) {
    generateFood();
    gameStateChanged = true;
  }

  // Broadcast if needed
  if (gameStateChanged || gameState.snakes.size > 0) {
    broadcast({
      type: 'gameState',
      gameState: {
        snakes: Array.from(gameState.snakes.values()),
        food: Array.from(gameState.food.values()),
        obstacles: Array.from(gameState.obstacles.values())
      }
    });
  }
}

// Initialize game
generateObstacles();
generateFood();

// Start game loop
const gameInterval = setInterval(gameLoop, 150);

// New functions for color management
function getUniqueColor() {
  // Find the first available color
  for (const color of PLAYER_COLORS) {
    if (!usedColors.has(color)) {
      usedColors.add(color);
      return color;
    }
  }

  // If all predefined colors are used, generate a random one
  const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16);
  usedColors.add(randomColor);
  return randomColor;
}

function releaseColor(color) {
  usedColors.delete(color);
}
// WebSocket handling
wss.on('connection', (ws) => {
  console.log('🔗 New client connected');
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      switch (data.type) {
        case 'join':
          const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const startPosition = getRandomPosition();
          const uniqueColor = getUniqueColor();
          const snake = {
            id: playerId,
            name: data.name || 'Anonymous',
            color: uniqueColor,
            body: [startPosition],
            direction: { x: 0, y: 1 },
            score: 1
          };
          gameState.snakes.set(playerId, snake);
          ws.playerId = playerId;
          ws.playerColor = uniqueColor;

          console.log(`🎨 Assigned color ${uniqueColor} to player ${snake.name}`);

          ws.send(JSON.stringify({
            type: 'playerJoined',
            playerId: playerId
          }));
          broadcast({
            type: 'playerCount',
            count: gameState.snakes.size
          });
          break;
        case 'direction':
          if (ws.playerId && gameState.snakes.has(ws.playerId)) {
            const snake = gameState.snakes.get(ws.playerId);
            const newDirection = data.direction;

            // Prevent reversing
            if (snake.body.length > 1) {
              const currentDir = snake.direction;
              if (newDirection.x === -currentDir.x && newDirection.y === -currentDir.y) {
                break;
              }
            }

            snake.direction = newDirection;
          }
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
      }
    } catch (error) {
      console.error('❌ Message parsing error:', error);
    }
  });

  ws.on('close', () => {
    console.log('👋 Client disconnected');
    if (ws.playerId) {
      if (ws.playerColor) {
        releaseColor(ws.playerColor);
        console.log(`🎨 Released color ${ws.playerColor}`);
      }
      gameState.snakes.delete(ws.playerId);
      broadcast({
        type: 'playerCount',
        count: gameState.snakes.size
      });
    }
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
});

// HTTP server for health checks
server.on('request', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      players: gameState.snakes.size,
      food: gameState.food.size,
      obstacles: gameState.obstacles.size,
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <h1>🐍 Snake Game Server</h1>
      <p>Players: ${gameState.snakes.size}</p>
      <p>Food: ${gameState.food.size}</p>
      <p>Obstacles: ${gameState.obstacles.size}</p>
    `);
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🎉 Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  clearInterval(gameInterval);
  server.close(() => process.exit(0));
});