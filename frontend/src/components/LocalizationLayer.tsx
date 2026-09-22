import React, { useEffect } from 'react';
import { usePreferences } from '../context/PreferencesContext';
import { translateText } from '../i18n/translations';

const attributes = ['placeholder', 'title', 'aria-label'];

function localizeNode(node: Text, language: 'en' | 'bn') {
  const original = node.nodeValue || '';
  const leading = original.match(/^\s*/)?.[0] || '';
  const trailing = original.match(/\s*$/)?.[0] || '';
  const translated = translateText(original.trim(), language)
    .replace(/\bBDT\b/g, '৳')
    .replace(/টাকা/g, '৳')
    .replace(/([+-]?)৳\s*(-?[\d,]+(?:\.\d+)?)/g, (_match, sign: string, value: string) => `${sign}৳ ${Number(value.replace(/,/g, '')).toFixed(2)}`);
  if (translated !== original.trim()) node.nodeValue = `${leading}${translated}${trailing}`;
}

/**
 * React commonly renders a currency prefix and a dynamic number as adjacent
 * text nodes. Format that pair in the presentation layer so legacy modules
 * consistently show the compact taka symbol and a decimal amount without
 * touching the numeric values stored in MongoDB.
 */
function formatAdjacentTakaValue(node: Text) {
  const prefix = node.nodeValue || '';
  if (!/^\s*[+-]?৳\s*$/.test(prefix)) return;
  const next = node.nextSibling;
  if (next?.nodeType !== Node.TEXT_NODE) return;
  const rawValue = next.nodeValue || '';
  const numeric = rawValue.trim().replace(/,/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(numeric)) return;
  const formatted = Number(numeric).toFixed(2);
  const sign = prefix.match(/[+-]/)?.[0] || '';
  const normalizedPrefix = `${prefix.match(/^\s*/)?.[0] || ''}${sign}৳ `;
  if (node.nodeValue !== normalizedPrefix) node.nodeValue = normalizedPrefix;
  if (rawValue.trim() !== formatted) next.nodeValue = rawValue.replace(rawValue.trim(), formatted);
}

/**
 * Covers established module markup during the key-by-key i18n migration,
 * including static labels rendered by shared legacy components.
 */
export const LocalizationLayer: React.FC = () => {
  const { language } = usePreferences();

  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    const localize = () => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      nodes.forEach((node) => {
        const tag = node.parentElement?.tagName || '';
        // Translate static controls and labels only. Dynamic content (member
        // names, descriptions, account labels and audit records) remains
        // authoritative user data and must never be translated.
        if (!['SCRIPT', 'STYLE'].includes(tag) && !node.parentElement?.closest('[data-localization-skip]')) localizeNode(node, language);
      });
      nodes.forEach(formatAdjacentTakaValue);
      root.querySelectorAll<HTMLElement>('*').forEach((element) => attributes.forEach((attribute) => {
        if (!element.closest('[data-localization-skip]')) {
          const value = element.getAttribute(attribute);
          if (value) element.setAttribute(attribute, translateText(value, language).replace(/\bBDT\b/g, '৳').replace(/টাকা/g, '৳'));
        }
      }));
    };
    localize();
    const observer = new MutationObserver(localize);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [language]);

  return null;
};
