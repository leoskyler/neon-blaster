const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Game State Variables
let score = 0;
let lives = 3;
let currentLevel = 1;
let isPlaying = false;

// Entities
let paddle = { x: 200, y: 550, width: 80, height: 12, speed: 8, targetWidth: 80 };
let balls = [];
let bricks = [];
let powerups = [];
let lasers = [];
let particles = [];

// Screen Shake intensity
let shakeIntensity = 0;

// Power-up States
let activePowerup = "NONE"; // NONE, WIDE, LASER
let powerupTimer = 0;
const POWERUP_DURATION = 600; // ~10 seconds at 60fps

// Color Schemes
const COLORS = {
    blue: "#00f0ff",
    pink: "#ff007f",
    green: "#39ff14",
    yellow: "#fffb00",
    purple: "#bd00ff"
};

// --- Level Design (1 = Normal, 2 = Armored, 3 = Explosive) ---
const LEVEL_DESIGNS = [
    // Level 1
    [
        [1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1]
    ],
    // Level 2
    [
        [2, 2, 2, 2, 2, 2],
        [1, 1, 1, 1, 1, 1],
        [3, 1, 1, 1, 1, 3],
        [1, 1, 1, 1, 1, 1]
    ],
    // Level 3
    [
        [2, 3, 2, 2, 3, 2],
        [2, 2, 2, 2, 2, 2],
        [1, 3, 1, 1, 3, 1],
        [1, 1, 1, 1, 1, 1],
        [3, 1, 3, 3, 1, 3]
    ]
];

// --- Input & Control Listeners ---

// Desktop Mouse
document.addEventListener("mousemove", (e) => {
    const relativeX = e.clientX - canvas.getBoundingClientRect().left;
    if (relativeX > 0 && relativeX < canvas.clientWidth) {
        // Adjust coordinate mapping from displayed CSS size back to original 480px width
        const scaleFactor = canvas.width / canvas.clientWidth;
        paddle.x = (relativeX * scaleFactor) - (paddle.width / 2);
        keepPaddleInBounds();
    }
});

// Mobile Touch / Drag
canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const relativeX = touch.clientX - canvas.getBoundingClientRect().left;
    if (relativeX > 0 && relativeX < canvas.clientWidth) {
        const scaleFactor = canvas.width / canvas.clientWidth;
        paddle.x = (relativeX * scaleFactor) - (paddle.width / 2);
        keepPaddleInBounds();
    }
}, { passive: false });

// Tap to Shoot Lasers (Mobile and Desktop Click)
canvas.addEventListener("pointerdown", () => {
    if (isPlaying && activePowerup === "LASER") {
        fireLasers();
    }
});

function keepPaddleInBounds() {
    if (paddle.x < 0) paddle.x = 0;
    if (paddle.x + paddle.width > canvas.width) paddle.x = canvas.width - paddle.width;
}

// --- Game Engine Helpers ---

function createBall(x, y, dx, dy) {
    return {
        x: x,
        y: y,
        radius: 7,
        dx: dx,
        dy: dy,
        trail: [] // Stores previous coordinates for trailing effect
    };
}

function initLevel(levelNum) {
    bricks = [];
    powerups = [];
    lasers = [];
    particles = [];
    activePowerup = "NONE";
    document.getElementById("powerupIndicator").innerText = "SYSTEM: NOMINAL";
    document.getElementById("powerupIndicator").style.color = "var(--neon-blue)";
    
    // Reset Paddle
    paddle.width = 80;
    paddle.targetWidth = 80;
    
    // Reset Balls
    balls = [createBall(canvas.width / 2, 500, (Math.random() - 0.5) * 4, -5)];

    const layout = LEVEL_DESIGNS[(levelNum - 1) % LEVEL_DESIGNS.length];
    const brickRows = layout.length;
    const brickCols = layout[0].length;
    const brickWidth = 64;
    const brickHeight = 22;
    const padding = 8;
    const offsetTop = 50;
    const offsetLeft = 24;

    for (let c = 0; c < brickCols; c++) {
        for (let r = 0; r < brickRows; r++) {
            const type = layout[r][c];
            if (type > 0) {
                const brickX = (c * (brickWidth + padding)) + offsetLeft;
                const brickY = (r * (brickHeight + padding)) + offsetTop;
                let health = type === 2 ? 2 : 1; // Armored bricks require 2 hits
                bricks.push({
                    x: brickX,
                    y: brickY,
                    w: brickWidth,
                    h: brickHeight,
                    type: type,
                    health: health,
                    active: true
                });
            }
        }
    }
}

