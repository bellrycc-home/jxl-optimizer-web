function timestamp() {
  return new Date().toLocaleTimeString('es-ES', { hour12: false });
}

export class LogPanel {
  constructor(container) {
    this.container = container;
    this.lines = [];
  }

  add(message, level = 'info') {
    const time = timestamp();
    this.lines.push({ time, message, level });
    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;
    const timeEl = document.createElement('span');
    timeEl.className = 'log-time';
    timeEl.textContent = `[${time}]`;
    const messageEl = document.createElement('span');
    messageEl.className = 'log-message';
    messageEl.textContent = message;
    entry.append(timeEl, messageEl);
    this.container.appendChild(entry);

    // Keep the DOM bounded for very large batches.
    if (this.lines.length > 2000) {
      this.lines.shift();
      this.container.firstElementChild?.remove();
    }

    const nearBottom =
      this.container.scrollHeight - this.container.scrollTop - this.container.clientHeight < 80;
    if (nearBottom) this.container.scrollTop = this.container.scrollHeight;
    return entry;
  }

  info(message) {
    return this.add(message, 'info');
  }

  success(message) {
    return this.add(message, 'success');
  }

  warn(message) {
    return this.add(message, 'warn');
  }

  error(message) {
    return this.add(message, 'error');
  }

  clear() {
    this.lines = [];
    this.container.replaceChildren();
  }

  asText() {
    return this.lines.map((line) => `[${line.time}] ${line.message}`).join('\n');
  }

  async copy() {
    const text = this.asText();
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } finally {
        area.remove();
      }
      return ok;
    }
  }
}
