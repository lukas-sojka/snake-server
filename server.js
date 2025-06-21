// Node.js WebSocket Server for Multiplayer Snake Game
const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Game state
const gameState = {
  snakes: new Map(),
  food: new Map(),
  obstacles: new Map(),
  gameArea: { width: 40, height: 30 } // Grid units
};

// Fruit types with different rarities and point values
const FRUIT_TYPES = {
  apple: {
    emoji: '🍎',
    color: '#ff4444',
    points: 1,
    rarity: 0.6, // 60% chance
    name: 'Apple'
  },
  banana: {
    emoji: '🍌',
    color: '#ffdd44',
    points: 2,
    rarity: 0.25, // 25% chance
    name: 'Banana'
  },
  grape: {
    emoji: '🍇',
    color: '#8844ff',
    points: 3,
    rarity: 0.1, // 10% chance
    name: 'Grapes'
  },
  cherry: {
    emoji: '🍒',
    color: '#ff1144',
    points: 5,
    rarity: 0.04, // 4% chance
    name: 'Cherry'
  },
  diamond: {
    emoji: '💎',
    color: '#44ffff',
    points: 10,
    rarity: 0.01, // 1% chance - legendary
    name: 'Diamond Fruit'
  }
};

console.log('🐍 Initializing Snake Game Server...');
console.log('📊 Initial game state:', {
  snakes: gameState.snakes.size,
  food: gameState.food.size,
  obstacles: gameState.obstacles.size,
  gameArea: gameState.gameArea
});
// Generate random position
function getRandomPosition() {
  const pos = {
    x: Math.floor(Math.random() * gameState.gameArea.width),
    y: Math.floor(Math.random() * gameState.gameArea.height)
  };
  console.log('🎯 Generated random position:', pos);
  return pos;
}

// Check if position has obstacle
function isObstacleAt(pos) {
  for (let obstacle of gameState.obstacles.values()) {
    if (obstacle.x === pos.x && obstacle.y === pos.y) {
      return true;
    }
  }
  return false;
}

// Check if position is occupied by snake or obstacle
function isPositionOccupied(pos) {
  // Check snakes
  for (let snake of gameState.snakes.values()) {
    if (snake.body.some(segment => segment.x === pos.x && segment.y === pos.y)) {
      console.log('⚠️  Position occupied by snake:', pos);
      return true;
    }
  }

  // Check obstacles
  if (isObstacleAt(pos)) {
    console.log('⚠️  Position occupied by obstacle:', pos);
    return true;
  }
  return false;
}

// Generate obstacles
function generateObstacles() {
  console.log('🧱 Generating obstacles...');
  const obstacleCount = 15; // Number of obstacles
  let generated = 0;

  try {
    for (let i = 0; i < obstacleCount; i++) {
      const pos = getRandomPosition();

      // Don't place obstacles too close to center (spawn area)
      const centerX = Math.floor(gameState.gameArea.width / 2);
      const centerY = Math.floor(gameState.gameArea.height / 2);
      const distanceFromCenter = Math.abs(pos.x - centerX) + Math.abs(pos.y - centerY);

      if (distanceFromCenter > 5 && !isPositionOccupied(pos) && !isObstacleAt(pos)) {
        const obstacleId = `obstacle_${i}`;
        gameState.obstacles.set(obstacleId, {
          id: obstacleId,
          x: pos.x,
          y: pos.y,
          type: 'rock' // Could add different obstacle types later
        });
        generated++;
        console.log(`🧱 Obstacle placed at (${pos.x}, ${pos.y})`);
      }
    }
  } catch (error) {
    console.error('❌ Error generating obstacles:', error);
  }

  console.log(`✅ Generated ${generated} obstacles`);
}

// Select fruit type based on rarity
function selectFruitType() {
  const random = Math.random();
  let cumulativeChance = 0;

  for (const [type, config] of Object.entries(FRUIT_TYPES)) {
    cumulativeChance += config.rarity;
    if (random <= cumulativeChance) {
      return { type, ...config };
    }
  }

  // Fallback to apple
  return { type: 'apple', ...FRUIT_TYPES.apple };
}
// Generate food at safe position with different types
function generateFood() {
  console.log('🍎 Generating food... Current food count:', gameState.food.size);
  const maxAttempts = 50;
  let attempts = 0;
  let foodGenerated = 0;

  try {
    while (gameState.food.size < 12 && attempts < maxAttempts) { // Increased food count
      const pos = getRandomPosition();

      // Don't place food on snakes or obstacles
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
        console.log(`✅ ${fruitType.name} generated at (${pos.x}, ${pos.y}) - Points: ${fruitType.points}`);
      }
      attempts++;
    }
  } catch (error) {
    console.error('❌ Error generating food:', error);
  }

  console.log(`🍎 Food generation complete: ${foodGenerated} new food items, total: ${gameState.food.size}`);
}

