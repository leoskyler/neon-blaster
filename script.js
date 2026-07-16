const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Game States
let score = 0;
let lives = 3;
let isPlaying = false;
let screenShake = 0;

// High-DPI Resolution Setup
function scaleCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}
window.addEventListener("resize", () => {
    scaleCanvas();
    initBricks();
});
scaleCanvas();

// --- Game Objects ---

// 1. Paddle Object
const paddle = {
    width: 70,
    height: 10,
    x: 0, // Assigned on reset
    y: 0, // Assigned on reset
    color: "#00f0ff"
};

// 2. Ball Object
const ball = {
    radius: 6,
    x: 0,
    y: 0,
    dx: 0,
    dy: 0,
    baseSpeed: 4.5,
    color: "#ff2a5f"
};

// 3. Bricks Setup
const brickRows = 5;
const brickCols = 6;
let bricks = [];

function initBricks() {
    const virtualWidth = canvas.width / window.devicePixelRatio;
    const padding = 6;
    const offsetTop = 40;
    const offsetLeft = 10;
    
    // Dynamically scale brick width based on canvas sizing
    const availableWidth = virtualWidth - (offsetLeft * 2) - (padding * (brickCols - 1));
    const brickWidth = availableWidth / brickCols;
    const brickHeight = 15;

    bricks = [];
    for (let r = 0; r < brickRows; r++) {
        bricks[r] = [];
        for (let c = 0; c < brickCols; c++) {
            // Give different rows different neon strengths/colors
            let hp = 1;
            let color = "#8a2be2"; // Row 4-5 Violet
            if (r === 0) { color = "#ff2a5f"; hp = 3; } // Top Row Red (Strongest)
            else if (r < 3) { color = "#00f0ff"; hp = 2; } // Mid Rows Cyan

            bricks[r][c] = {
                x: offsetLeft + c * (brickWidth + padding),
                y: offsetTop + r * (brickHeight + padding),
                width: brickWidth,
                height: brickHeight,
                hp: hp,
                maxHp: hp,
                color: color,
                active: true
            };
        }
    }
}

// 4. Particle System
let particles = [];
function spawnExplosion(x, y, color) {
    for (let i = 0; i < 12; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            radius: Math.random() * 3 + 1,
            color: color,
            alpha: 1,
            decay: Math.random() * 0.03 + 0.01
        });
    }
}

// --- Gameplay Sizing Reset ---

function resetGameLayout() {
    const virtualWidth = canvas.width / window.devicePixelRatio;
    const virtualHeight = canvas.height / window.devicePixelRatio;

    paddle.x = (virtualWidth - paddle.width) / 2;
    paddle.y = virtualHeight - 40;

    ball.x = virtualWidth / 2;
    ball.y = paddle.y - 15;
    
    // Direct launch upwards with slight angle deviation
    ball.dx = (Math.random() - 0.5) * 3;
    ball.dy = -ball.baseSpeed;
}

// --- Touch & Mouse Event Handlers ---

function handleMove(clientX) {
    const rect = canvas.getBoundingClientRect();
    const virtualWidth = canvas.width / window.devicePixelRatio;
    
    // Scale client coordinate to canvas context coordinate
    const relativeX = (clientX - rect.left) * (virtualWidth / rect.width);
    
    // Fluidly center the paddle at finger/mouse spot
    paddle.x = relativeX - paddle.width / 2;

    // Boundaries
    if (paddle.x < 0) paddle.x = 0;
    if (paddle.x + paddle.width > virtualWidth) {
        paddle.x = virtualWidth - paddle.width;
    }
}

// Seamlessly tracks both desktop mouse and mobile swipe drags
window.addEventListener("mousemove", (e) => handleMove(e.clientX));
window.addEventListener("touchmove", (e) => {
    if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX);
    }
}, { passive: true });

// --- Game Logic ---

