/**
 * EduPeers - High Performance Smooth Snow Effect
 * Uses sprite caching to render 800+ snowflakes at 60FPS.
 */
(function () {
  const canvas = document.createElement('canvas');
  canvas.id = 'snow-canvas';
  canvas.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: 0',
    'width: 100%',
    'height: 100%',
    'pointer-events: none',
    'z-index: 0',
    'opacity: 1.0',
  ].join(';');
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d', { alpha: true });

  const SNOWFLAKE_COUNT = 1000;
  let W = window.innerWidth;
  let H = window.innerHeight;
  canvas.width = W;
  canvas.height = H;

  // --- SPRITE CACHING ---
  // We create a few pre-rendered snowflakes of different sizes to avoid costly fillText calls
  const spriteCanvas = document.createElement('canvas');
  const sCtx = spriteCanvas.getContext('2d');
  const sizes = [6, 8, 10, 12, 14]; // Different sizes for variety
  spriteCanvas.width = 100; // Enough space for all sprites
  spriteCanvas.height = 20;

  sizes.forEach((size, i) => {
    sCtx.font = `${size}px Arial`;
    sCtx.fillStyle = '#ffffff';
    sCtx.textAlign = 'center';
    sCtx.textBaseline = 'middle';
    sCtx.fillText('❄', i * 20 + 10, 10);
  });

  window.addEventListener('resize', () => {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;
  });

  // Snowflake generator
  function makeFlake(isInitial = false) {
    const sizeIdx = Math.floor(Math.random() * sizes.length);
    return {
      x: Math.random() * W,
      y: isInitial ? Math.random() * H : -20,
      sizeIdx: sizeIdx,
      r: sizes[sizeIdx],
      speed: Math.random() * 2.0 + 2.0, // Slightly faster (2.0 - 4.0px)
      drift: (Math.random() - 0.5) * 1.2,
      alpha: Math.random() * 0.5 + 0.5,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.03, // Slower spin to match
    };
  }

  // Populating initial flakes spread across screen
  const flakes = Array.from({ length: SNOWFLAKE_COUNT }, () => makeFlake(true));

  function tick() {
    ctx.clearRect(0, 0, W, H);

    for (let i = 0; i < SNOWFLAKE_COUNT; i++) {
      const f = flakes[i];

      // Physics
      f.y += f.speed;
      f.x += f.drift + Math.sin(f.y * 0.01) * 0.4;
      f.angle += f.spin;

      // Reset
      if (f.y > H + 20) {
        flakes[i] = makeFlake(false);
        flakes[i].x = Math.random() * W;
      }
      if (f.x > W + 20) f.x = -20;
      if (f.x < -20) f.x = W + 20;

      // Rendering using pre-rendered sprite
      ctx.save();
      ctx.globalAlpha = f.alpha;
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);

      // Draw from the sprite cache (much faster than fillText)
      ctx.drawImage(
        spriteCanvas,
        f.sizeIdx * 20, 0, 20, 20, // Source (cached sprite)
        -10, -10, 20, 20           // Destination
      );

      ctx.restore();
    }

    requestAnimationFrame(tick);
  }

  tick();
})();
