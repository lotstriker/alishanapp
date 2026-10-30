// script.js - Main Settings Dashboard Functionality
class CompleteSettingsManager {
    constructor() {
        this.currentSection = 'dashboard';
        this.settings = {}; // populated async in init() from AlishanDB
        this.undoStack = [];
        this.redoStack = [];
        this.users = [
            { id: 1, email: 'admin@alishan.com', name: 'Admin User', role: 'admin', avatar: 'https://ui-avatars.com/api/?name=Admin+User&background=f72585&color=fff' },
            { id: 2, email: 'manager@alishan.com', name: 'Manager User', role: 'manager', avatar: 'https://ui-avatars.com/api/?name=Manager+User&background=f8961e&color=fff' },
            { id: 3, email: 'staff@alishan.com', name: 'Staff User', role: 'staff', avatar: 'https://ui-avatars.com/api/?name=Staff+User&background=4cc9f0&color=fff' }
        ];
        this.exchangeRates = {};
        this.currentLogoFile = null;
        this.cropper = null;
        
        // Data for various selectors
        this.currencies = [
            { code: 'INR', name: 'Indian Rupee', symbol: '₹', flag: 'https://flagcdn.com/w40/in.png', rate: 83.25 },
            { code: 'USD', name: 'US Dollar', symbol: '$', flag: 'https://flagcdn.com/w40/us.png', rate: 1.00 },
            { code: 'EUR', name: 'Euro', symbol: '€', flag: 'https://flagcdn.com/w40/eu.png', rate: 0.92 },
            { code: 'GBP', name: 'British Pound', symbol: '£', flag: 'https://flagcdn.com/w40/gb.png', rate: 0.79 },
            { code: 'JPY', name: 'Japanese Yen', symbol: '¥', flag: 'https://flagcdn.com/w40/jp.png', rate: 149.50 },
            { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', flag: 'https://flagcdn.com/w40/ca.png', rate: 1.36 }
        ];
        
        this.languages = [
            { code: 'en', name: 'English', flag: 'https://flagcdn.com/w40/us.png' },
            { code: 'hi', name: 'Hindi', flag: 'https://flagcdn.com/w40/in.png' },
            { code: 'es', name: 'Spanish', flag: 'https://flagcdn.com/w40/es.png' },
            { code: 'fr', name: 'French', flag: 'https://flagcdn.com/w40/fr.png' }
        ];
        
        this.themes = [
            { id: 'light-default', name: 'Light Default' },
            { id: 'light-warm', name: 'Warm Light' },
            { id: 'dark-deep', name: 'Deep Dark' },
            { id: 'gold', name: 'Gold Dark' },
            { id: 'purple', name: 'Purple Light' },
            { id: 'mint', name: 'Mint Light' },
            { id: 'midnight-slate', name: 'Midnight Slate' },
            { id: 'forest-night', name: 'Forest Night' },
            { id: 'carbon-flame', name: 'Carbon Flame' },
            { id: 'ash-orange', name: 'Ash Orange' },
            { id: 'ember-forge', name: 'Ember Forge' },
            { id: 'deep-teal', name: 'Deep Teal' },
            { id: 'arctic-teal', name: 'Arctic Teal' },
            { id: 'red-inferno', name: 'Red Inferno' },
            { id: 'royal-teal', name: 'Royal Teal' },
            { id: 'github-dark', name: 'GitHub Dark' },
            { id: 'material-dark', name: 'Material Dark' },
            { id: 'teal-finance', name: 'Teal Finance' }
        ];
        
        this.permissions = [
            { id: 'view_inventory', name: 'View Inventory' },
            { id: 'edit_inventory', name: 'Edit Inventory' },
            { id: 'manage_users', name: 'Manage Users' },
            { id: 'system_settings', name: 'System Settings' },
            { id: 'generate_reports', name: 'Generate Reports' },
            { id: 'backup_restore', name: 'Backup/Restore' },
            { id: 'import_export', name: 'Import/Export' },
            { id: 'view_sales', name: 'View Sales' },
            { id: 'manage_orders', name: 'Manage Orders' },
            { id: 'view_customers', name: 'View Customers' }
        ];
        
        this.rolePermissions = {
            admin: ['view_inventory', 'edit_inventory', 'manage_users', 'system_settings', 'generate_reports', 'backup_restore', 'import_export', 'view_sales', 'manage_orders', 'view_customers'],
            manager: ['view_inventory', 'edit_inventory', 'generate_reports', 'view_sales', 'manage_orders', 'view_customers'],
            staff: ['view_inventory', 'view_sales', 'view_customers']
        };
        
        this.init();
    }

    async init() {
        await AlishanDB.init();
        this.settings = await this.loadSettings();
        this.setupNavigation();
        this.setupSearch();
        this.setupEventListeners();
        this.populateAllSelectors();
        await this.updateBackupList();
        this.updateAISuggestions();
        await this.calculateStorageUsage();
        this.showToast('Settings dashboard loaded successfully', 'success');
    }

    // ===== NAVIGATION & LAYOUT =====
    setupNavigation() {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                this.showSection(section);
                
                document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            });
        });
    }

    setupSearch() {
        const searchInput = document.getElementById('globalSearch');
        if (searchInput) {
            searchInput.addEventListener('input', this.debounce(() => {
                this.searchSettings(searchInput.value);
            }, 300));
        }
    }

    setupEventListeners() {
        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                if (e.key === 'z') {
                    e.preventDefault();
                    this.undo();
                } else if (e.key === 'y' || (e.shiftKey && e.key === 'Z')) {
                    e.preventDefault();
                    this.redo();
                } else if (e.key === 's') {
                    e.preventDefault();
                    this.saveSettings();
                }
            }
        });

        // Auto-save with debouncing
        const saveableElements = document.querySelectorAll('input, select, textarea');
        saveableElements.forEach(element => {
            element.addEventListener('input', this.debounce(() => {
                this.autoSave();
            }, 1000));
        });

        this.updateUndoRedoButtons();

        // Close modals when clicking outside
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('click', function(e) {
                if (e.target === this) {
                    this.classList.remove('active');
                }
            });
        });
    }

    showSection(sectionId) {
        document.querySelectorAll('.settings-section').forEach(section => {
            section.classList.remove('active');
        });
        
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('active');
            this.currentSection = sectionId;
        }
    }

    searchSettings(query) {
        if (!query.trim()) {
            document.querySelectorAll('.settings-section').forEach(section => {
                section.style.display = 'block';
            });
            return;
        }

        const sections = document.querySelectorAll('.settings-section');
        let found = false;

        sections.forEach(section => {
            const text = section.textContent.toLowerCase();
            if (text.includes(query.toLowerCase())) {
                section.style.display = 'block';
                found = true;
            } else {
                section.style.display = 'none';
            }
        });

        if (!found && query) {
            this.showToast('No settings found for your search', 'info');
        }
    }

    // ===== POPULATE ALL SELECTORS =====
    populateAllSelectors() {
        this.populateCurrencies();
        this.populateLanguages();
        this.populateThemes();
        this.populateUsers();
        this.populatePermissions();
        this.initBackupCalendar();
    }

    populateCurrencies() {
        const container = document.getElementById('currencySelector');
        if (!container) return;

        container.innerHTML = '';

        this.currencies.forEach(currency => {
            const card = document.createElement('div');
            card.className = 'currency-card';
            card.innerHTML = `
                <img src="${currency.flag}" alt="${currency.code}" style="width: 24px; height: 16px; border-radius: 2px;">
                <div style="font-weight: 500; margin: 0.25rem 0;">${currency.name}</div>
                <div class="exchange-rate">${currency.symbol} ${currency.code}</div>
            `;
            card.addEventListener('click', (event) => this.selectCurrency(currency.code, event));
            container.appendChild(card);
        });

        if (this.currencies.length > 0) {
            container.querySelector('.currency-card').classList.add('selected');
        }
    }

    populateLanguages() {
        const container = document.getElementById('languageSelector');
        if (!container) return;

        container.innerHTML = '';

        this.languages.forEach(language => {
            const option = document.createElement('div');
            option.className = 'language-option';
            option.dataset.lang = language.code;
            option.innerHTML = `
                <img src="${language.flag}" alt="${language.code}" style="width: 24px; height: 24px; border-radius: 50%; margin-bottom: 0.5rem;">
                <span>${language.name}</span>
            `;
            
            option.addEventListener('click', () => {
                document.querySelectorAll('.language-option').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
                this.showToast(`Language set to ${language.name}`, 'success');
            });
            
            container.appendChild(option);
        });

        const englishOption = document.querySelector('.language-option[data-lang="en"]');
        if (englishOption) {
            englishOption.classList.add('selected');
        }
    }

    populateThemes() {
        const container = document.getElementById('themeSelector');
        if (!container) return;

        container.innerHTML = '';

        this.themes.forEach(theme => {
            const option = document.createElement('div');
            option.className = `theme-option ${theme.id}`;
            option.dataset.theme = theme.id;
            option.innerHTML = `
                <div class="theme-preview"></div>
                <span>${theme.name}</span>
            `;
            
            option.addEventListener('click', () => {
                document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
                window.globalThemeManager.applyTheme(theme.id);
            });
            
            container.appendChild(option);
        });

        // Select current theme
        const currentTheme = window.globalThemeManager.getCurrentTheme();
        const currentOption = document.querySelector(`.theme-option[data-theme="${currentTheme}"]`);
        if (currentOption) {
            currentOption.classList.add('selected');
        }
    }

    populateUsers() {
        const userList = document.getElementById('userList');
        if (!userList) return;

        userList.innerHTML = this.users.map(user => `
            <div class="user-item">
                <div class="user-info">
                    <input type="checkbox" class="bulk-checkbox" data-user-id="${user.id}">
                    <div class="user-avatar">
                        <img src="${user.avatar}" alt="${user.name}" style="width: 40px; height: 40px; border-radius: 50%;">
                    </div>
                    <div>
                        <strong>${user.email}</strong>
                        <div>${user.name}</div>
                    </div>
                </div>
                <div>
                    <span class="user-role-badge ${user.role === 'admin' ? 'role-admin' : user.role === 'manager' ? 'role-manager' : 'role-staff'}">
                        ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                    </span>
                    <button class="btn btn-secondary btn-sm" onclick="settingsManager.editUser(${user.id})">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                </div>
            </div>
        `).join('');
    }

    populatePermissions() {
        const container = document.getElementById('permissionMatrix');
        if (!container) return;

        container.innerHTML = '';

        this.permissions.forEach(perm => {
            const item = document.createElement('div');
            item.className = 'permission-item';
            item.innerHTML = `
                <label class="toggle-switch">
                    <input type="checkbox" id="permission-${perm.id}" ${this.rolePermissions.admin.includes(perm.id) ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
                <span>${perm.name}</span>
            `;
            container.appendChild(item);
        });
    }

    // ===== SETTINGS PROFILES =====
    applyProfile(profile) {
        this.saveState();

        const profiles = {
            beginner: { 
                itemsPerPage: '20',
                compactMode: false
            },
            advanced: { 
                itemsPerPage: '50', 
                compactMode: true
            },
            performance: { 
                itemsPerPage: '100',
                compactMode: true
            }
        };

        const config = profiles[profile];
        
        if (document.getElementById('itemsPerPage')) {
            document.getElementById('itemsPerPage').value = config.itemsPerPage;
        }

        document.querySelectorAll('.profile-card').forEach(card => card.classList.remove('active'));
        event.target.closest('.profile-card').classList.add('active');
        
        this.showToast(`${profile.charAt(0).toUpperCase() + profile.slice(1)} profile applied`, 'success');
        this.autoSave();
    }

    // ===== UNDO/REDO FUNCTIONALITY =====
    saveState() {
        const currentState = {
            businessName: document.getElementById('businessName')?.value || '',
            businessAddress: document.getElementById('businessAddress')?.value || '',
            dateFormat: document.getElementById('dateFormat')?.value || '',
            itemsPerPage: document.getElementById('itemsPerPage')?.value || '',
            users: JSON.parse(JSON.stringify(this.users))
        };
        
        this.undoStack.push(JSON.stringify(currentState));
        if (this.undoStack.length > 50) this.undoStack.shift();
        this.redoStack = [];
        this.updateUndoRedoButtons();
    }

    undo() {
        if (this.undoStack.length > 0) {
            const currentState = {
                businessName: document.getElementById('businessName')?.value || '',
                businessAddress: document.getElementById('businessAddress')?.value || '',
                dateFormat: document.getElementById('dateFormat')?.value || '',
                itemsPerPage: document.getElementById('itemsPerPage')?.value || '',
                users: JSON.parse(JSON.stringify(this.users))
            };
            
            this.redoStack.push(JSON.stringify(currentState));
            const previousState = JSON.parse(this.undoStack.pop());
            
            this.applyState(previousState);
            this.showToast('Undo successful', 'info');
            this.updateUndoRedoButtons();
        }
    }

    redo() {
        if (this.redoStack.length > 0) {
            const currentState = {
                businessName: document.getElementById('businessName')?.value || '',
                businessAddress: document.getElementById('businessAddress')?.value || '',
                dateFormat: document.getElementById('dateFormat')?.value || '',
                itemsPerPage: document.getElementById('itemsPerPage')?.value || '',
                users: JSON.parse(JSON.stringify(this.users))
            };
            
            this.undoStack.push(JSON.stringify(currentState));
            const nextState = JSON.parse(this.redoStack.pop());
            
            this.applyState(nextState);
            this.showToast('Redo successful', 'info');
            this.updateUndoRedoButtons();
        }
    }

    applyState(state) {
        if (document.getElementById('businessName')) {
            document.getElementById('businessName').value = state.businessName;
        }
        if (document.getElementById('businessAddress')) {
            document.getElementById('businessAddress').value = state.businessAddress;
        }
        if (document.getElementById('dateFormat')) {
            document.getElementById('dateFormat').value = state.dateFormat;
        }
        if (document.getElementById('itemsPerPage')) {
            document.getElementById('itemsPerPage').value = state.itemsPerPage;
        }
        
        this.users = state.users;
        this.populateUsers();
    }

    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        
        if (undoBtn) {
            undoBtn.disabled = this.undoStack.length === 0;
            undoBtn.style.opacity = this.undoStack.length === 0 ? '0.5' : '1';
        }
        
        if (redoBtn) {
            redoBtn.disabled = this.redoStack.length === 0;
            redoBtn.style.opacity = this.redoStack.length === 0 ? '0.5' : '1';
        }
    }

    // ===== AI SUGGESTIONS =====
    updateAISuggestions() {
        const suggestions = [
            "Enable auto-backup for better data protection",
            "Consider enabling two-factor authentication for security",
            "Optimize image sizes for faster loading times",
            "Set up scheduled reports for better insights",
            "Review user permissions for enhanced security"
        ];
        
        const randomSuggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
        const suggestionElement = document.getElementById('aiSuggestionText');
        if (suggestionElement) {
            suggestionElement.textContent = randomSuggestion;
        }
    }

    // ===== VALIDATION =====
    validateBusinessName(name) {
        const errorElement = document.getElementById('businessNameError');
        
        if (name.length < 2) {
            errorElement.textContent = 'Business name must be at least 2 characters long';
            errorElement.style.display = 'block';
            return false;
        } else if (name.length > 50) {
            errorElement.textContent = 'Business name must be less than 50 characters';
            errorElement.style.display = 'block';
            return false;
        } else {
            errorElement.style.display = 'none';
            return true;
        }
    }

    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    // ===== BACKUP & STORAGE =====
    updateBackupList() {
        const backups = [
            { date: '2024-01-15 14:30:00', size: '2.1 MB', type: 'Auto' },
            { date: '2024-01-14 10:15:00', size: '2.0 MB', type: 'Manual' },
            { date: '2024-01-13 02:00:00', size: '1.9 MB', type: 'Auto' }
        ];

        const timeline = document.getElementById('backupTimeline');
        if (!timeline) return;

        timeline.innerHTML = '';

        backups.forEach(backup => {
            const formattedDate = new Date(backup.date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            const formattedTime = new Date(backup.date).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const item = document.createElement('div');
            item.className = 'timeline-item';
            item.innerHTML = `
                <div class="timeline-date">${formattedDate}, ${formattedTime}</div>
                <div class="timeline-content">
                    <strong>${backup.type} Backup</strong>
                    <div>${backup.size} • Completed successfully</div>
                    <div style="margin-top: 0.5rem;">
                        <button class="btn btn-secondary btn-sm" onclick="settingsManager.downloadBackup('${backup.date}')">
                            <i class="fas fa-download"></i> Download
                        </button>
                        <button class="btn btn-sm" onclick="settingsManager.restoreBackup('${backup.date}')">
                            <i class="fas fa-undo"></i> Restore
                        </button>
                    </div>
                </div>
            `;
            timeline.appendChild(item);
        });
    }

    async calculateStorageUsage() {
        const progressBar = document.getElementById('storageProgressBar');
        const usageText = document.getElementById('storageUsageText');
        const percentageText = document.getElementById('storagePercentage');

        // Data now lives in IndexedDB (AlishanDB), not localStorage,
        // so usage is read from the browser's storage estimate API.
        if (navigator.storage && navigator.storage.estimate) {
            const { usage = 0, quota = 0 } = await navigator.storage.estimate();
            const usageMB = (usage / (1024 * 1024)).toFixed(2);
            const quotaMB = quota ? (quota / (1024 * 1024)).toFixed(0) : '—';
            const percentage = quota ? Math.min(100, (usage / quota) * 100).toFixed(0) : 0;

            if (progressBar) progressBar.style.width = `${percentage}%`;
            if (usageText) usageText.textContent = `${usageMB} MB of ${quotaMB} MB used`;
            if (percentageText) percentageText.textContent = `${percentage}%`;
        } else if (usageText) {
            usageText.textContent = 'Storage usage unavailable in this browser';
        }
    }

    // ===== CURRENCY & EXCHANGE RATES =====
    async fetchRealTimeExchangeRates() {
        const refreshBtn = document.getElementById('refreshRatesBtn');
        if (!refreshBtn) return;

        const originalHTML = refreshBtn.innerHTML;
        
        try {
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Fetching Rates...';
            
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            this.exchangeRates = { INR: 83.25, EUR: 0.92, GBP: 0.79, JPY: 149.50, CAD: 1.36, USD: 1.00 };
            this.updateCurrencyRates(this.exchangeRates);
            
            document.getElementById('lastUpdated').textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
            
            this.showToast('Exchange rates updated successfully', 'success');
        } catch (error) {
            this.showToast('Using offline exchange rates', 'warning');
            const fallbackRates = { INR: 83.25, EUR: 0.92, GBP: 0.79, JPY: 149.50, CAD: 1.36, USD: 1.00 };
            this.updateCurrencyRates(fallbackRates);
            document.getElementById('lastUpdated').textContent = 'Using cached rates';
        } finally {
            refreshBtn.innerHTML = originalHTML;
        }
    }

    updateCurrencyRates(rates) {
        document.querySelectorAll('.currency-card').forEach(card => {
            const currencyText = card.querySelector('div').textContent;
            const currencyCode = this.currencies.find(c => c.name === currencyText)?.code;
            if (currencyCode && rates[currencyCode]) {
                const rateElement = card.querySelector('.exchange-rate');
                rateElement.innerHTML = `<span style="font-weight: bold; color: var(--success);">1 USD = ${rates[currencyCode].toFixed(2)} ${currencyCode}</span>`;
            }
        });
    }

    selectCurrency(currencyCode, event) {
        document.querySelectorAll('.currency-card').forEach(card => card.classList.remove('selected'));
        event.target.closest('.currency-card').classList.add('selected');
        this.showToast(`Currency set to ${currencyCode}`, 'success');
        this.autoSave();
    }

    // ===== USER MANAGEMENT =====
    editUser(userId) {
        const user = this.users.find(u => u.id === userId);
        if (user) {
            document.getElementById('modalTitle').textContent = 'Edit User';
            document.getElementById('modalActionBtn').textContent = 'Save Changes';
            document.getElementById('modalActionBtn').onclick = () => this.saveUserChanges(userId);
            
            document.getElementById('userEmail').value = user.email;
            document.getElementById('userEmail').disabled = true;
            document.getElementById('userName').value = user.name;
            document.getElementById('userRole').value = user.role;
            document.getElementById('userPassword').value = '';
            document.getElementById('confirmPassword').value = '';
            
            document.getElementById('userModal').classList.add('active');
        }
    }

    addUser() {
        const email = document.getElementById('userEmail').value;
        const name = document.getElementById('userName').value;
        const role = document.getElementById('userRole').value;
        const password = document.getElementById('userPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (!this.validateEmail(email)) {
            this.showToast('Please enter a valid email address', 'error');
            return;
        }
        
        if (!name.trim()) {
            this.showToast('Please enter a name', 'error');
            return;
        }
        
        if (password.length < 6) {
            this.showToast('Password must be at least 6 characters', 'error');
            return;
        }
        
        if (password !== confirmPassword) {
            this.showToast('Passwords do not match', 'error');
            return;
        }
        
        const newUser = {
            id: Date.now(),
            email: email,
            name: name,
            role: role,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${role === 'admin' ? 'f72585' : role === 'manager' ? 'f8961e' : '4cc9f0'}&color=fff`
        };
        
        this.users.push(newUser);
        this.populateUsers();
        this.showToast('User added successfully!', 'success');
        this.closeModal();
    }

    saveUserChanges(userId) {
        const email = document.getElementById('userEmail').value;
        const name = document.getElementById('userName').value;
        const role = document.getElementById('userRole').value;
        const password = document.getElementById('userPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (!name.trim()) {
            this.showToast('Please enter a name', 'error');
            return;
        }
        
        if (password && password.length < 6) {
            this.showToast('Password must be at least 6 characters', 'error');
            return;
        }
        
        if (password !== confirmPassword) {
            this.showToast('Passwords do not match', 'error');
            return;
        }
        
        const userIndex = this.users.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            this.users[userIndex].name = name;
            this.users[userIndex].role = role;
            this.users[userIndex].avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${role === 'admin' ? 'f72585' : role === 'manager' ? 'f8961e' : '4cc9f0'}&color=fff`;
        }
        
        this.populateUsers();
        this.showToast('User updated successfully!', 'success');
        this.closeModal();
    }

    selectAllUsers() {
        document.querySelectorAll('.bulk-checkbox').forEach(checkbox => {
            checkbox.checked = true;
        });
        this.showToast('All users selected', 'info');
    }

    deleteSelectedUsers() {
        const selected = Array.from(document.querySelectorAll('.bulk-checkbox:checked'));
        if (selected.length === 0) {
            this.showToast('Please select users to delete', 'warning');
            return;
        }
        
        if (confirm(`Are you sure you want to delete ${selected.length} user(s)?`)) {
            selected.forEach(checkbox => {
                const userId = parseInt(checkbox.dataset.userId);
                this.users = this.users.filter(user => user.id !== userId);
            });
            this.populateUsers();
            this.showToast(`${selected.length} user(s) deleted successfully`, 'success');
        }
    }

    exportSelectedUsers() {
        const selected = Array.from(document.querySelectorAll('.bulk-checkbox:checked'));
        if (selected.length === 0) {
            this.showToast('Please select users to export', 'warning');
            return;
        }
        
        const selectedUsers = this.users.filter(user => 
            selected.some(checkbox => parseInt(checkbox.dataset.userId) === user.id)
        );
        
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(selectedUsers));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `users_export_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        
        this.showToast(`Exported ${selected.length} user(s)`, 'success');
    }

    // ===== MODAL MANAGEMENT =====
    closeModal() {
        document.getElementById('userModal').classList.remove('active');
    }

    closeCropperModal() {
        document.getElementById('cropperModal').classList.remove('active');
        if (this.cropper) {
            this.cropper.destroy();
            this.cropper = null;
        }
    }

    closeCloudBackupModal() {
        document.getElementById('cloudBackupModal').classList.remove('active');
    }

    closeBulkImportModal() {
        document.getElementById('bulkImportModal').classList.remove('active');
    }

    // ===== LOGO UPLOAD =====
    handleLogoUpload(file) {
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('logoPreview').src = e.target.result;
                document.getElementById('logoPreview').style.display = 'block';
                document.querySelector('.logo-placeholder').style.display = 'none';
                document.getElementById('cropLogoBtn').style.display = 'inline-flex';
                
                this.currentLogoFile = file;
            };
            reader.readAsDataURL(file);
        } else {
            this.showToast('Please select a valid image file', 'error');
        }
    }

    showCropperModal() {
        if (!this.currentLogoFile) return;
        
        const cropperImage = document.getElementById('cropperImage');
        const reader = new FileReader();
        
        reader.onload = (e) => {
            cropperImage.src = e.target.result;
            
            setTimeout(() => {
                if (this.cropper) {
                    this.cropper.destroy();
                }
                
                this.cropper = new Cropper(cropperImage, {
                    aspectRatio: 1,
                    viewMode: 1,
                    guides: true
                });
            }, 100);
        };
        
        reader.readAsDataURL(this.currentLogoFile);
        document.getElementById('cropperModal').classList.add('active');
    }

    rotateImage(degrees) {
        if (this.cropper) {
            this.cropper.rotate(degrees);
        }
    }

    cropImage() {
        if (!this.cropper) return;
        
        const canvas = this.cropper.getCroppedCanvas({
            width: 300,
            height: 300
        });
        
        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            document.getElementById('logoPreview').src = url;
            
            const file = new File([blob], 'logo.png', { type: 'image/png' });
            this.currentLogoFile = file;
            
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onloadend = () => {
                AlishanDB.setSetting('businessLogo', reader.result);
            };
            
            this.closeCropperModal();
            this.showToast('Logo cropped and saved successfully', 'success');
        });
    }

    // ===== BACKUP CALENDAR =====
    initBackupCalendar() {
        const calendar = document.getElementById('backupCalendar');
        if (!calendar) return;

        while (calendar.children.length > 7) {
            calendar.removeChild(calendar.lastChild);
        }

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startDay = new Date(year, month, 1).getDay();

        document.getElementById('calendarMonth').textContent = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        for (let i = 0; i < startDay; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'calendar-date';
            calendar.appendChild(emptyCell);
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const dateCell = document.createElement('div');
            dateCell.className = 'calendar-date';
            dateCell.textContent = i;
            
            if (i % 7 === 0 || i === 15) {
                dateCell.classList.add('has-backup');
            }
            
            if (i === now.getDate()) {
                dateCell.classList.add('selected');
            }
            
            calendar.appendChild(dateCell);
        }

        document.getElementById('prevMonth').addEventListener('click', () => {
            this.showToast('Previous month clicked', 'info');
        });
        
        document.getElementById('nextMonth').addEventListener('click', () => {
            this.showToast('Next month clicked', 'info');
        });
    }

    // ===== SETTINGS SAVING =====
    async loadSettings() {
        return (await AlishanDB.getSetting('completeSettings')) || {};
    }

    async saveSettings() {
        const settings = {
            businessName: document.getElementById('businessName')?.value || '',
            businessAddress: document.getElementById('businessAddress')?.value || '',
            dateFormat: document.getElementById('dateFormat')?.value || '',
            itemsPerPage: document.getElementById('itemsPerPage')?.value || '',
            users: this.users,
            lastSaved: new Date().toISOString()
        };
        
        await AlishanDB.setSetting('completeSettings', settings);
        this.showSaveIndicator();
        this.showToast('Settings saved successfully', 'success');
    }

    async saveGeneralSettings() {
        const businessName = document.getElementById('businessName').value;
        if (!this.validateBusinessName(businessName)) {
            return;
        }
        
        const settings = {
            businessName: businessName,
            currency: document.querySelector('.currency-card.selected')?.dataset.currency || 'INR',
            dateFormat: document.getElementById('dateFormat').value,
            itemsPerPage: document.getElementById('itemsPerPage').value,
            businessAddress: document.getElementById('businessAddress').value
        };
        
        await AlishanDB.setSetting('appSettings', settings);
        this.showSaveIndicator('general');
        this.showToast('General settings saved successfully!', 'success');
    }

    async saveNotificationSettings() {
        const email = document.getElementById('notificationEmail').value;
        if (!this.validateEmail(email)) {
            document.getElementById('emailError').style.display = 'block';
            return;
        }
        document.getElementById('emailError').style.display = 'none';
        
        const settings = {
            lowStockAlerts: document.getElementById('lowStockAlerts').checked,
            dailyReports: document.getElementById('dailyReports').checked,
            newOrderAlerts: document.getElementById('newOrderAlerts').checked,
            backupReminders: document.getElementById('backupReminders').checked,
            notificationEmail: email
        };
        
        await AlishanDB.setSetting('notificationSettings', settings);
        this.showSaveIndicator('notification');
        this.showToast('Notification settings saved successfully!', 'success');
    }

    async saveAppearanceSettings() {
        const settings = {
            theme: document.querySelector('.theme-option.selected')?.dataset.theme || 'light-default',
            primaryColor: document.getElementById('primaryColor').value,
            secondaryColor: document.getElementById('secondaryColor').value,
            language: document.querySelector('.language-option.selected')?.dataset.lang || 'en',
            compactMode: document.getElementById('compactMode').checked
        };
        
        await AlishanDB.setSetting('appearanceSettings', settings);
        window.globalThemeManager.applyTheme(settings.theme);
        this.showSaveIndicator('appearance');
        this.showToast('Appearance settings saved successfully!', 'success');
    }

    async saveSecuritySettings() {
        const settings = {
            twoFactorAuth: document.getElementById('twoFactorAuth').checked,
            sessionTimeout: document.getElementById('sessionTimeout').value,
            minPasswordLength: document.getElementById('minPasswordLength').value,
            passwordExpiry: document.getElementById('passwordExpiry').value,
            requireSpecialChars: document.getElementById('requireSpecialChars').checked,
            requireNumbers: document.getElementById('requireNumbers').checked,
            requireUppercase: document.getElementById('requireUppercase').checked,
            ipWhitelisting: document.getElementById('ipWhitelisting').checked,
            apiRateLimiting: document.getElementById('apiRateLimiting').checked,
            allowedIPs: document.getElementById('allowedIPs').value
        };
        
        await AlishanDB.setSetting('securitySettings', settings);
        this.showSaveIndicator('security');
        this.showToast('Security settings saved successfully!', 'success');
    }

    showSaveIndicator(section = '') {
        const indicator = document.getElementById(`${section || this.currentSection}SaveIndicator`);
        if (indicator) {
            indicator.classList.add('show');
            setTimeout(() => indicator.classList.remove('show'), 3000);
        }
    }

    autoSave() {
        this.saveState();
        this.saveSettings();
    }

    // ===== UTILITY METHODS =====
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas ${this.getToastIcon(type)}"></i>
            <span>${message}</span>
        `;
        container.appendChild(toast);

        setTimeout(() => toast.remove(), 5000);
    }

    getToastIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            info: 'info-circle',
            warning: 'exclamation-triangle'
        };
        return icons[type] || 'info-circle';
    }
}