// Initial food generation
console.log('🍎 Generating initial food...');
generateFood();

// Generate initial obstacles
console.log('🧱 Generating initial obstacles...');
generateObstacles();

// Broadcast to all clients
function broadcast(message) {
  const clientCount = wss.clients.size;
  console.log(`📡 Broadcasting to ${clientCount} clients:`, {
    type: message.type,
    dataSize: JSON.stringify(message).length
  });

  let successCount = 0;
  let errorCount = 0;

  wss.clients.forEach((client, index) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(message));
        successCount++;
      } catch (error) {
        console.error(`❌ Error sending to client ${index}:`, error);
        errorCount++;
      }
    } else {
      console.log(`⚠️  Client ${index} not ready, state: ${client.readyState}`);
    }
  });

  console.log(`📊 Broadcast result: ${successCount} success, ${errorCount} errors`);
}

// Game loop
function gameLoop() {
  console.log('🔄 Game loop tick - Players:', gameState.snakes.size, 'Food:', gameState.food.size, 'Obstacles:', gameState.obstacles.size);
  let gameStateChanged = false;
  // Move snakes
  gameState.snakes.forEach((snake, playerId) => {
    if (snake.body.length === 0) {
      console.log(`⚠️  Snake ${playerId} has no body segments`);
      return;
    }
    const head = snake.body[0];
    const newHead = {
      x: head.x + snake.direction.x,
      y: head.y + snake.direction.y
    };

    console.log(`🐍 Moving snake ${snake.name}: (${head.x},${head.y}) → (${newHead.x},${newHead.y})`);
    // Wrap around boundaries
    if (newHead.x < 0) newHead.x = gameState.gameArea.width - 1;
    if (newHead.x >= gameState.gameArea.width) newHead.x = 0;
    if (newHead.y < 0) newHead.y = gameState.gameArea.height - 1;
    if (newHead.y >= gameState.gameArea.height) newHead.y = 0;

    if (newHead.x !== head.x + snake.direction.x || newHead.y !== head.y + snake.direction.y) {
      console.log(`🔄 Snake ${snake.name} wrapped around to (${newHead.x},${newHead.y})`);
    }

    // Check obstacle collision - snake dies and respawns
    if (isObstacleAt(newHead)) {
      console.log(`💥 OBSTACLE HIT! Snake ${snake.name} hit obstacle at (${newHead.x},${newHead.y})`);

      try {
        // Respawn snake at random position
        let newPos = getRandomPosition();
        let attempts = 0;
        while (isPositionOccupied(newPos) && attempts < 20) {
          newPos = getRandomPosition();
          attempts++;
        }

        snake.body = [newPos];
        snake.score = Math.max(1, Math.floor(snake.score * 0.7)); // Lose 30% of score
        console.log(`♻️  Snake ${snake.name} respawned at (${newPos.x},${newPos.y}) with score ${snake.score}`);
        gameStateChanged = true;
      } catch (error) {
        console.error('❌ Error respawning snake:', error);
        // Fallback: place at center
        snake.body = [{ x: Math.floor(gameState.gameArea.width / 2), y: Math.floor(gameState.gameArea.height / 2) }];
      }
      return; // Skip rest of movement logic
    }

    snake.body.unshift(newHead);

    // Check food collision
    let ateFood = false;
    let pointsGained = 0;
    gameState.food.forEach((food, foodId) => {
      if (newHead.x === food.x && newHead.y === food.y) {
        console.log(`🍎 FOOD EATEN! Player ${snake.name} ate ${food.name} at (${food.x},${food.y}) for ${food.points} points`);
        gameState.food.delete(foodId);
        pointsGained = food.points;
        snake.score += pointsGained;
        ateFood = true;
        gameStateChanged = true;

        console.log(`📊 Player ${snake.name} new score: ${snake.score}, body length: ${snake.body.length}`);

        // Add multiple segments for high-value fruits
        for (let i = 1; i < pointsGained; i++) {
          const lastSegment = snake.body[snake.body.length - 1];
          snake.body.push({ ...lastSegment }); // Duplicate tail
        }
      }
    });
    // Remove tail if no food eaten
    if (!ateFood) {
      const tail = snake.body.pop();
      console.log(`✂️  Removed tail from ${snake.name} at (${tail.x},${tail.y})`);
    }
  });

  // Ensure minimum food count
  if (gameState.food.size < 8) {
    console.log('🍎 Low food count, generating more...');
    generateFood();
    gameStateChanged = true;
  }

  // Only broadcast if game state changed
  if (gameStateChanged || gameState.snakes.size > 0) {
    console.log('📡 Broadcasting game state update');
    broadcast({
      type: 'gameState',
      gameState: {
        snakes: Array.from(gameState.snakes.values()),
        food: Array.from(gameState.food.values()),
        obstacles: Array.from(gameState.obstacles.values())
      }
    });
  } else {
    console.log('⏸️  No game state changes, skipping broadcast');
  }
}