// --- Visual Effects ---

function triggerScreenShake(amt) {
    shakeIntensity = amt;
}

function createExplosion(x, y, color) {
    for (let i = 0; i < 12; i++) {
        particles.push({
            x: x,
            y: y,
            dx: (Math.random() - 0.5) * 6,
            dy: (Math.random() - 0.5) * 6,
            radius: Math.random() * 3 + 1,
            color: color,
            alpha: 1,
            decay: Math.random() * 0.03 + 0.01
        });
    }
}

function triggerGlitchExplosion(glitchBrick) {
    triggerScreenShake(12);
    createExplosion(glitchBrick.x + glitchBrick.w / 2, glitchBrick.y + glitchBrick.h / 2, COLORS.purple);

    // Explode neighboring bricks
    const radius = 90; // Damage radius
    const bx = glitchBrick.x + glitchBrick.w / 2;
    const by = glitchBrick.y + glitchBrick.h / 2;

    bricks.forEach(b => {
        if (b.active && b !== glitchBrick) {
            const brickCX = b.x + b.w / 2;
            const brickCY = b.y + b.h / 2;
            const dist = Math.hypot(brickCX - bx, brickCY - by);

            if (dist < radius) {
                damageBrick(b, true);
            }
        }
    });
}

// --- Game Logic Updates ---

function fireLasers() {
    lasers.push({ x: paddle.x + 10, y: paddle.y - 10 });
    lasers.push({ x: paddle.x + paddle.width - 10, y: paddle.y - 10 });
}

function damageBrick(brick, immediateDestroy = false) {
    if (immediateDestroy) {
        brick.health = 0;
    } else {
        brick.health--;
    }

    if (brick.health <= 0) {
        brick.active = false;
        score += brick.type === 2 ? 200 : 100;
        document.getElementById("scoreVal").innerText = String(score).padStart(4, "0");
        
        let color = COLORS.blue;
        if (brick.type === 2) color = COLORS.pink;
        if (brick.type === 3) color = COLORS.purple;

        createExplosion(brick.x + brick.w / 2, brick.y + brick.h / 2, color);

        if (brick.type === 3) {
            triggerGlitchExplosion(brick);
        }

        // Randomly roll for power-up drop
        if (Math.random() < 0.22) {
            const rand = Math.random();
            let type = "WIDE";
            if (rand < 0.33) type = "MULTIBALL";
            else if (rand < 0.66) type = "LASER";

            powerups.push({
                x: brick.x + brick.w / 2,
                y: brick.y + brick.h,
                type: type,
                radius: 10,
                speed: 2.5
            });
        }
    } else {
        // Armored brick got hit but is still standing
        createExplosion(brick.x + brick.w / 2, brick.y + brick.h / 2, COLORS.pink);
        triggerScreenShake(3);
    }
}