function checkCollisions() {
    const virtualWidth = canvas.width / window.devicePixelRatio;

    // Ball wall bounces
    if (ball.x - ball.radius < 0 || ball.x + ball.radius > virtualWidth) {
        ball.dx = -ball.dx;
        ball.x = ball.x < 0 ? ball.radius : virtualWidth - ball.radius;
        screenShake = 4;
    }
    if (ball.y - ball.radius < 0) {
        ball.dy = -ball.dy;
        ball.y = ball.radius;
        screenShake = 4;
    }

    // Ball drops off bottom screen
    if (ball.y + ball.radius > canvas.height / window.devicePixelRatio) {
        lives--;
        updateLivesDisplay();
        screenShake = 15;
        if (lives <= 0) {
            endGame(false);
        } else {
            resetGameLayout();
        }
    }

    // Paddle collision
    if (ball.y + ball.radius >= paddle.y && 
        ball.y - ball.radius <= paddle.y + paddle.height &&
        ball.x >= paddle.x && 
        ball.x <= paddle.x + paddle.width) {
        
        ball.dy = -ball.baseSpeed;
        
        // Calculate physics reflection angle based on where the ball hit the paddle
        const hitPoint = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
        ball.dx = hitPoint * ball.baseSpeed;
        
        screenShake = 6;
    }

    // Bricks collision
    let activeBricksLeft = false;
    for (let r = 0; r < brickRows; r++) {
        for (let c = 0; c < brickCols; c++) {
            const b = bricks[r][c];
            if (!b.active) continue;
            
            activeBricksLeft = true;

            if (ball.x + ball.radius >= b.x && 
                ball.x - ball.radius <= b.x + b.width &&
                ball.y + ball.radius >= b.y && 
                ball.y - ball.radius <= b.y + b.height) {
                
                ball.dy = -ball.dy;
                b.hp--;
                
                score += 10;
                document.getElementById("scoreVal").innerText = score.toString().padStart(4, "0");
                screenShake = 8;

                if (b.hp <= 0) {
                    b.active = false;
                    spawnExplosion(b.x + b.width / 2, b.y + b.height / 2, b.color);
                }
                return; // Bounce once per frame max
            }
        }
    }

    // Victory Check
    if (!activeBricksLeft && isPlaying) {
        endGame(true);
    }
}

function updateLivesDisplay() {
    const hearts = document.querySelectorAll(".heart-icon");
    hearts.forEach((heart, idx) => {
        if (idx >= lives) {
            heart.classList.add("lost");
        } else {
            heart.classList.remove("lost");
        }
    });
}

// --- Render Loop ---

function draw() {
    if (!isPlaying) return;
    requestAnimationFrame(draw);

    const virtualWidth = canvas.width / window.devicePixelRatio;
    const virtualHeight = canvas.height / window.devicePixelRatio;

    // Apply retro haptic Screen Shake offsets
    ctx.save();
    if (screenShake > 0) {
        const dx = (Math.random() - 0.5) * screenShake;
        const dy = (Math.random() - 0.5) * screenShake;
        ctx.translate(dx, dy);
        screenShake *= 0.9; // decay
    }

    ctx.clearRect(0, 0, virtualWidth, virtualHeight);

    // 1. Draw Bricks
    for (let r = 0; r < brickRows; r++) {
        for (let c = 0; c < brickCols; c++) {
            const b = bricks[r][c];
            if (!b.active) continue;
            
            ctx.shadowBlur = 10;
            ctx.shadowColor = b.color;
            ctx.fillStyle = b.color;
            
            // Draw damaged overlay opacity
            ctx.globalAlpha = b.hp / b.maxHp;
            ctx.fillRect(b.x, b.y, b.width, b.height);
            ctx.globalAlpha = 1.0;
        }
    }

    // 2. Draw Paddle
    ctx.shadowBlur = 15;
    ctx.shadowColor = paddle.color;
    ctx.fillStyle = paddle.color;
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);

    // 3. Draw Ball
    ctx.shadowBlur = 12;
    ctx.shadowColor = ball.color;
    ctx.fillStyle = ball.color;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    // 4. Update & Draw Particles
    ctx.shadowBlur = 0;
    particles.forEach((p, idx) => {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;
        if (p.alpha <= 0) {
            particles.splice(idx, 1);
        } else {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.alpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    });
    ctx.globalAlpha = 1.0;

    // Update positions
    ball.x += ball.dx;
    ball.y += ball.dy;

    checkCollisions();
    ctx.restore();
}

// --- Menu Controls ---

function startGame() {
    document.querySelectorAll(".overlay").forEach(o => o.classList.remove("active"));
    isPlaying = true;
    score = 0;
    lives = 3;
    document.getElementById("scoreVal").innerText = "0000";
    updateLivesDisplay();
    initBricks();
    resetGameLayout();
    draw();
}

function endGame(won) {
    isPlaying = false;
    if (won) {
        document.getElementById("victoryOverlay").classList.add("active");
    } else {
        document.getElementById("gameOverOverlay").classList.add("active");
    }
}

document.getElementById("startBtn").addEventListener("click", startGame);
document.getElementById("retryBtn").addEventListener("click", startGame);
document.getElementById("nextBtn").addEventListener("click", startGame);
