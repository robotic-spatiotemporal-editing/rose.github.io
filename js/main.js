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

const year = document.querySelector('[data-current-year]');
if (year) year.textContent = new Date().getFullYear();