function update() {
    if (!isPlaying) return;

    // Apply Screen Shake Decay
    if (shakeIntensity > 0) {
        shakeIntensity *= 0.9;
        if (shakeIntensity < 0.2) shakeIntensity = 0;
    }

    // Smooth Paddle Resize
    if (paddle.width < paddle.targetWidth) paddle.width += 2;
    if (paddle.width > paddle.targetWidth) paddle.width -= 2;

    // Handle Power-up Expirations
    if (activePowerup !== "NONE") {
        powerupTimer--;
        if (powerupTimer <= 0) {
            activePowerup = "NONE";
            paddle.targetWidth = 80;
            document.getElementById("powerupIndicator").innerText = "SYSTEM: NOMINAL";
            document.getElementById("powerupIndicator").style.color = "var(--neon-blue)";
        }
    }

    // Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.dx;
        p.y += p.dy;
        p.alpha -= p.decay;
        if (p.alpha <= 0) particles.splice(i, 1);
    }

    // Update Lasers
    for (let i = lasers.length - 1; i >= 0; i--) {
        const l = lasers[i];
        l.y -= 7;
        
        // Check laser hitting bricks
        let hit = false;
        for (let b of bricks) {
            if (b.active && l.x > b.x && l.x < b.x + b.w && l.y > b.y && l.y < b.y + b.h) {
                damageBrick(b);
                hit = true;
                break;
            }
        }

        if (hit || l.y < 0) {
            lasers.splice(i, 1);
        }
    }

    // Update Falling Powerups
    for (let i = powerups.length - 1; i >= 0; i--) {
        const pu = powerups[i];
        pu.y += pu.speed;

        // Catch powerup with Paddle
        if (pu.y + pu.radius > paddle.y && pu.y - pu.radius < paddle.y + paddle.height &&
            pu.x > paddle.x && pu.x < paddle.x + paddle.width) {
            
            triggerScreenShake(5);
            activatePowerup(pu.type);
            powerups.splice(i, 1);
            continue;
        }

        if (pu.y - pu.radius > canvas.height) {
            powerups.splice(i, 1);
        }
    }

    // Update Balls
    for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];

        // Trail Generation
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 8) b.trail.shift();

        b.x += b.dx;
        b.y += b.dy;

        // Wall collisions
        if (b.x - b.radius < 0 || b.x + b.radius > canvas.width) {
            b.dx = -b.dx;
            b.x = b.x < 240 ? b.radius : canvas.width - b.radius; // snap in limits
            triggerScreenShake(2);
        }
        if (b.y - b.radius < 0) {
            b.dy = -b.dy;
            b.y = b.radius;
            triggerScreenShake(2);
        }

        // Paddle Collision
        if (b.y + b.radius >= paddle.y && b.y - b.radius <= paddle.y + paddle.height &&
            b.x >= paddle.x && b.x <= paddle.x + paddle.width) {
            
            b.dy = -Math.abs(b.dy); // Bounce upward

            // Angular reflection depending on where the ball lands on paddle
            const hitLoc = (b.x - paddle.x) / paddle.width;
            b.dx = 10 * (hitLoc - 0.5);
            
            triggerScreenShake(4);
        }

        // Brick Collisions
        for (let bk of bricks) {
            if (bk.active) {
                const closestX = Math.max(bk.x, Math.min(b.x, bk.x + bk.w));
                const closestY = Math.max(bk.y, Math.min(b.y, bk.y + bk.h));
                const dist = Math.hypot(b.x - closestX, b.y - closestY);

                if (dist < b.radius) {
                    damageBrick(bk);
                    
                    // Bounce direction check
                    if (b.x < bk.x || b.x > bk.x + bk.w) {
                        b.dx = -b.dx;
                    } else {
                        b.dy = -b.dy;
                    }
                    break;
                }
            }
        }

        // Ball falls out of bounds
        if (b.y - b.radius > canvas.height) {
            balls.splice(i, 1);
        }
    }

    // Out of Balls Check
    if (balls.length === 0) {
        lives--;
        updateLivesDisplay();
        if (lives <= 0) {
            endGame(false);
        } else {
            // Respawn single ball
            balls.push(createBall(canvas.width / 2, 500, (Math.random() - 0.5) * 4, -5));
            triggerScreenShake(15);
        }
    }

    // Victory Check (No active bricks left)
    const activeBricks = bricks.filter(b => b.active);
    if (activeBricks.length === 0) {
        endGame(true);
    }
}

function activatePowerup(type) {
    activePowerup = type;
    powerupTimer = POWERUP_DURATION;

    const ind = document.getElementById("powerupIndicator");

    if (type === "WIDE") {
        paddle.targetWidth = 140;
        ind.innerText = "SYS: WIDE PADDLE";
        ind.style.color = "var(--neon-blue)";
    } else if (type === "MULTIBALL") {
        // Add 2 brand new balls into the grid
        balls.push(createBall(paddle.x + paddle.width / 2, paddle.y - 20, -3, -5));
        balls.push(createBall(paddle.x + paddle.width / 2, paddle.y - 20, 3, -5));
        ind.innerText = "SYS: SPLIT CORE";
        ind.style.color = "var(--neon-pink)";
    } else if (type === "LASER") {
        ind.innerText = "SYS: LASER ENABLED [TAP SCREEN]";
        ind.style.color = "var(--neon-green)";
    }
}

function updateLivesDisplay() {
    const livesString = "❤".repeat(Math.max(0, lives));
    document.getElementById("livesVal").innerText = livesString || "DEAD";
}

// --- Draw Code ---

