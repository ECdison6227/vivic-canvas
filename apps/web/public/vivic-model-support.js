/* Account-scoped DeepSeek connection, shared by the source build and the current deployed UI. */
(() => {
  'use strict';
  if (window.__vivicDeepseekSettings) return;
  window.__vivicDeepseekSettings = true;
  const mounted = new WeakSet();
  const request = async (path, data, signal, accountId) => {
    const response = await fetch(path, { method: data ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal,
      headers: data ? { 'Content-Type': 'application/json', ...(accountId ? { 'X-Vivic-Account': accountId } : {}) } : {}, ...(data ? { body: JSON.stringify(data) } : {}) });
    const result = await response.json();
    if (!response.ok) throw Error('连接暂未完成，请稍后重试');
    return result;
  };
  function mount(anchor) {
    const original = anchor.closest('form');
    if (!original || mounted.has(original) || original.parentElement?.querySelector('[data-vivic-deepseek-settings]')) return;
    mounted.add(original);
    const form = document.createElement('form'); form.className = 'se-key-block'; form.dataset.vivicDeepseekSettings = 'true';
    form.setAttribute('aria-label', 'DeepSeek 连接');
    const heading = document.createElement('div'); heading.className = 'se-row se-connection-heading';
    const brand = document.createElement('a'); brand.href = 'https://platform.deepseek.com/'; brand.target = '_blank'; brand.rel = 'noopener noreferrer';
    brand.className = 'se-stepfun-brand'; brand.textContent = 'DeepSeek'; brand.style.cssText = 'color:inherit;text-decoration:none'; brand.setAttribute('aria-label', '打开 DeepSeek 官网');
    const badge = document.createElement('span'); badge.className = 'se-connection-state'; badge.dataset.vivicDeepseekBadge = 'true'; badge.textContent = '未连接';
    heading.append(brand, badge);
    const row = document.createElement('div'); row.className = 'se-provider-key';
    const input = document.createElement('input'); input.type = 'password'; input.autocomplete = 'off'; input.spellcheck = false; input.maxLength = 512;
    input.placeholder = '输入 DeepSeek API Key'; input.setAttribute('aria-label', 'DeepSeek API Key'); input.dataset.vivicDeepseekKeyInput = 'true'; input.dataset.vivicInput = 'true';
    input.className = anchor.className;
    const button = document.createElement('button'); button.type = 'submit'; button.textContent = '连接'; button.disabled = true;
    button.dataset.vivicDeepseekConnect = 'true'; button.dataset.vivicButton = 'default'; button.dataset.vivicButtonSize = 'default';
    button.className = original.querySelector('button[type=submit]')?.className || '';
    const disconnect = document.createElement('button'); disconnect.type = 'button'; disconnect.textContent = '断开'; disconnect.hidden = true;
    disconnect.dataset.vivicDeepseekDisconnect = 'true'; disconnect.className = button.className; disconnect.style.cssText = 'background:transparent;color:var(--text-secondary);padding:4px 10px;height:auto;min-height:32px';
    row.append(input, button); heading.append(disconnect);
    const hint = document.createElement('p'); hint.textContent = '优先使用 StepFun，不可用时自动使用 DeepSeek。'; hint.style.cssText = 'margin:8px 0 0;font-size:12px;line-height:1.5;color:var(--text-secondary)';
    const message = document.createElement('p'); message.setAttribute('role', 'status'); message.style.cssText = hint.style.cssText; message.hidden = true;
    form.append(heading, row, hint, message); original.after(form);
    let busy = false, connected = false, accountId = null;
    const update = value => {
      connected = value; badge.dataset.connected = String(value); badge.textContent = value ? '已连接' : '未连接';
      disconnect.hidden = !value; button.textContent = value ? '更新' : '连接';
    };
    input.addEventListener('input', () => { button.disabled = busy || !accountId || input.value.trim().length < 8; });
    const controller = new AbortController();
    request('/api/providers/status', null, controller.signal).then(value => { if (form.isConnected) update(value.deepseek?.connected === true); }).catch(() => {});
    request('/api/space/session', null, controller.signal).then(value => { if (form.isConnected && value.authenticated) { accountId = value.user.id; button.disabled = busy || input.value.trim().length < 8; } }).catch(() => {});
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy || !accountId || input.value.trim().length < 8) return;
      busy = true; button.disabled = true; input.disabled = true; message.hidden = true; button.textContent = '正在验证…';
      const key = input.value.trim(); input.value = '';
      try {
        const result = await request('/api/credentials/deepseek/validate', { apiKey: key }, undefined, accountId);
        if (!form.isConnected) return;
        update(result.connected === true);
        message.textContent = result.connected ? 'DeepSeek 已连接。' : String(result.error || '连接未完成，请检查 Key。').replaceAll(key, '[已隐藏]');
        message.hidden = false;
      } catch { if (form.isConnected) { message.textContent = '连接暂未完成，请检查网络或稍后重试。'; message.hidden = false; } }
      finally { busy = false; input.disabled = false; button.disabled = true; button.textContent = connected ? '更新' : '连接'; }
    });
    disconnect.addEventListener('click', async () => {
      if (busy) return; busy = true; disconnect.disabled = true;
      try { await request('/api/credentials/deepseek/disconnect', {}, undefined, accountId); update(false); input.value = ''; message.hidden = true; }
      catch { message.textContent = '暂时无法断开，请稍后重试。'; message.hidden = false; }
      finally { busy = false; disconnect.disabled = false; }
    });
  }
  let scheduled = false;
  const scan = () => { scheduled = false; document.querySelectorAll('[data-vivic-ai-key-input],input[aria-label="StepFun API Key"]').forEach(mount); };
  new MutationObserver(() => { if (!scheduled) { scheduled = true; queueMicrotask(scan); } }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan, { once: true }); else scan();
})();
