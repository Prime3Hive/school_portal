/**
 * Environment Variables Loader
 *
 * LOCAL (dev):  fetches `.env` file via HTTP (served by `python -m http.server`)
 * PRODUCTION:   fetches `/api/config` (Vercel serverless function) which reads
 *               real process.env variables — the .env file is never deployed.
 *
 * All values are placed on window.ENV so other scripts can read them via
 * AppConfig's lazy getters.
 */

class EnvLoader {
  constructor() {
    this.variables = {};
    this.loaded = false;
  }

  /**
   * Detect whether we are running on Vercel (production) or locally.
   * Vercel sets the hostname to the deployment URL; localhost is dev.
   */
  _isProduction() {
    const host = window.location.hostname;
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '';
  }

  /**
   * Load environment variables — from /api/config in prod, from .env locally.
   */
  async load() {
    if (this.loaded) return this.variables;

    if (this._isProduction()) {
      await this._loadFromApi();
    } else {
      await this._loadFromFile();
    }

    // Make variables available globally
    window.ENV = this.variables;
    return this.variables;
  }

  /**
   * Production: fetch from the Vercel API route /api/config
   */
  async _loadFromApi() {
    try {
      const response = await fetch('/api/config');
      if (!response.ok) throw new Error(`/api/config responded with ${response.status}`);
      const data = await response.json();
      this.variables = data;
      this.loaded = true;
    } catch (error) {
      console.warn('⚠️ Could not load config from /api/config:', error.message);
      this.setDefaults();
    }
  }

  /**
   * Development: fetch the local .env file (never deployed to Vercel)
   */
  async _loadFromFile() {
    try {
      const response = await fetch('.env');
      if (!response.ok) {
        console.warn('⚠️ .env file not found. Using default configuration.');
        this.setDefaults();
        return;
      }
      const envText = await response.text();
      this.parse(envText);
      this.loaded = true;
    } catch (error) {
      console.warn('⚠️ Error loading .env file:', error.message);
      this.setDefaults();
    }
  }

  /**
   * Parse .env file content into key=value pairs
   */
  parse(envText) {
    const lines = envText.split('\n');
    lines.forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // Remove surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        this.variables[key] = value;
      }
    });
  }

  /**
   * Fallback defaults when neither .env nor /api/config is available
   */
  setDefaults() {
    this.variables = {
      SUPABASE_URL: 'https://your-project.supabase.co',
      SUPABASE_ANON_KEY: 'your-anon-key-here',
      PAYSTACK_PUBLIC_KEY: 'pk_test_xxxxxxxxxxxx',
      APP_ENV: 'development',
      SCHOOL_NAME: 'TBD Academy'
    };
    window.ENV = this.variables;
    this.loaded = true;
  }

  get(key, defaultValue = null) {
    return (key in this.variables && this.variables[key] !== '' && this.variables[key] !== null)
      ? this.variables[key]
      : defaultValue;
  }

  isProduction() {
    return this.get('APP_ENV') === 'production';
  }

  isDevelopment() {
    return this.get('APP_ENV') === 'development';
  }
}

// Create global instance
const envLoader = new EnvLoader();

// window.envReady resolves when env vars are fully loaded
window.envReady = (async () => {
  await envLoader.load();
  return window.ENV;
})();

// Also expose the loader instance
window.envLoader = envLoader;
