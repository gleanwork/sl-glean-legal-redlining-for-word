// Settings Management Service
// Handles persistent storage using both localStorage and Office.settings

// Config globals loaded via classic <script> tags in HTML (window.GLEAN_DEFAULTS, window.API_CONFIG)
const GLEAN_DEFAULTS = window.GLEAN_DEFAULTS || {};
const API_CONFIG = window.API_CONFIG || {};

// Org config cache (from DynamoDB via Config API)
let orgConfigCache = null;      // Flattened config for easy access
let orgConfigRaw = null;        // Raw nested config (for admin display)
let orgConfigFetchedAt = 0;
const ORG_CONFIG_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Flatten nested DynamoDB config {auth: {authMode:...}, agents: {chatAgentId:...}}
 * into a flat object {authMode:..., chatAgentId:...}
 */
function flattenOrgConfig(nested) {
    const flat = {};
    for (const section of Object.values(nested || {})) {
        if (section && typeof section === 'object') {
            Object.assign(flat, section);
        }
    }
    return flat;
}

export const settings = {
    /**
     * Get a setting value
     * Checks Office.settings first, falls back to localStorage
     * @param {string} key - Setting key
     * @param {*} defaultValue - Default value if not found
     * @returns {*} Setting value
     */
    get(key, defaultValue = null) {
        try {
            // Try Office.settings first (persists across sessions)
            if (typeof Office !== 'undefined' && Office.context && Office.context.document) {
                const value = Office.context.document.settings.get(key);
                if (value !== null && value !== undefined) {
                    return value;
                }
            }
        } catch (error) {
            console.warn('Error reading from Office.settings:', error);
        }

        // Fall back to localStorage
        try {
            const value = localStorage.getItem(key);
            if (value !== null) {
                return JSON.parse(value);
            }
        } catch (error) {
            console.warn('Error reading from localStorage:', error);
        }

        return defaultValue;
    },

    /**
     * Set a setting value
     * Saves to both Office.settings and localStorage
     * @param {string} key - Setting key
     * @param {*} value - Setting value
     */
    set(key, value) {
        // Save to Office.settings
        try {
            if (typeof Office !== 'undefined' && Office.context && Office.context.document) {
                Office.context.document.settings.set(key, value);
                Office.context.document.settings.saveAsync((result) => {
                    if (result.status === Office.AsyncResultStatus.Failed) {
                        console.error('Error saving to Office.settings:', result.error.message);
                    } else {
                        console.log('Setting saved to Office.settings:', key);
                    }
                });
            }
        } catch (error) {
            console.warn('Error saving to Office.settings:', error);
        }

        // Also save to localStorage as backup
        try {
            localStorage.setItem(key, JSON.stringify(value));
            console.log('Setting saved to localStorage:', key);
        } catch (error) {
            console.warn('Error saving to localStorage:', error);
        }
    },

    /**
     * Remove a setting
     * @param {string} key - Setting key
     */
    remove(key) {
        // Remove from Office.settings
        try {
            if (typeof Office !== 'undefined' && Office.context && Office.context.document) {
                Office.context.document.settings.remove(key);
                Office.context.document.settings.saveAsync();
            }
        } catch (error) {
            console.warn('Error removing from Office.settings:', error);
        }

        // Remove from localStorage
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.warn('Error removing from localStorage:', error);
        }
    },

    // Org Config (from DynamoDB via Config API)
    async fetchOrgConfig(force = false) {
        const now = Date.now();
        if (!force && orgConfigCache && (now - orgConfigFetchedAt) < ORG_CONFIG_TTL) {
            return orgConfigCache;
        }
        
        try {
            const resp = await fetch(API_CONFIG.CONFIG_ENDPOINT, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (resp.ok) {
                orgConfigRaw = await resp.json();
                orgConfigCache = flattenOrgConfig(orgConfigRaw);
                orgConfigFetchedAt = now;
                console.log('[SETTINGS] Org config fetched:', Object.keys(orgConfigCache));
                return orgConfigCache;
            } else {
                console.warn('[SETTINGS] Failed to fetch org config:', resp.status);
                return orgConfigCache;
            }
        } catch (error) {
            console.warn('[SETTINGS] Error fetching org config:', error.message);
            return orgConfigCache;
        }
    },
    
    /**
     * Fetch full config with adminEmails (requires admin auth token).
     * Returns the raw nested config for admin UI display.
     */
    async fetchAdminConfig(token) {
        try {
            const resp = await fetch(API_CONFIG.CONFIG_ENDPOINT, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (resp.ok) {
                const raw = await resp.json();
                // Also update the shared cache
                orgConfigRaw = raw;
                orgConfigCache = flattenOrgConfig(raw);
                orgConfigFetchedAt = Date.now();
                console.log('[SETTINGS] Admin config fetched (with adminEmails)');
                return orgConfigCache;
            } else {
                console.warn('[SETTINGS] Failed to fetch admin config:', resp.status);
                return null;
            }
        } catch (error) {
            console.warn('[SETTINGS] Error fetching admin config:', error.message);
            return null;
        }
    },
    
    getOrgConfig() {
        return orgConfigCache;
    },
    
    getOrgConfigRaw() {
        return orgConfigRaw;
    },
    
    /**
     * 3-tier resolution: user override → org config → baked-in default
     * @param {string} userKey - localStorage/Office.settings key
     * @param {string} orgKey - key in org config object
     * @param {string} defaultKey - key in GLEAN_DEFAULTS
     * @returns {string} resolved value
     */
    resolve(userKey, orgKey, defaultKey) {
        // Tier 1: User override (localStorage / Office.settings)
        const userValue = this.get(userKey, '');
        if (userValue) return userValue;
        
        // Tier 2: Org config (DynamoDB)
        if (orgConfigCache && orgConfigCache[orgKey]) {
            return orgConfigCache[orgKey];
        }
        
        // Tier 3: Baked-in defaults (glean-defaults.js)
        return GLEAN_DEFAULTS[defaultKey] || '';
    },
    
    async checkIsAdmin(token) {
        try {
            const response = await fetch(API_CONFIG.ADMIN_CHECK_ENDPOINT, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.isAdmin === true;
            }
            return false;
        } catch (error) {
            console.warn('[SETTINGS] Admin check failed:', error.message);
            return false;
        }
    },
    
    /**
     * Save org config (admin-only). Sends flat config object to Lambda.
     * Lambda handles mapping fields to DynamoDB sections.
     * @param {string} token - Admin bearer token
     * @param {Object} config - Flat config object e.g. {gleanInstance, chatAgentId, adminEmails, ...}
     */
    async saveOrgConfig(token, config) {
        try {
            const resp = await fetch(API_CONFIG.CONFIG_ENDPOINT, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(config)
            });
            
            if (resp.ok) {
                // Update cache with returned config
                const raw = await resp.json();
                orgConfigRaw = raw;
                orgConfigCache = flattenOrgConfig(raw);
                orgConfigFetchedAt = Date.now();
                return { success: true };
            } else {
                const error = await resp.json().catch(() => ({ error: 'Unknown error' }));
                return { success: false, error: error.error || `HTTP ${resp.status}` };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    
    // Glean Configuration
    getApiToken() {
        // In SSO mode, use the OAuth access token
        if (this.getAuthMode() === 'sso') {
            const oauthToken = localStorage.getItem('glean_oauth_access_token');
            if (oauthToken) {
                console.log('[SETTINGS] getApiToken: using OAuth token');
                return oauthToken;
            }
        }
        
        const token = this.get('glean_api_token', '');
        console.log('[SETTINGS] getApiToken called:', {
            hasToken: !!token,
            tokenLength: token?.length,
            tokenPreview: token ? token.substring(0, 10) + '...' : 'empty'
        });
        return token;
    },

    setApiToken(token) {
        this.set('glean_api_token', token);
    },

    getInstance() {
        return this.resolve('glean_instance', 'gleanInstance', 'instance');
    },

    setInstance(instance) {
        this.set('glean_instance', instance);
    },

    getChatAgentId() {
        return this.resolve('glean_chat_agent_id', 'chatAgentId', 'chatAgentId');
    },

    setChatAgentId(agentId) {
        this.set('glean_chat_agent_id', agentId);
    },

    getRedlinerAgentId() {
        return this.resolve('glean_redliner_agent_id', 'redlinerAgentId', 'redlinerAgentId');
    },

    setRedlinerAgentId(agentId) {
        this.set('glean_redliner_agent_id', agentId);
    },

    getListingAgentId() {
        return this.resolve('glean_listing_agent_id', 'listingAgentId', 'listingAgentId');
    },

    setListingAgentId(agentId) {
        this.set('glean_listing_agent_id', agentId);
    },
    
    getAuthMode() {
        // Auth mode comes from org config or baked-in default only (not user-overridable)
        if (orgConfigCache && orgConfigCache.authMode) {
            return orgConfigCache.authMode;
        }
        return GLEAN_DEFAULTS.authMode || 'cognito';
    },
    
    /**
     * Get the effective default for a field (org config → baked-in default).
     * Skips user overrides — use this for placeholder text in settings UI.
     */
    getEffectiveDefault(orgKey, defaultKey) {
        if (orgConfigCache && orgConfigCache[orgKey]) return orgConfigCache[orgKey];
        return GLEAN_DEFAULTS[defaultKey] || '';
    },
    
    getOAuthClientId() {
        if (orgConfigCache && orgConfigCache.oauthClientId) {
            return orgConfigCache.oauthClientId;
        }
        return GLEAN_DEFAULTS.oauthClientId || '';
    },
    
    getOAuthClientType() {
        if (orgConfigCache && orgConfigCache.oauthClientType) {
            return orgConfigCache.oauthClientType;
        }
        return GLEAN_DEFAULTS.oauthClientType || 'dcr';
    },
    
    /**
     * Get org-level default playbook as {name, url} object.
     * Handles backward compat: plain string → {name: '', url: value}
     */
    getOrgDefaultPlaybook() {
        const val = orgConfigCache?.defaultPlaybook;
        if (!val) return { name: '', url: '' };
        if (typeof val === 'string') return { name: '', url: val };
        return { name: val.name || '', url: val.url || '' };
    },
    
    /**
     * Get org-level default template as {name, url} object.
     */
    getOrgDefaultTemplate() {
        const val = orgConfigCache?.defaultTemplate;
        if (!val) return { name: '', url: '' };
        if (typeof val === 'string') return { name: '', url: val };
        return { name: val.name || '', url: val.url || '' };
    },
    
    /**
     * Get admin emails from org config (only available after fetchAdminConfig)
     */
    getAdminEmails() {
        return orgConfigCache?.adminEmails || [];
    },

    // Review Preferences
    getTrackChangesEnabled() {
        return this.get('track_changes_enabled', true);
    },

    setTrackChangesEnabled(enabled) {
        this.set('track_changes_enabled', enabled);
    },

    getDefaultPlaybook() {
        return this.get('default_playbook', 'Let AI Decide');
    },

    setDefaultPlaybook(playbook) {
        this.set('default_playbook', playbook);
    },

    getReviewScopePinned() {
        return this.get('review_scope_pinned', null);
    },

    setReviewScopePinned(scope) {
        if (scope) {
            this.set('review_scope_pinned', scope);
        } else {
            this.remove('review_scope_pinned');
        }
    },

    // Notifications
    getReviewCompletionNotifications() {
        return this.get('notifications_review_completion', true);
    },

    setReviewCompletionNotifications(enabled) {
        this.set('notifications_review_completion', enabled);
    },

    /**
     * Get all settings as an object
     * @returns {Object} All settings
     */
    getAll() {
        return {
            apiToken: this.getApiToken(),
            instance: this.getInstance(),
            chatAgentId: this.getChatAgentId(),
            redlinerAgentId: this.getRedlinerAgentId(),
            listingAgentId: this.getListingAgentId(),
            trackChangesEnabled: this.getTrackChangesEnabled(),
            defaultPlaybook: this.getDefaultPlaybook(),
            reviewScopePinned: this.getReviewScopePinned(),
            reviewCompletionNotifications: this.getReviewCompletionNotifications()
        };
    },

    /**
     * Clear all settings
     */
    clearAll() {
        const keys = [
            'glean_api_token',
            'glean_instance',
            'glean_chat_agent_id',
            'glean_redliner_agent_id',
            'glean_listing_agent_id',
            'track_changes_enabled',
            'default_playbook',
            'review_scope_pinned',
            'notifications_review_completion'
        ];

        keys.forEach(key => this.remove(key));
        console.log('All settings cleared');
    }
};