// Start game loop
console.log('⏰ Starting game loop...');
const gameInterval = setInterval(gameLoop, 150); // ~6.7 FPS
console.log('✅ Game loop started at 6.7 FPS (150ms intervals)');

// WebSocket server connection handling
wss.on('connection', (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  const clientPort = req.socket.remotePort;
  const userAgent = req.headers['user-agent'] || 'Unknown';

  console.log('🔗 NEW CLIENT CONNECTION:');
  console.log('  📍 IP:', clientIP);
  console.log('  🚪 Port:', clientPort);
  console.log('  🌐 User Agent:', userAgent.substring(0, 50) + '...');
  console.log('  📊 Total clients:', wss.clients.size);

  // Connection heartbeat
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
    console.log('💓 Received pong from client');
  });
  ws.on('message', (message) => {
    console.log('📥 Received message:', message.toString().substring(0, 100) + '...');
    try {
      const data = JSON.parse(message);
      console.log('📋 Parsed message type:', data.type);
      switch (data.type) {
        case 'join':
          console.log('🎮 Processing join request...');
          const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const startPosition = getRandomPosition();
          const snake = {
            id: playerId,
            name: data.name || 'Anonymous',
            color: data.color || '#ff6b6b',
            body: [startPosition],
            direction: { x: 0, y: 1 },
            score: 1
          };
          gameState.snakes.set(playerId, snake);

          console.log('✅ PLAYER JOINED:');
          console.log('  👤 Name:', snake.name);
          console.log('  🆔 ID:', playerId);
          console.log('  🎨 Color:', snake.color);
          console.log('  📍 Start position:', startPosition);
          console.log('  📊 Total players:', gameState.snakes.size);
          // Send player ID to client
          const joinResponse = {
            type: 'playerJoined',
            playerId: playerId
          };
          console.log('📤 Sending playerJoined response');
          ws.send(JSON.stringify(joinResponse));
          // Store player ID on WebSocket
          ws.playerId = playerId;

          // Broadcast updated player count
          broadcast({
            type: 'playerCount',
            count: gameState.snakes.size
          });
          break;
        case 'direction':
          if (ws.playerId && gameState.snakes.has(ws.playerId)) {
            const snake = gameState.snakes.get(ws.playerId);
            const newDirection = data.direction;

            console.log(`🎮 Direction change for ${snake.name}: (${snake.direction.x},${snake.direction.y}) → (${newDirection.x},${newDirection.y})`);
            // Prevent reversing into itself (only if snake has more than 1 segment)
            if (snake.body.length > 1) {
              const currentDir = snake.direction;
              if (newDirection.x === -currentDir.x && newDirection.y === -currentDir.y) {
                console.log('⚠️  Invalid move: cannot reverse direction');
                break; // Invalid move
              }
            }

            snake.direction = newDirection;
            console.log(`✅ Direction updated for ${snake.name}`);
          } else {
            console.log('⚠️  Direction change ignored: player not found or no playerId');
          }
          break;

        case 'ping':
          console.log('🏓 Received ping, sending pong');
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        default:
          console.log('❓ Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('❌ ERROR PARSING MESSAGE:', error);
      console.error('📄 Raw message:', message.toString());
    }
  });

  ws.on('close', (code, reason) => {
    console.log('👋 CLIENT DISCONNECTED:');
    console.log('  🔢 Code:', code);
    console.log('  📝 Reason:', reason.toString() || 'No reason provided');
    if (ws.playerId) {
      const snake = gameState.snakes.get(ws.playerId);
      gameState.snakes.delete(ws.playerId);
      console.log('  👤 Player removed:', snake?.name || 'Unknown');
      console.log('  🆔 Player ID:', ws.playerId);
      console.log('  📊 Remaining players:', gameState.snakes.size);

      // Broadcast updated player count
      broadcast({
        type: 'playerCount',
        count: gameState.snakes.size
      });
    }
  });

  ws.on('error', (error) => {
    console.error('❌ WEBSOCKET ERROR:');
    console.error('  🆔 Player ID:', ws.playerId || 'Unknown');
    console.error('  📝 Error:', error);
    console.error('  📍 Stack:', error.stack);
  });
});