// ===== GLOBAL FUNCTIONS =====
async function createBackup() {
    window.settingsManager.saveState();
    const inventoryData = await AlishanDB.getInventory();
    const settingsData = await AlishanDB.getSetting('appSettings', {});
    
    const backup = {
        timestamp: new Date().toISOString(),
        inventory: inventoryData || [],
        settings: settingsData || {}
    };
    
    const backups = (await AlishanDB.getSetting('backups', [])) || [];
    backups.push(backup);
    await AlishanDB.setSetting('backups', backups);
    
    window.settingsManager.updateBackupList();
    window.settingsManager.calculateStorageUsage();
    window.settingsManager.showToast('Backup created successfully', 'success');
}

async function exportData() {
    const inventoryData = await AlishanDB.getInventory();
    const settingsData = await AlishanDB.getSetting('appSettings', {});
    
    const format = document.getElementById('exportFormat')?.value || 'json';
    const data = {
        inventory: inventoryData || [],
        settings: settingsData || {},
        exportedAt: new Date().toISOString()
    };
    
    let dataStr, fileName;
    
    if (format === 'json') {
        dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
        fileName = `alishan_export_${new Date().toISOString().split('T')[0]}.json`;
    } else {
        dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
        fileName = `alishan_export_${new Date().toISOString().split('T')[0]}.json`;
    }
    
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", fileName);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    
    window.settingsManager.showToast(`Data exported as ${format.toUpperCase()} successfully!`, 'success');
}

