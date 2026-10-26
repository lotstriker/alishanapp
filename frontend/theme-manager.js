// theme-manager.js - Global Theme Management
class GlobalThemeManager {
  constructor() {
    this.currentTheme = 'light-default'; // fast fallback until AlishanDB resolves
    this.availableThemes = [
      'light-default', 'light-warm', 'dark-deep',
      'dark-blue', 'gold', 'purple', 'mint'
    ];
    this.init();
  }
  
  async init() {
    await AlishanDB.init();
    this.currentTheme = await this.getSavedTheme();

    // Apply saved theme on page load
    this.applyTheme(this.currentTheme);
    
    // System theme detection
    await this.detectSystemTheme();
  }
  
  getAvailableThemes() {
    return this.availableThemes;
  }
  
  applyTheme(themeName) {
    if (!this.availableThemes.includes(themeName)) {
      themeName = 'light-default';
    }
    
    // Remove all theme classes
    this.availableThemes.forEach(theme => {
      document.body.classList.remove(`theme-${theme}`);
    });
    
    // Apply new theme
    document.body.classList.add(`theme-${themeName}`);
    
    // Update theme toggle icon
    this.updateThemeToggleIcon(themeName);
    
    // Persist through the single source of truth (AlishanDB)
    AlishanDB.setTheme(themeName);
    this.currentTheme = themeName;
    
    // Update theme selector if exists
    this.updateThemeSelector(themeName);
    
    // Dispatch event for other components
    this.notifyThemeChange(themeName);
  }
  
  updateThemeToggleIcon(themeName) {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      const isDark = themeName.includes('dark') || themeName === 'gold';
      themeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }
  }
  
  updateThemeSelector(themeName) {
    const selector = document.getElementById('themeSelector');
    if (selector) {
      selector.querySelectorAll('.theme-option').forEach(option => {
        option.classList.toggle('selected', option.dataset.theme === themeName);
      });
    }
  }
  
  notifyThemeChange(themeName) {
    // Custom event for other scripts
    const event = new CustomEvent('themeChanged', {
      detail: { theme: themeName }
    });
    document.dispatchEvent(event);
  }
  
  async getSavedTheme() {
    return AlishanDB.getTheme('light-default');
  }
  
  // Method for other pages to get current theme
  getCurrentTheme() {
    return this.currentTheme;
  }
  
  // Auto theme detection based on system preference
  async detectSystemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      // Only apply if no theme is saved yet
      const saved = await AlishanDB.getSetting('selectedTheme', null);
      if (!saved) {
        this.applyTheme('dark-deep');
      }
    }
  }
  
  // Toggle between light and dark
  toggleDarkLight() {
    const current = this.getCurrentTheme();
    const isDark = current.includes('dark') || current === 'gold';
    const newTheme = isDark ? 'light-default' : 'dark-deep';
    this.applyTheme(newTheme);
  }
}

// Initialize global theme manager
window.globalThemeManager = new GlobalThemeManager();

// Theme toggle functionality
document.addEventListener('DOMContentLoaded', function() {
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function() {
      window.globalThemeManager.toggleDarkLight();
    });
  }
});
