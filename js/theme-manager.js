const themeManager = {
  currentTheme: 'auto',
  
  init() {
    this.loadTheme();
    this.setupListeners();
  },

  loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'auto';
    this.setTheme(savedTheme);
  },

  setTheme(theme) {
    this.currentTheme = theme;
    localStorage.setItem('theme', theme);

    const root = document.documentElement;

    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
    }

    this.updateToggleButton();
  },

  toggleTheme() {
    const themes = ['light', 'auto', 'dark'];
    const currentIndex = themes.indexOf(this.currentTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    this.setTheme(themes[nextIndex]);
  },

  updateToggleButton() {
    const button = document.getElementById('theme-toggle');
    if (!button) return;

    const icons = {
      light: '☀️',
      dark: '🌙',
      auto: '🌓'
    };

    const labels = {
      light: 'Light Mode',
      dark: 'Dark Mode',
      auto: 'Auto Mode'
    };

    button.innerHTML = `
      <span style="font-size: 1.25rem;">${icons[this.currentTheme]}</span>
      <span class="hide-mobile" style="margin-left: var(--space-2);">${labels[this.currentTheme]}</span>
    `;
    button.setAttribute('aria-label', labels[this.currentTheme]);
    button.setAttribute('title', labels[this.currentTheme]);
  },

  setupListeners() {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (this.currentTheme === 'auto') {
        this.setTheme('auto');
      }
    });
  },

  createToggleButton() {
    const button = document.createElement('button');
    button.id = 'theme-toggle';
    button.className = 'btn btn-secondary';
    button.style.cssText = `
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      background: var(--bg-tertiary);
      border: 1px solid var(--border-primary);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all var(--transition-base);
    `;
    button.onclick = () => this.toggleTheme();
    
    this.updateToggleButton();
    return button;
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    themeManager.init();
  });
}