function draw() {
    // Canvas Clear with slight overlay alpha to create speed trails on canvas
    ctx.fillStyle = "rgba(5, 5, 10, 0.35)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    
    // Apply Screen Shake transformation
    if (shakeIntensity > 0) {
        const dx = (Math.random() - 0.5) * shakeIntensity;
        const dy = (Math.random() - 0.5) * shakeIntensity;
        ctx.translate(dx, dy);
    }

    // Draw Bricks
    bricks.forEach(b => {
        if (b.active) {
            ctx.shadowBlur = b.type === 3 ? 12 : 8;
            
            if (b.type === 1) {
                ctx.fillStyle = "rgba(0, 240, 255, 0.2)";
                ctx.strokeStyle = COLORS.blue;
                ctx.shadowColor = COLORS.blue;
            } else if (b.type === 2) {
                ctx.fillStyle = b.health === 2 ? "rgba(255, 0, 127, 0.3)" : "rgba(255, 0, 127, 0.1)";
                ctx.strokeStyle = COLORS.pink;
                ctx.shadowColor = COLORS.pink;
            } else {
                ctx.fillStyle = "rgba(189, 0, 255, 0.3)";
                ctx.strokeStyle = COLORS.purple;
                ctx.shadowColor = COLORS.purple;
            }

            // Outer Brick
            ctx.lineWidth = 2;
            ctx.fillRect(b.x, b.y, b.w, b.h);
            ctx.strokeRect(b.x, b.y, b.w, b.h);
            
            // Inner Tech Details inside Bricks
            ctx.strokeStyle = "rgba(255,255,255,0.15)";
            ctx.lineWidth = 1;
            ctx.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
        }
    });

    // Draw Balls & Trails
    balls.forEach(b => {
        // Draw Trail
        b.trail.forEach((point, index) => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, b.radius * (index / b.trail.length), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 251, 0, ${0.1 * index})`;
            ctx.fill();
        });

        // Draw Core Ball
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.shadowBlur = 15;
        ctx.shadowColor = COLORS.yellow;
        ctx.fill();
    });

    // Draw Paddle
    ctx.shadowBlur = 10;
    ctx.shadowColor = activePowerup === "LASER" ? COLORS.green : COLORS.blue;
    ctx.fillStyle = "#fff";
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
    
    ctx.strokeStyle = activePowerup === "LASER" ? COLORS.green : COLORS.blue;
    ctx.lineWidth = 2;
    ctx.strokeRect(paddle.x, paddle.y, paddle.width, paddle.height);

    // Laser Cannon Turret details on Paddle
    if (activePowerup === "LASER") {
        ctx.fillStyle = COLORS.green;
        ctx.fillRect(paddle.x, paddle.y - 6, 8, 6);
        ctx.fillRect(paddle.x + paddle.width - 8, paddle.y - 6, 8, 6);
    }

    // Draw Falling Power-ups
    powerups.forEach(pu => {
        ctx.beginPath();
        ctx.arc(pu.x, pu.y, pu.radius, 0, Math.PI * 2);
        
        let color = COLORS.blue;
        if (pu.type === "MULTIBALL") color = COLORS.pink;
        if (pu.type === "LASER") color = COLORS.green;

        ctx.fillStyle = color;
        ctx.shadowBlur = 12;
        ctx.shadowColor = color;
        ctx.fill();

        // Inner glowing core
        ctx.beginPath();
        ctx.arc(pu.x, pu.y, pu.radius / 2, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
    });

    // Draw Lasers
    lasers.forEach(l => {
        ctx.fillStyle = COLORS.green;
        ctx.shadowBlur = 8;
        ctx.shadowColor = COLORS.green;
        ctx.fillRect(l.x - 2, l.y, 4, 12);
    });

    // Draw Explosion Particles
    particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 5;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.restore();
    });

    ctx.restore();
}

// --- Main Game Loop ---

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// --- Overlay Navigation Handlers ---

function startGame() {
    score = 0;
    lives = 3;
    currentLevel = 1;
    updateLivesDisplay();
    document.getElementById("scoreVal").innerText = "0000";
    
    document.getElementById("startScreen").classList.add("hidden");
    document.getElementById("gameOverScreen").classList.add("hidden");
    document.getElementById("victoryScreen").classList.add("hidden");

    initLevel(currentLevel);
    isPlaying = true;
}

function endGame(isVictory) {
    isPlaying = false;
    triggerScreenShake(0); // clear shake
    
    if (isVictory) {
        document.getElementById("victoryScoreVal").innerText = score;
        document.getElementById("victoryScreen").classList.remove("hidden");
    } else {
        document.getElementById("finalScoreVal").innerText = score;
        document.getElementById("gameOverScreen").classList.remove("hidden");
    }
}

// Buttons Event Binding
document.getElementById("startBtn").addEventListener("click", startGame);
document.getElementById("retryBtn").addEventListener("click", startGame);

document.getElementById("nextLevelBtn").addEventListener("click", () => {
    currentLevel++;
    document.getElementById("victoryScreen").classList.add("hidden");
    initLevel(currentLevel);
    isPlaying = true;
});

// Run graphics update loop in background
loop();