function importData() {
    const fileInput = document.getElementById('importFile');
    if (!fileInput.files.length) {
        window.settingsManager.showToast('Please select a file to import', 'error');
        return;
    }
    
    if (confirm('Importing data will replace your current inventory. Are you sure you want to continue?')) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        
        reader.onload = async function(e) {
            try {
                const data = JSON.parse(e.target.result);
                
                if (data.inventory) {
                    await AlishanDB.saveInventory(data.inventory);
                }
                
                if (data.settings) {
                    await AlishanDB.setSetting('appSettings', data.settings);
                }
                
                window.settingsManager.showToast('Data imported successfully!', 'success');
            } catch (error) {
                window.settingsManager.showToast('Error parsing the file. Please make sure it is a valid JSON file.', 'error');
            }
        };
        
        reader.readAsText(file);
    }
}

function showAddUserModal() {
    document.getElementById('modalTitle').textContent = 'Add New User';
    document.getElementById('modalActionBtn').textContent = 'Add User';
    document.getElementById('modalActionBtn').onclick = () => window.settingsManager.addUser();
    
    document.getElementById('userEmail').value = '';
    document.getElementById('userName').value = '';
    document.getElementById('userRole').value = 'staff';
    document.getElementById('userPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    document.getElementById('userEmail').disabled = false;
    
    document.getElementById('userModal').classList.add('active');
}

function showBulkImportModal() {
    document.getElementById('bulkImportModal').classList.add('active');
}

function showCloudBackupModal() {
    document.getElementById('cloudBackupModal').classList.add('active');
}

async function confirmRestoreBackup() {
    const backups = (await AlishanDB.getSetting('backups', [])) || [];
    if (backups.length === 0) {
        window.settingsManager.showToast('No backups available to restore', 'error');
        return;
    }
    
    if (confirm('Are you sure you want to restore from the latest backup? This will overwrite current data.')) {
        const backup = backups[backups.length - 1];
        await AlishanDB.saveInventory(backup.inventory);
        await AlishanDB.setSetting('appSettings', backup.settings);
        window.settingsManager.showToast('Data restored successfully!', 'success');
    }
}

function toggleTheme() {
    document.getElementById('themeToggle').click();
}

function applyProfile(profile) {
    window.settingsManager.applyProfile(profile);
}

function validateBusinessName(name) {
    return window.settingsManager.validateBusinessName(name);
}

function applyAISuggestions() {
    window.settingsManager.showToast('AI suggestions applied successfully', 'success');
    window.settingsManager.updateAISuggestions();
}

function saveGeneralSettings() {
    window.settingsManager.saveGeneralSettings();
}

function saveNotificationSettings() {
    window.settingsManager.saveNotificationSettings();
}

function saveAppearanceSettings() {
    window.settingsManager.saveAppearanceSettings();
}

function saveSecuritySettings() {
    window.settingsManager.saveSecuritySettings();
}

function fetchRealTimeExchangeRates() {
    window.settingsManager.fetchRealTimeExchangeRates();
}

function selectAllUsers() {
    window.settingsManager.selectAllUsers();
}

function deleteSelectedUsers() {
    window.settingsManager.deleteSelectedUsers();
}

function exportSelectedUsers() {
    window.settingsManager.exportSelectedUsers();
}

function handleLogoUpload(file) {
    window.settingsManager.handleLogoUpload(file);
}

function showCropperModal() {
    window.settingsManager.showCropperModal();
}

function closeCropperModal() {
    window.settingsManager.closeCropperModal();
}

function rotateImage(degrees) {
    window.settingsManager.rotateImage(degrees);
}

function cropImage() {
    window.settingsManager.cropImage();
}

function closeModal() {
    window.settingsManager.closeModal();
}

function closeCloudBackupModal() {
    window.settingsManager.closeCloudBackupModal();
}

function closeBulkImportModal() {
    window.settingsManager.closeBulkImportModal();
}

function saveCloudBackupSettings() {
    window.settingsManager.showToast('Cloud backup settings saved', 'success');
    window.settingsManager.closeCloudBackupModal();
}

function saveExportTemplate() {
    const templateName = prompt('Please enter a name for this template:');
    if (templateName) {
        window.settingsManager.showToast(`Template "${templateName}" saved successfully`, 'success');
    }
}

function previewImportData() {
    const fileInput = document.getElementById('importFile');
    if (!fileInput.files.length) {
        window.settingsManager.showToast('Please select a file to preview', 'error');
        return;
    }
    
    document.getElementById('importPreview').style.display = 'block';
    window.settingsManager.showToast('Data preview loaded', 'success');
}

function showExportOptions(type) {
    document.getElementById('exportOptions').style.display = 'block';
    window.settingsManager.showToast(`Export ${type} options shown`, 'info');
}

function showImportOptions(type) {
    document.getElementById('importOptions').style.display = 'block';
    window.settingsManager.showToast(`Import ${type} options shown`, 'info');
}

function processBulkImport() {
    window.settingsManager.showToast('Bulk import processing started', 'info');
    window.settingsManager.closeBulkImportModal();
}

function downloadUserTemplate() {
    const template = [
        ['email', 'name', 'role'],
        ['user1@example.com', 'User One', 'staff'],
        ['user2@example.com', 'User Two', 'manager']
    ].map(row => row.join(',')).join('\n');
    
    const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(template);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "user_import_template.csv");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function filterAuditLogs() {
    window.settingsManager.showToast('Audit logs filtered', 'info');
}

function clearAuditFilters() {
    window.settingsManager.showToast('Audit filters cleared', 'info');
}

function exportAuditLog() {
    window.settingsManager.showToast('Audit log exported', 'success');
}

function clearAuditLog() {
    if (confirm('Are you sure you want to clear the audit log? This action cannot be undone.')) {
        window.settingsManager.showToast('Audit log cleared', 'success');
    }
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    window.settingsManager = new CompleteSettingsManager();
});