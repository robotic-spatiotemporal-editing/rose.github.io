const header = document.querySelector('[data-header]');
const nav = document.querySelector('[data-nav]');
const navToggle = document.querySelector('[data-nav-toggle]');
const navLinks = [...document.querySelectorAll('.site-nav a')];

const updateHeader = () => {
  header?.classList.toggle('is-scrolled', window.scrollY > 18);
};

updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

navToggle?.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('is-open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

navLinks.forEach((link) => {
  link.addEventListener('click', () => {
    nav.classList.remove('is-open');
    navToggle?.setAttribute('aria-expanded', 'false');
  });
});

const observedSections = navLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (!visible) return;
    navLinks.forEach((link) => {
      const matches = link.getAttribute('href') === `#${visible.target.id}`;
      link.classList.toggle('is-active', matches);
    });
  }, { rootMargin: '-20% 0px -65%', threshold: [0, 0.2, 0.6] });

  observedSections.forEach((section) => observer.observe(section));
}

const copyButton = document.querySelector('[data-copy-bibtex]');
const copyStatus = document.querySelector('[data-copy-status]');

copyButton?.addEventListener('click', async () => {
  const citation = document.querySelector('#bibtex')?.textContent.trim();
  if (!citation) return;

  try {
    await navigator.clipboard.writeText(citation);
    copyButton.textContent = 'Copied';
    copyStatus.textContent = 'BibTeX copied to clipboard.';
    window.setTimeout(() => {
      copyButton.textContent = 'Copy BibTeX';
      copyStatus.textContent = '';
    }, 2200);
  } catch {
    copyStatus.textContent = 'Copy failed. Select the BibTeX text manually.';
  }
});

document.querySelectorAll('[data-unavailable]').forEach((link) => {
  link.addEventListener('click', (event) => event.preventDefault());
});

document.querySelectorAll('[data-demo-group]').forEach((group) => {
  const rail = group.querySelector('[data-demo-rail]');
  const previous = group.querySelector('[data-demo-previous]');
  const next = group.querySelector('[data-demo-next]');
  const status = group.querySelector('[data-demo-status]');
  const cards = rail ? [...rail.querySelectorAll('.demo-card')] : [];
  let currentIndex = 0;
  let scrollFrame;

  if (!rail || !cards.length) return;

  const updateControls = () => {
    if (status) status.textContent = `${String(currentIndex + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`;
    if (previous) previous.disabled = currentIndex === 0;
    if (next) next.disabled = currentIndex === cards.length - 1;
  };

  const goToDemo = (index) => {
    currentIndex = Math.max(0, Math.min(index, cards.length - 1));
    rail.scrollTo({ left: cards[currentIndex].offsetLeft - rail.offsetLeft, behavior: 'smooth' });
    updateControls();
  };

  previous?.addEventListener('click', () => goToDemo(currentIndex - 1));
  next?.addEventListener('click', () => goToDemo(currentIndex + 1));

  rail.addEventListener('scroll', () => {
    window.cancelAnimationFrame(scrollFrame);
    scrollFrame = window.requestAnimationFrame(() => {
      currentIndex = cards.reduce((closestIndex, card, index) => {
        const currentDistance = Math.abs((card.offsetLeft - rail.offsetLeft) - rail.scrollLeft);
        const closestDistance = Math.abs((cards[closestIndex].offsetLeft - rail.offsetLeft) - rail.scrollLeft);
        return currentDistance < closestDistance ? index : closestIndex;
      }, 0);
      updateControls();
    });
  }, { passive: true });

  updateControls();
});

document.querySelectorAll('.demo-media video').forEach((video) => {
  video.addEventListener('play', () => {
    document.querySelectorAll('.demo-media video').forEach((otherVideo) => {
      if (otherVideo !== video) otherVideo.pause();
    });
  });
});

const year = document.querySelector('[data-current-year]');
if (year) year.textContent = new Date().getFullYear();
