const loadingManager = {
  activeLoaders: new Set(),

  showLoading(container, options = {}) {
    const {
      message = 'Loading...',
      type = 'spinner',
      overlay = false,
      size = 'medium'
    } = options;

    const loaderId = 'loader-' + Date.now();
    this.activeLoaders.add(loaderId);

    const sizeClasses = {
      small: '20px',
      medium: '40px',
      large: '60px'
    };

    const loaderSize = sizeClasses[size] || sizeClasses.medium;

    let loaderHTML = '';

    if (type === 'spinner') {
      loaderHTML = `
        <div class="loading-spinner" style="
          width: ${loaderSize};
          height: ${loaderSize};
          border: 3px solid var(--border-primary);
          border-top-color: var(--color-primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        "></div>
      `;
    } else if (type === 'dots') {
      loaderHTML = `
        <div class="loading-dots" style="display: flex; gap: 0.5rem;">
          <div style="width: 12px; height: 12px; background: var(--color-primary); border-radius: 50%; animation: bounce 1.4s infinite ease-in-out both; animation-delay: -0.32s;"></div>
          <div style="width: 12px; height: 12px; background: var(--color-primary); border-radius: 50%; animation: bounce 1.4s infinite ease-in-out both; animation-delay: -0.16s;"></div>
          <div style="width: 12px; height: 12px; background: var(--color-primary); border-radius: 50%; animation: bounce 1.4s infinite ease-in-out both;"></div>
        </div>
      `;
    } else if (type === 'skeleton') {
      loaderHTML = `
        <div class="skeleton-loader" style="width: 100%; display: flex; flex-direction: column; gap: var(--space-3);">
          <div class="skeleton-line" style="height: 20px; background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-secondary) 50%, var(--bg-tertiary) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: var(--radius-md);"></div>
          <div class="skeleton-line" style="height: 20px; width: 80%; background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-secondary) 50%, var(--bg-tertiary) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: var(--radius-md);"></div>
          <div class="skeleton-line" style="height: 20px; width: 60%; background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-secondary) 50%, var(--bg-tertiary) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: var(--radius-md);"></div>
        </div>
      `;
    } else if (type === 'progress') {
      loaderHTML = `
        <div class="loading-progress" style="width: 100%; max-width: 300px;">
          <div style="height: 8px; background: var(--bg-tertiary); border-radius: var(--radius-full); overflow: hidden;">
            <div class="progress-bar" style="height: 100%; background: var(--color-primary); width: 0%; animation: progress 2s ease-in-out infinite; border-radius: var(--radius-full);"></div>
          </div>
        </div>
      `;
    }

    const loaderElement = document.createElement('div');
    loaderElement.id = loaderId;
    loaderElement.className = 'loading-container';
    loaderElement.setAttribute('role', 'status');
    loaderElement.setAttribute('aria-live', 'polite');
    loaderElement.setAttribute('aria-label', message);

    loaderElement.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-4);
      padding: var(--space-8);
      ${overlay ? `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--bg-overlay);
        z-index: 100;
        backdrop-filter: blur(4px);
      ` : ''}
    `;

    loaderElement.innerHTML = `
      ${loaderHTML}
      ${message ? `<p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin: 0;">${message}</p>` : ''}
      <span class="sr-only">${message}</span>
    `;

    if (container) {
      if (overlay) {
        container.style.position = 'relative';
      }
      container.appendChild(loaderElement);
    }

    return loaderId;
  },

  hideLoading(loaderId) {
    const loader = document.getElementById(loaderId);
    if (loader) {
      loader.style.opacity = '0';
      loader.style.transition = 'opacity 0.3s';
      setTimeout(() => {
        loader.remove();
        this.activeLoaders.delete(loaderId);
      }, 300);
    }
  },

  showPageLoader() {
    const loader = document.createElement('div');
    loader.id = 'page-loader';
    loader.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--bg-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: fadeIn 0.3s;
    `;

    loader.innerHTML = `
      <div style="text-align: center;">
        <div style="
          width: 60px;
          height: 60px;
          border: 4px solid var(--border-primary);
          border-top-color: var(--color-primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto var(--space-4);
        "></div>
        <p style="color: var(--text-secondary); font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold);">
          Loading TBD Academy Portal...
        </p>
      </div>
    `;

    document.body.appendChild(loader);
  },

  hidePageLoader() {
    const loader = document.getElementById('page-loader');
    if (loader) {
      loader.style.opacity = '0';
      loader.style.transition = 'opacity 0.3s';
      setTimeout(() => loader.remove(), 300);
    }
  },

  showSkeletonTable(container, rows = 5, columns = 4) {
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton-table';
    skeleton.style.cssText = 'width: 100%; animation: fadeIn 0.3s;';

    let html = '<div style="display: flex; flex-direction: column; gap: var(--space-3);">';
    
    for (let i = 0; i < rows; i++) {
      html += '<div style="display: grid; grid-template-columns: repeat(' + columns + ', 1fr); gap: var(--space-3);">';
      for (let j = 0; j < columns; j++) {
        const width = Math.random() * 30 + 60;
        html += `
          <div class="skeleton-line" style="
            height: 16px;
            width: ${width}%;
            background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-secondary) 50%, var(--bg-tertiary) 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
            border-radius: var(--radius-md);
          "></div>
        `;
      }
      html += '</div>';
    }
    html += '</div>';

    skeleton.innerHTML = html;
    container.innerHTML = '';
    container.appendChild(skeleton);
  },

  showSkeletonCards(container, count = 3) {
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton-cards';
    skeleton.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: var(--space-4); animation: fadeIn 0.3s;';

    let html = '';
    for (let i = 0; i < count; i++) {
      html += `
        <div style="padding: var(--space-6); background: var(--bg-secondary); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
          <div class="skeleton-line" style="height: 24px; width: 60%; background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-primary) 50%, var(--bg-tertiary) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: var(--radius-md); margin-bottom: var(--space-4);"></div>
          <div class="skeleton-line" style="height: 16px; width: 100%; background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-primary) 50%, var(--bg-tertiary) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: var(--radius-md); margin-bottom: var(--space-2);"></div>
          <div class="skeleton-line" style="height: 16px; width: 80%; background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-primary) 50%, var(--bg-tertiary) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: var(--radius-md);"></div>
        </div>
      `;
    }

    skeleton.innerHTML = html;
    container.innerHTML = '';
    container.appendChild(skeleton);
  },

  addLoadingStyles() {
    if (document.getElementById('loading-styles')) return;

    const style = document.createElement('style');
    style.id = 'loading-styles';
    style.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      @keyframes bounce {
        0%, 80%, 100% { transform: scale(0); }
        40% { transform: scale(1); }
      }

      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }

      @keyframes progress {
        0% { width: 0%; }
        50% { width: 70%; }
        100% { width: 100%; }
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .loading-pulse {
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }
    `;
    document.head.appendChild(style);
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    loadingManager.addLoadingStyles();
  });
}
