import { useRouter } from 'next/router';
import { useEffect } from 'react';

function injectStarMapLink() {
  try {
    // Avoid injecting multiple times
    if (document.getElementById('starmapco-internal-link')) return;

    const path = window.location.pathname || '';
    const isBlogPath =
      path.startsWith('/blog') ||
      path.startsWith('/posts') ||
      // common year-based blog paths like /2024/06/...
      /^\d{4}\/\d{2}/.test(path.replace(/^\//, '')) ||
      /^\/\d{4}/.test(path);

    if (!isBlogPath) return;

    // Try common container selectors for blog content
    const container =
      document.querySelector('article') ||
      document.querySelector('main') ||
      document.querySelector('.post') ||
      document.querySelector('.blog-post') ||
      document.body;

    const wrapper = document.createElement('div');
    wrapper.id = 'starmapco-internal-link';
    wrapper.style.marginTop = '24px';
    wrapper.style.marginBottom = '24px';
    wrapper.style.padding = '8px 0';
    wrapper.style.fontSize = '1rem';

    const link = document.createElement('a');
    link.href = 'https://starmapco.com/star-map-generator';
    link.textContent = 'Create your star map →';
    link.style.color = 'inherit';
    link.style.textDecoration = 'underline';
    link.setAttribute('rel', 'noopener noreferrer');
    link.setAttribute('target', '_blank');

    wrapper.appendChild(link);
    // Place near the end of the container
    if (container) {
      container.appendChild(wrapper);
    } else {
      document.body.appendChild(wrapper);
    }
  } catch (e) {
    // Fail silently to avoid breaking the site
    // eslint-disable-next-line no-console
    console.warn('StarMap link injection failed', e);
  }
}

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();

  useEffect(() => {
    // Run once on client navigation and initial load
