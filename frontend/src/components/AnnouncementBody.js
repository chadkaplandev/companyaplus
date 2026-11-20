import React, { useEffect, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import { escapeHtml, fetchFileBlobUrl } from '../helpers';

// links inside announcements open in a new tab
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

const looksLikeHtml = (text) => /^\s*<(p|h[1-6]|ul|ol|blockquote|div|img|hr)[\s>/]/i.test(text);

// old announcements are plain text, so I wrap those into paragraphs. new ones are already HTML.
// DOMPurify strips anything unsafe before it ever reaches the page
export const bodyToHtml = (body) => {
  const text = body || '';
  if (looksLikeHtml(text)) return DOMPurify.sanitize(text);
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
};

export default function AnnouncementBody({ body, token }) {
  const ref = useRef(null);
  const html = useMemo(() => bodyToHtml(body), [body]);

  // pictures need the login token, so I download each one and swap in a temporary local link
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    let cancelled = false;
    const urls = [];
    root.querySelectorAll('img[data-image-id]').forEach((img) => {
      fetchFileBlobUrl(img.getAttribute('data-image-id'), token)
        .then((u) => {
          if (cancelled) URL.revokeObjectURL(u);
          else { urls.push(u); img.src = u; }
        })
        .catch(() => { img.alt = "This image couldn't be loaded"; });
    });
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [html, token]);

  const openImage = (e) => {
    if (e.target.tagName === 'IMG' && e.target.src) window.open(e.target.src, '_blank', 'noopener');
  };

  return <div ref={ref} onClick={openImage} className="rich-content rich-view" dangerouslySetInnerHTML={{ __html: html }} />;
}