// Heartbeat to detect broken connections
const heartbeatInterval = setInterval(() => {
  console.log('💓 Heartbeat check...');
  let aliveCount = 0;
  let deadCount = 0;

  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log(`💀 Terminating dead connection for player: ${ws.playerId || 'Unknown'}`);
      ws.terminate();
      deadCount++;
      return;
    }

    ws.isAlive = false;
    ws.ping();
    aliveCount++;
  });

  console.log(`💓 Heartbeat result: ${aliveCount} alive, ${deadCount} terminated`);
}, 30000); // 30 seconds

// Health check endpoint
server.on('request', (req, res) => {
  console.log('🏥 Health check request from:', req.socket.remoteAddress);
  console.log('🌐 Request URL:', req.url);
  console.log('🔧 Request method:', req.method);
  console.log('📋 Request headers:', req.headers);

  // Handle CORS for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  if (req.url === '/health') {
    const healthData = {
      status: 'healthy',
      players: gameState.snakes.size,
      food: gameState.food.size,
      obstacles: gameState.obstacles.size,
      uptime: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      websocket: 'ready'
    };

    console.log('✅ Health check response:', healthData);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(healthData, null, 2));
  } else if (req.url === '/') {
    // Root endpoint for Railway
    console.log('🏠 Root endpoint accessed');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Snake Game WebSocket Server</title>
        </head>
        <body>
          <h1>🐍 Snake Game WebSocket Server</h1>
          <p>Status: <strong>Running</strong></p>
          <p>Players: <strong>${gameState.snakes.size}</strong></p>
          <p>Food: <strong>${gameState.food.size}</strong></p>
          <p>Obstacles: <strong>${gameState.obstacles.size}</strong></p>
          <p>WebSocket URL: <strong>wss://${req.headers.host}</strong></p>
          <script>
            // Test WebSocket connection
            const ws = new WebSocket('wss://' + window.location.host);
            ws.onopen = () => console.log('WebSocket test: Connected');
            ws.onclose = (e) => console.log('WebSocket test: Closed', e.code);
            ws.onerror = (e) => console.log('WebSocket test: Error', e);
          </script>
        </body>
      </html>
    `);
  } else {
    console.log('❓ Unknown request path:', req.url);
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 - Not Found\nSnake Game WebSocket Server');
  }
});

// Handle WebSocket upgrade explicitly
server.on('upgrade', (request, socket, head) => {
  console.log('🔄 WebSocket upgrade request received');
  console.log('  📍 URL:', request.url);
  console.log('  🌐 Headers:', request.headers);

  wss.handleUpgrade(request, socket, head, (ws) => {
    console.log('✅ WebSocket upgrade successful');
    wss.emit('connection', ws, request);
  });
});

const PORT = process.env.PORT || 8080;
console.log('🚀 Starting server...');
server.listen(PORT, () => {
  console.log('🎉 SERVER STARTED SUCCESSFULLY!');
  console.log('  🌐 Port:', PORT);
  console.log('  📡 WebSocket server ready for connections');
  console.log('  🏥 Health check: http://localhost:' + PORT + '/health');
  console.log('  🕐 Server time:', new Date().toISOString());
});

// Error handling
server.on('error', (error) => {
  console.error('❌ SERVER ERROR:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 SHUTTING DOWN SERVER...');
  console.log('⏰ Clearing game loop...');
  clearInterval(gameInterval);
  clearInterval(heartbeatInterval);

  console.log('📡 Notifying all clients...');
  broadcast({ type: 'serverShutdown' });

  console.log('🔒 Closing server...');
  server.close(() => {
    console.log('✅ Server closed gracefully');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  clearInterval(gameInterval);
  clearInterval(heartbeatInterval);
  server.close(() => {
    process.exit(0);
  });
});

// Catch uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 UNCAUGHT EXCEPTION:', error);
  console.error('📍 Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 UNHANDLED REJECTION at:', promise);
  console.error('📝 Reason:', reason);
});