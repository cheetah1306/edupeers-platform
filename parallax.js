/**
 * EduPeers Parallax Engine v2.0
 * Additive-only motion layer for scroll, mouse, and touch swipe.
 * Uses the individual transform properties so hover/click transforms keep working.
 */
(() => {
  'use strict';

  const CONFIG = {
    revealThreshold: 0.12,
    smoothFactor: 0.08,
    swipeResponse: 0.22,
    swipeClamp: 54,
    pointerCardRangeX: 12,
    pointerCardRangeY: 10,
    orbPointerRange: 20,
    orbScrollMultiplier: 0.85,
    mobileScrollMultiplier: 0.55,
    particleCountDesktop: 22,
    particleCountMobile: 10
  };

  const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  let isMobile = window.innerWidth <= 768;
  let animationFrame = 0;
  let revealObserver = null;

  const state = {
    scrollCurrent: window.pageYOffset || document.documentElement.scrollTop || 0,
    scrollTarget: window.pageYOffset || document.documentElement.scrollTop || 0,
    pointerXCurrent: 0,
    pointerYCurrent: 0,
    pointerXTarget: 0,
    pointerYTarget: 0,
    swipeXCurrent: 0,
    swipeYCurrent: 0,
    swipeXTarget: 0,
    swipeYTarget: 0
  };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const lerp = (start, end, factor) => start + (end - start) * factor;

  const setTranslate = (element, x, y) => {
    element.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
  };

  const observeRevealTargets = (targets) => {
    if (!revealObserver) {
      if (!('IntersectionObserver' in window)) {
        targets.forEach((target) => target.classList.add('parallax-visible'));
        return;
      }

      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('parallax-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      }, {
        threshold: CONFIG.revealThreshold,
        rootMargin: '0px 0px -60px 0px'
      });
    }

    targets.forEach((target) => {
      if (!target.dataset.parallaxObserved) {
        target.dataset.parallaxObserved = 'true';
        revealObserver.observe(target);
      }
    });
  };

  const initParallaxLayers = () => {
    const orbs = document.querySelectorAll('.bg-orbs .orb');
    orbs.forEach((orb, index) => {
      orb.setAttribute('data-parallax-depth', (0.026 + index * 0.014).toFixed(3));
    });

    const layerTargets = document.querySelectorAll(
      'nav, .welcome-banner, .glass-panel.game-card, .feature-link-card, ' +
      '.connect-hero, .connect-grid, .directory-shell, .sidebar-card, ' +
      '.glass-panel.connect-shell, .connect-summary-card, .resource-card'
    );

    layerTargets.forEach((target, index) => {
      if (!target.classList.contains('parallax-layer')) {
        target.classList.add('parallax-layer');
      }

      if (!target.hasAttribute('data-parallax-depth')) {
        const depth = target.matches('nav, .welcome-banner')
          ? 0.018
          : 0.028 + (index % 4) * 0.01;
        target.setAttribute('data-parallax-depth', depth.toFixed(3));
      }
    });

    const revealTargets = document.querySelectorAll(
      '.welcome-banner, .game-card, .feature-link-card, .connect-hero-copy, ' +
      '.connect-hero-summary, .sidebar-card, .directory-shell, .resource-card, ' +
      '.connect-summary-card'
    );

    revealTargets.forEach((target, index) => {
      if (!target.classList.contains('parallax-reveal')) {
        target.classList.add('parallax-reveal');
      }
      target.style.setProperty('--reveal-delay', `${(index % 6) * 0.07}s`);
    });

    observeRevealTargets(Array.from(revealTargets));
  };

  const shouldKeepAnimating = () => {
    return (
      Math.abs(state.scrollCurrent - state.scrollTarget) > 0.5 ||
      Math.abs(state.pointerXCurrent - state.pointerXTarget) > 0.05 ||
      Math.abs(state.pointerYCurrent - state.pointerYTarget) > 0.05 ||
      Math.abs(state.swipeXCurrent - state.swipeXTarget) > 0.5 ||
      Math.abs(state.swipeYCurrent - state.swipeYTarget) > 0.5
    );
  };

  const renderParallax = () => {
    state.scrollCurrent = lerp(state.scrollCurrent, state.scrollTarget, CONFIG.smoothFactor);
    state.pointerXCurrent = lerp(state.pointerXCurrent, state.pointerXTarget, 0.12);
    state.pointerYCurrent = lerp(state.pointerYCurrent, state.pointerYTarget, 0.12);
    state.swipeXCurrent = lerp(state.swipeXCurrent, state.swipeXTarget, CONFIG.swipeResponse);
    state.swipeYCurrent = lerp(state.swipeYCurrent, state.swipeYTarget, CONFIG.swipeResponse);

    document.querySelectorAll('[data-parallax-depth]').forEach((layer, index) => {
      const depth = Number.parseFloat(layer.getAttribute('data-parallax-depth') || '0');
      if (!depth) return;

      if (layer.classList.contains('orb')) {
        const pointerX = state.pointerXCurrent * (CONFIG.orbPointerRange + index * 4) * depth * 10;
        const pointerY = state.pointerYCurrent * (CONFIG.orbPointerRange + index * 3) * depth * 8;
        const swipeX = state.swipeXCurrent * depth * 0.18;
        const swipeY = state.swipeYCurrent * depth * 0.24;
        const scrollOffset = state.scrollCurrent * depth * CONFIG.orbScrollMultiplier * 0.2;

        setTranslate(layer, pointerX + swipeX, pointerY + swipeY + scrollOffset);
        layer.style.rotate = `${(state.pointerXCurrent * 2.2) + (state.scrollCurrent * depth * 0.012)}deg`;
      } else {
        const scrollOffset = -state.scrollCurrent * depth * (isMobile ? CONFIG.mobileScrollMultiplier : 1);
        const pointerX = state.pointerXCurrent * CONFIG.pointerCardRangeX * depth;
        const pointerY = state.pointerYCurrent * CONFIG.pointerCardRangeY * depth;
        const swipeX = state.swipeXCurrent * depth * 0.06;
        const swipeY = state.swipeYCurrent * depth * 0.09;

        setTranslate(layer, pointerX + swipeX, scrollOffset + pointerY + swipeY);
      }
    });

    if (shouldKeepAnimating()) {
      animationFrame = window.requestAnimationFrame(renderParallax);
    } else {
      animationFrame = 0;
    }
  };

  const requestRender = () => {
    if (!animationFrame) {
      animationFrame = window.requestAnimationFrame(renderParallax);
    }
  };

  const initScrollTracking = () => {
    window.addEventListener('scroll', () => {
      state.scrollTarget = window.pageYOffset || document.documentElement.scrollTop || 0;
      requestRender();
    }, { passive: true });
  };

  const initMouseParallax = () => {
    if (isMobile || reduceMotionQuery.matches) return;

    document.addEventListener('mousemove', (event) => {
      state.pointerXTarget = (event.clientX / window.innerWidth - 0.5) * 2;
      state.pointerYTarget = (event.clientY / window.innerHeight - 0.5) * 2;

      document.documentElement.style.setProperty('--mouse-x', state.pointerXTarget.toFixed(3));
      document.documentElement.style.setProperty('--mouse-y', state.pointerYTarget.toFixed(3));
      requestRender();
    }, { passive: true });

    document.addEventListener('mouseleave', () => {
      state.pointerXTarget = 0;
      state.pointerYTarget = 0;
      requestRender();
    }, { passive: true });
  };

  const initTouchParallax = () => {
    if (reduceMotionQuery.matches) return;

    let touchStartX = 0;
    let touchStartY = 0;

    document.addEventListener('touchstart', (event) => {
      if (!event.touches[0]) return;
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchmove', (event) => {
      if (!event.touches[0]) return;

      const touch = event.touches[0];
      const deltaX = clamp(touch.clientX - touchStartX, -CONFIG.swipeClamp, CONFIG.swipeClamp);
      const deltaY = clamp(touch.clientY - touchStartY, -CONFIG.swipeClamp, CONFIG.swipeClamp);

      state.pointerXTarget = (touch.clientX / window.innerWidth - 0.5) * 2;
      state.pointerYTarget = (touch.clientY / window.innerHeight - 0.5) * 2;
      state.swipeXTarget = deltaX;
      state.swipeYTarget = deltaY;
      requestRender();
    }, { passive: true });

    document.addEventListener('touchend', () => {
      state.pointerXTarget = 0;
      state.pointerYTarget = 0;
      state.swipeXTarget = 0;
      state.swipeYTarget = 0;
      requestRender();
    }, { passive: true });
  };

  const initScrollProgress = () => {
    let bar = document.querySelector('.parallax-scroll-progress');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'parallax-scroll-progress';
      document.body.appendChild(bar);
    }

    const updateProgress = () => {
      const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = documentHeight > 0
        ? ((window.pageYOffset || 0) / documentHeight) * 100
        : 0;
      bar.style.width = `${progress}%`;
    };

    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
  };

  const initDepthParticles = () => {
    if (reduceMotionQuery.matches || document.querySelector('.parallax-depth-canvas')) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'parallax-depth-canvas';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const particles = [];
    const particleCount = isMobile ? CONFIG.particleCountMobile : CONFIG.particleCountDesktop;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const seedParticles = () => {
      particles.length = 0;
      for (let index = 0; index < particleCount; index += 1) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          radius: Math.random() * 1.7 + 0.6,
          speedX: (Math.random() - 0.5) * 0.22,
          speedY: (Math.random() - 0.5) * 0.14,
          depth: Math.random() * 0.5 + 0.45,
          opacity: Math.random() * 0.22 + 0.08,
          hue: Math.random() * 48 + 188
        });
      }
    };

    const draw = () => {
      if (document.hidden) {
        window.requestAnimationFrame(draw);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scrollFactor = (window.pageYOffset || 0) * 0.0008;

      particles.forEach((particle) => {
        particle.x += particle.speedX;
        particle.y += particle.speedY;

        if (particle.x < -8) particle.x = canvas.width + 8;
        if (particle.x > canvas.width + 8) particle.x = -8;
        if (particle.y < -8) particle.y = canvas.height + 8;
        if (particle.y > canvas.height + 8) particle.y = -8;

        const driftY = particle.y - (window.pageYOffset || 0) * particle.depth * 0.04;
        const drawY = ((driftY % canvas.height) + canvas.height) % canvas.height;
        const hue = particle.hue + scrollFactor * 40;

        ctx.beginPath();
        ctx.arc(particle.x, drawY, particle.radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 80%, 72%, ${particle.opacity})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(particle.x, drawY, particle.radius * 2.6, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 80%, 72%, ${particle.opacity * 0.16})`;
        ctx.fill();
      });

      window.requestAnimationFrame(draw);
    };

    resize();
    seedParticles();
    window.addEventListener('resize', () => {
      resize();
      seedParticles();
    });
    draw();
  };

  const initDynamicRevealSync = () => {
    if (!('MutationObserver' in window)) return;

    const observer = new MutationObserver((mutations) => {
      const newRevealTargets = [];

      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;

          if (node.matches('.resource-card, .connect-summary-card, .sidebar-card')) {
            node.classList.add('parallax-reveal');
            node.style.setProperty('--reveal-delay', '0s');
            newRevealTargets.push(node);
          }

          node.querySelectorAll('.resource-card, .connect-summary-card, .sidebar-card').forEach((child) => {
            child.classList.add('parallax-reveal');
            child.style.setProperty('--reveal-delay', '0s');
            newRevealTargets.push(child);
          });
        });
      });

      if (newRevealTargets.length > 0) {
        observeRevealTargets(newRevealTargets);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  };

  const handleResize = () => {
    isMobile = window.innerWidth <= 768;
    requestRender();
  };

  const init = () => {
    if (!document.body || document.body.dataset.parallaxReady === 'true') return;
    document.body.dataset.parallaxReady = 'true';

    initParallaxLayers();
    initScrollTracking();
    initScrollProgress();
    initMouseParallax();
    initTouchParallax();
    initDepthParticles();
    initDynamicRevealSync();

    window.addEventListener('resize', handleResize, { passive: true });

    state.scrollTarget = window.pageYOffset || document.documentElement.scrollTop || 0;
    requestRender();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
