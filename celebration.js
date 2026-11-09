/**
 * EduPeers - Celebration Effect (Fireworks/Crackers)
 */
(function () {
  const trigger = localStorage.getItem('edupeers_show_celebration');
  if (trigger !== 'true') return;

  console.log("Celebration triggered!");

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.id = 'celebration-canvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let W = window.innerWidth;
  let H = window.innerHeight;
  canvas.width = W;
  canvas.height = H;

  window.addEventListener('resize', () => {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;
  });

  class Particle {
    constructor(x, y, color) {
      this.x = x;
      this.y = y;
      this.color = color;
      this.angle = Math.random() * Math.PI * 2;
      this.velocity = Math.random() * 10 + 4; // Bolder velocity
      this.friction = 0.96;
      this.gravity = 0.2;
      this.opacity = 1;
      this.size = Math.random() * 4 + 1.5;
    }

    update() {
      this.velocity *= this.friction;
      this.x += Math.cos(this.angle) * this.velocity;
      this.y += Math.sin(this.angle) * this.velocity + this.gravity;
      this.opacity -= 0.012; // Slower fade
    }

    draw() {
      ctx.globalAlpha = this.opacity;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      
      // Add a little glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = this.color;
    }
  }

  let particles = [];
  const colors = ['#00f0ff', '#7000ff', '#ff3366', '#ffcc00', '#00ff88', '#ffffff'];

  function createExplosion(x, y) {
    const color = colors[Math.floor(Math.random() * colors.length)];
    const count = 80; // More particles
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color));
    }
  }

  let active = true;

  function animate() {
    if (!active && particles.length === 0) {
        ctx.clearRect(0, 0, W, H);
        return;
    }

    ctx.clearRect(0, 0, W, H);
    
    // Smooth particle update
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        if (p.opacity <= 0) {
            particles.splice(i, 1);
        } else {
            p.draw();
        }
    }

    requestAnimationFrame(animate);
  }

  // Start the loop
  animate();

  // Initial heavy bursts
  createExplosion(W * 0.5, H * 0.5);
  setTimeout(() => createExplosion(W * 0.2, H * 0.3), 300);
  setTimeout(() => createExplosion(W * 0.8, H * 0.3), 600);
  setTimeout(() => createExplosion(W * 0.3, H * 0.6), 1000);
  setTimeout(() => createExplosion(W * 0.7, H * 0.6), 1400);
  
  // Continuous small bursts for 3 seconds
  const crackerInterval = setInterval(() => {
    createExplosion(Math.random() * W, Math.random() * H);
  }, 400);

  // Stop spawning and clear flag after 3 seconds
  setTimeout(() => {
    clearInterval(crackerInterval);
    active = false;
    localStorage.removeItem('edupeers_show_celebration');
    console.log("Celebration cleanup started");
    
    // Smoothly remove canvas
    canvas.style.transition = 'opacity 1.5s ease';
    canvas.style.opacity = '0';
    setTimeout(() => canvas.remove(), 1500);
  }, 3500);

})();
