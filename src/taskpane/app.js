// Glean Legal Contract Review Add-in
// Main application logic
import { gleanApi } from '../services/gleanApi.js';
import { officeIntegration } from '../services/officeIntegration.js';
import { settings } from '../services/settings.js';
import { gleanOAuth } from '../services/gleanOAuth.js';
import { TEST_CONTRACT, TEST_TEMPLATE, TEST_PLAYBOOK, TEST_CHAT_QUESTION } from '../services/testData.js';
const GLEAN_DEFAULTS = window.GLEAN_DEFAULTS || {};

// Make app globally available for screens.js
window.app = {
    currentScreen: 'home',
    officeReady: false,
    screensReady: false,
    currentRecommendation: 1, // Track which recommendation is being viewed
    appliedRecommendations: new Set(), // Track which recommendations have been applied
    rejectedRecommendations: new Set(), // Track which recommendations have been rejected
    commentOverrides: {}, // Track user overrides for comment checkboxes
    manualEdits: {}, // Track manual edits to recommendations
    availableTemplates: [], // Templates from GDrive
    availablePlaybooks: [], // Playbooks from GDrive
    currentAnalysisResult: null, // Current redliner analysis result
    lastAnalysisError: null, // Last analysis error details for error screen
    lastApplyResults: null, // Results from last apply operation (most recent batch; legacy screens)
    allChangesApplied: false, // Derived: true once every redline is finalized (kept for back-compat)
    appliedChangeIds: new Set(), // Cumulative IDs of successfully applied redlines (terminal)
    failedChangeResults: new Map(), // Cumulative changeId -> { reason, diagnostics } for failed attempts (terminal)
    isApplyingChanges: false, // Concurrency guard shared by single + bulk apply
    isAnalyzing: false, // Concurrency guard for analysis
    selectedChanges: new Set(), // Track which changes are selected for application
    selectedTemplate: '',  // Empty by default - user must choose
    selectedPlaybook: '',  // Empty by default - user must choose
    selectedReviewScope: 'entire', // Default to entire document
    customTemplateInput: '', // Custom template URL or text
    customPlaybookInput: '', // Custom playbook URL or text
    isAdmin: false,          // Admin status flag
    adminEmails: [],         // Cached admin emails list (for admin UI)
    
    async init() {
        console.log('Initializing Glean Legal Contract Review Add-in...');
        this.loadState();
        
        // Migrate old 'ai-decide' values to empty string (Let AI Decide feature not yet implemented)
        const lastTemplate = localStorage.getItem('lastTemplate');
        const lastPlaybook = localStorage.getItem('lastPlaybook');
        if (lastTemplate === 'ai-decide') {
            localStorage.setItem('lastTemplate', '');
            console.log('[APP] Migrated lastTemplate from ai-decide to empty');
        }
        if (lastPlaybook === 'ai-decide') {
            localStorage.setItem('lastPlaybook', '');
            console.log('[APP] Migrated lastPlaybook from ai-decide to empty');
        }
        
        // Load templates and playbooks in background (don't await)
        this.loadTemplatesAndPlaybooks();
        
        // Fetch org config in background (non-blocking, for 3-tier resolution)
        this.initOrgConfig();
        
        // Wait for screens to be ready before showing home
        if (this.screensReady) {
            this.showScreen('home');
        } else {
            console.log('[APP] Waiting for screens to be ready...');
        }
        
        this.setupChat();
        this.restorePinnedState();
        
        // SSO mode: start OAuth refresh timer and listen for token expiry
        if (GLEAN_DEFAULTS.authMode === 'sso') {
            this.initSSOLifecycle();
        }
        
        console.log('Add-in initialized successfully');
    },

    // Org Config & Admin Check
    async initOrgConfig() {
        try {
            await settings.fetchOrgConfig();
            console.log('[APP] Org config loaded');
        } catch (error) {
            console.warn('[APP] Org config fetch failed (using defaults):', error.message);
        }
        
        // Check admin status in background
        this.checkAdminAccess();
    },
    
    async checkAdminAccess() {
        try {
            const token = settings.getApiToken();
            if (!token) {
                console.log('[APP] No token for admin check, skipping');
                this.isAdmin = false;
                return;
            }
            
            this.isAdmin = await settings.checkIsAdmin(token);
            
            // If admin, fetch full config including adminEmails
            if (this.isAdmin) {
                const adminConfig = await settings.fetchAdminConfig(token);
                if (adminConfig) {
                    this.adminEmails = adminConfig.adminEmails || [];
                }
            }
            
            console.log('[APP] Admin check:', this.isAdmin ? 'admin' : 'not admin');
        } catch (error) {
            console.warn('[APP] Admin check failed:', error.message);
            this.isAdmin = false;
        }
    },
    
    // SSO Token Lifecycle
    initSSOLifecycle() {
        console.log('[APP] Initializing SSO token lifecycle');
        
        // Start silent refresh timer
        gleanOAuth.resetRefreshState();
        gleanOAuth.startRefreshTimer();
        
        // Listen for token expiry — trigger re-auth via Dialog API
        window.addEventListener('oauth-token-expired', (event) => {
            console.warn('[APP] OAuth token expired, prompting re-auth', event.detail);
            this.promptSSOReAuth();
        });
    },
    
    async promptSSOReAuth() {
        var dialogUrl = window.location.origin + '/taskpane/oauth-dialog.html';
        
        if (typeof Office !== 'undefined' && Office.context && Office.context.ui) {
            Office.context.ui.displayDialogAsync(
                dialogUrl,
                { height: 60, width: 40, promptBeforeOpen: false },
                (asyncResult) => {
                    if (asyncResult.status === Office.AsyncResultStatus.Failed) {
                        console.error('[APP] Re-auth dialog failed:', asyncResult.error.message);
                        // Fallback: redirect to login
                        window.location.replace('/taskpane/login.html');
                        return;
                    }
                    
                    var dialog = asyncResult.value;
                    
                    dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
                        dialog.close();
                        try {
                            var message = JSON.parse(arg.message);
                            if (message.type === 'oauth-success') {
                                console.log('[APP] Re-auth succeeded, restarting refresh timer');
                                gleanOAuth.resetRefreshState();
                                gleanOAuth.startRefreshTimer();
                            } else {
                                console.warn('[APP] Re-auth failed, redirecting to login');
                                window.location.replace('/taskpane/login.html');
                            }
                        } catch (e) {
                            window.location.replace('/taskpane/login.html');
                        }
                    });
                    
                    dialog.addEventHandler(Office.EventType.DialogEventReceived, () => {
                        // User closed dialog without completing re-auth
                        console.warn('[APP] Re-auth dialog closed by user');
                    });
                }
            );
        } else {
            // Outside Office — redirect to login
            window.location.replace('/taskpane/login.html');
        }
    },
    
    // Chat Functionality
    setupChat() {
        // Load history if available
        const history = gleanApi.chatAgent.getHistory();
        if (history && history.length > 0 && this.currentScreen === 'chat-document') {
            this.renderChatHistory(history);
        }
    },

    async handleChatSubmit() {
        const inputEl = document.getElementById('chat-input');
        const sendBtn = document.getElementById('chat-send-btn');
        const messagesContainer = document.getElementById('chat-messages');
        
        if (!inputEl || !inputEl.value.trim()) return;
        
        const message = inputEl.value.trim();
        
        // 1. Disable input and show user message
        inputEl.value = '';
        inputEl.disabled = true;
        sendBtn.disabled = true;
        
        this.renderMessage(message, 'user');
        this.scrollToBottom();
        
        // 2. Show typing indicator
        const typingId = this.showTypingIndicator();
        this.scrollToBottom();
        
        try {
            // 3. Get document content (context)
            // We fetch this every time to ensure we have the latest content
            // Optimization: Cache this if document hasn't changed
            let documentContent = '';
            try {
                documentContent = await officeIntegration.getDocumentContent();
            } catch (e) {
                console.error('Failed to get document content:', e);
                documentContent = 'Error retrieving document content.';
            }
            
            // 4. Call API
            const response = await gleanApi.chatAgent.sendMessage(message, documentContent);
            
            // 5. Remove typing indicator and show response
            this.removeTypingIndicator(typingId);
            this.renderMessage(response.reply, 'agent');
            
        } catch (error) {
            console.error('Chat error:', error);
            this.removeTypingIndicator(typingId);
            this.renderMessage(`Sorry, something went wrong. Please try again.`, 'agent', true);
        } finally {
            // 6. Re-enable input
            inputEl.disabled = false;
            sendBtn.disabled = false;
            inputEl.focus();
            this.scrollToBottom();
        }
    },
    
    handleSuggestionClick(question) {
        const inputEl = document.getElementById('chat-input');
        if (inputEl) {
            inputEl.value = question;
            this.handleChatSubmit();
        }
    },
    
    startNewChat() {
        // Clear the chat session
        gleanApi.chatAgent.newSession();
        
        // Reload the chat screen to reset to default welcome state
        this.showScreen('chat-document', { clearHistory: true });
        
        // Show notification
        console.log('[APP] Started new chat session');
    },
    
    startChatWithDocument() {
        // Start a NEW chat session (not continuing)
        gleanApi.chatAgent.newSession();
        
        // Navigate to chat screen
        this.showScreen('chat-document', { clearHistory: true });
        
        console.log('[APP] Starting new chat with document');
    },
    
    /**
     * Manually clear chat data (triggered by X button on tile)
     */
    async clearChatManually() {
        this.clearChatData();
        
        // Refresh the home screen to show empty state
        if (this.currentScreen === 'home') {
            await this.showScreen('home');
        }
        
        // Silently clear - visual update is enough feedback
    },
    
    /**
     * Manually clear review data (triggered by X button on tile)
     */
    async clearReviewManually() {
        this.clearReviewData();
        
        // Refresh the home screen to show empty state
        if (this.currentScreen === 'home') {
            await this.showScreen('home');
        }
        
        // Silently clear - visual update is enough feedback
    },
    
    renderMessage(text, type, isError = false) {
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;
        
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${type}`;
        
        let avatarHtml = '';
        if (type === 'agent') {
            avatarHtml = `
                <div class="chat-avatar">
                    <img src="../assets/GLN_logo-icon-Primary.png" alt="Glean" style="width: 24px; height: 24px;">
                </div>`;
        } else {
            avatarHtml = `
                <div class="chat-avatar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #6b7280; width: 18px; height: 18px;">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                </div>`;
        }
        
        let processedText = '';
        
        if (type === 'agent' && typeof marked !== 'undefined' && !isError) {
            // Use marked to render Markdown for agent messages
            try {
                processedText = marked.parse(text);
            } catch (e) {
                console.error('Error parsing markdown:', e);
                processedText = text.replace(/\n/g, '<br>');
            }
        } else {
            // Fallback for user messages or if marked is not loaded
            processedText = text.replace(/\n/g, '<br>');
        }
        
        // Example citation parser: matches "Section X.Y"
        // processedText = processedText.replace(/(Section\s+\d+(\.\d+)*)/g, '<span class="citation" onclick="app.navigateToSection(\'$1\')">$1</span>');
        
        msgDiv.innerHTML = `
            ${avatarHtml}
            <div class="chat-bubble" style="${isError ? 'background: #fee2e2; color: #991b1b;' : ''}">
                <div class="chat-text">${processedText}</div>
            </div>
        `;
        
        messagesContainer.appendChild(msgDiv);
    },
    
    showTypingIndicator() {
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return null;
        
        const id = 'typing-' + Date.now();
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message agent';
        msgDiv.id = id;
        
        msgDiv.innerHTML = `
            <div class="chat-avatar">
                <img src="../assets/GLN_logo-icon-Primary.png" alt="Glean" style="width: 24px; height: 24px;">
            </div>
            <div class="chat-bubble">
                <div class="chat-typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        `;
        
        messagesContainer.appendChild(msgDiv);
        return id;
    },
    
    removeTypingIndicator(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    },
    
    scrollToBottom() {
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    },
    
    renderChatHistory(history) {
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;
        
        // Clear current except welcome if needed (though history usually includes all context)
        // For this implementation, we'll append history after the welcome message
        
        history.forEach(msg => {
            this.renderMessage(msg.content, msg.role === 'user' ? 'user' : 'agent');
        });
        
        setTimeout(() => this.scrollToBottom(), 100);
    },
    
    navigateToSection(sectionName) {
        console.log('Navigating to section:', sectionName);
        officeIntegration.navigateToText(sectionName);
    },
    
    onScreensReady() {
        console.log('[APP] Screens are ready, showing home screen');
        this.screensReady = true;
        
        // If init has already been called, show home screen now
        if (this.officeReady) {
            this.showScreen('home');
        }
    },
    
    loadState() {
        // Load applied recommendations from localStorage
        const applied = localStorage.getItem('appliedRecommendations');
        if (applied) {
            this.appliedRecommendations = new Set(JSON.parse(applied));
        }
        
        // Load rejected recommendations from localStorage
        const rejected = localStorage.getItem('rejectedRecommendations');
        if (rejected) {
            this.rejectedRecommendations = new Set(JSON.parse(rejected));
        }
        
        // Load comment overrides from localStorage
        const overrides = localStorage.getItem('commentOverrides');
        if (overrides) {
            this.commentOverrides = JSON.parse(overrides);
        }
        
        // Load selected changes from localStorage
        const selected = localStorage.getItem('selectedChanges');
        if (selected) {
            this.selectedChanges = new Set(JSON.parse(selected));
        }
        
        // Load last apply results from localStorage
        const applyResults = localStorage.getItem('lastApplyResults');
        if (applyResults) {
            this.lastApplyResults = JSON.parse(applyResults);
        }
        
        // Load cumulative per-redline applied/failed state from localStorage
        const appliedIds = localStorage.getItem('appliedChangeIds');
        if (appliedIds) {
            this.appliedChangeIds = new Set(JSON.parse(appliedIds));
        }
        const failedResults = localStorage.getItem('failedChangeResults');
        if (failedResults) {
            this.failedChangeResults = new Map(JSON.parse(failedResults));
        }
        
        // Load allChangesApplied flag from localStorage
        const allApplied = localStorage.getItem('allChangesApplied');
        if (allApplied !== null) {
            this.allChangesApplied = JSON.parse(allApplied);
        }
        
        // Load cached templates and playbooks immediately
        const cachedTemplates = localStorage.getItem('availableTemplates');
        const cachedPlaybooks = localStorage.getItem('availablePlaybooks');
        
        if (cachedTemplates) {
            this.availableTemplates = JSON.parse(cachedTemplates);
        }
        if (cachedPlaybooks) {
            this.availablePlaybooks = JSON.parse(cachedPlaybooks);
        }
        
        console.log(`[APP] Loaded ${this.availableTemplates.length} cached templates and ${this.availablePlaybooks.length} cached playbooks`);
    },
    
    saveState() {
        localStorage.setItem('appliedRecommendations', JSON.stringify([...this.appliedRecommendations]));
        localStorage.setItem('rejectedRecommendations', JSON.stringify([...this.rejectedRecommendations]));
        localStorage.setItem('commentOverrides', JSON.stringify(this.commentOverrides));
        localStorage.setItem('selectedChanges', JSON.stringify([...this.selectedChanges]));
        localStorage.setItem('allChangesApplied', JSON.stringify(this.allChangesApplied));
        localStorage.setItem('appliedChangeIds', JSON.stringify([...this.appliedChangeIds]));
        localStorage.setItem('failedChangeResults', JSON.stringify([...this.failedChangeResults.entries()]));
    },
    
    /**
     * Clear chat data from localStorage and memory
     * Used by: TTL expiry, manual clear button, new chat
     */
    clearChatData() {
        gleanApi.chatAgent.newSession(); // Clears all chat data via chatSession.clear()
        console.log('[APP] Chat data cleared');
    },
    
    /**
     * Clear review data from localStorage and memory
     * Used by: TTL expiry, manual clear button
     */
    clearReviewData() {
        // Clear localStorage
        localStorage.removeItem('lastAnalysisResult');
        localStorage.removeItem('lastAnalysisDate');
        localStorage.removeItem('lastTemplate');
        localStorage.removeItem('lastPlaybook');
        localStorage.removeItem('lastReviewScope');
        localStorage.removeItem('appliedRecommendations');
        localStorage.removeItem('rejectedRecommendations');
        localStorage.removeItem('commentOverrides');
        localStorage.removeItem('selectedChanges');
        localStorage.removeItem('lastApplyResults');
        localStorage.removeItem('allChangesApplied');
        localStorage.removeItem('appliedChangeIds');
        localStorage.removeItem('failedChangeResults');
        
        // Clear in-memory state
        this.currentAnalysisResult = null;
        this.appliedRecommendations = new Set();
        this.rejectedRecommendations = new Set();
        this.commentOverrides = {};
        this.selectedChanges = new Set();
        this.appliedChangeIds = new Set();
        this.failedChangeResults = new Map();
        this.lastApplyResults = null;
        this.allChangesApplied = false;
        
        console.log('[APP] Review data cleared');
    },
    
    restorePinnedState() {
        const pinnedScope = localStorage.getItem('reviewScopePinned');
        if (pinnedScope) {
            // Store in app state immediately
            this.selectedReviewScope = pinnedScope;
            console.log('[APP] Restored pinned review scope:', pinnedScope);
            
            // Wait a bit for the screen to render
            setTimeout(() => {
                const buttons = document.querySelectorAll('.toggle-btn');
                buttons.forEach(btn => {
                    const onclick = btn.getAttribute('onclick');
                    if (onclick && onclick.includes(`'${pinnedScope}'`)) {
                        btn.classList.add('pinned');
                        btn.classList.add('active');
                    } else {
                        // Remove active class from other buttons
                        btn.classList.remove('active');
                        btn.classList.remove('pinned');
                    }
                });
            }, 100);
        }
    },
    
    // Note: syncTrackChangesSettings removed - unused checkboxes eliminated
    
    async loadTemplatesAndPlaybooks() {
        try {
            console.log('[APP] 🔄 Fetching templates and playbooks via Glean Template & Playbook Lister Agent...');
            
            // Fetch both templates and playbooks in one call
            const result = await gleanApi.listingAgent.fetchLists('Both');
            
            this.availableTemplates = result.templates || [];
            this.availablePlaybooks = result.playbooks || [];
            
            // Store in localStorage for quick access
            localStorage.setItem('availableTemplates', JSON.stringify(this.availableTemplates));
            localStorage.setItem('availablePlaybooks', JSON.stringify(this.availablePlaybooks));
            localStorage.setItem('templatesPlaybooksLastUpdated', Date.now().toString());
            
            console.log(`[APP] ✅ Successfully loaded ${this.availableTemplates.length} templates and ${this.availablePlaybooks.length} playbooks`);
        } catch (error) {
            console.error('[APP] ❌ Error loading templates/playbooks:', error);
            
            // Fall back to cached data if available
            const cachedTemplates = localStorage.getItem('availableTemplates');
            const cachedPlaybooks = localStorage.getItem('availablePlaybooks');
            
            if (cachedTemplates) {
                this.availableTemplates = JSON.parse(cachedTemplates);
            }
            if (cachedPlaybooks) {
                this.availablePlaybooks = JSON.parse(cachedPlaybooks);
            }
            
            console.log('[APP] 📦 Using cached templates/playbooks');
        }
        
        // Inject org-level defaults at the top of lists (if configured)
        this.injectOrgDefaults();
    },
    
    injectOrgDefaults() {
        const orgTemplate = settings.getOrgDefaultTemplate();
        const orgPlaybook = settings.getOrgDefaultPlaybook();
        
        // Inject org default template if it has a URL and isn't already in the list
        if (orgTemplate.url) {
            const exists = this.availableTemplates.some(t => t.url === orgTemplate.url);
            if (!exists) {
                this.availableTemplates.unshift({
                    name: orgTemplate.name || 'Org Default Template',
                    url: orgTemplate.url
                });
            }
            // Pre-select if user hasn't chosen anything yet
            if (!this.selectedTemplate) {
                this.selectedTemplate = orgTemplate.url;
            }
        }
        
        // Inject org default playbook if it has a URL and isn't already in the list
        if (orgPlaybook.url) {
            const exists = this.availablePlaybooks.some(p => p.url === orgPlaybook.url);
            if (!exists) {
                this.availablePlaybooks.unshift({
                    name: orgPlaybook.name || 'Org Default Playbook',
                    url: orgPlaybook.url
                });
            }
            // Pre-select if user hasn't chosen anything yet
            if (!this.selectedPlaybook) {
                this.selectedPlaybook = orgPlaybook.url;
            }
        }
    },
    
    async refreshTemplates() {
        // Get the refresh button and add spinning animation
        const buttons = document.querySelectorAll('.btn-refresh');
        const templateBtn = buttons[0]; // First refresh button is templates
        
        if (!templateBtn) return;
        
        const svg = templateBtn.querySelector('svg');
        svg.classList.add('spinning');
        templateBtn.disabled = true;
        
        try {
            console.log('[APP] 🔄 Fetching templates via Glean Template & Playbook Lister Agent...');
            const result = await gleanApi.listingAgent.fetchLists('Templates');
            
            this.availableTemplates = result.templates || [];
            localStorage.setItem('availableTemplates', JSON.stringify(this.availableTemplates));
            localStorage.setItem('templatesPlaybooksLastUpdated', Date.now().toString());
            
            console.log(`[APP] ✅ Successfully refreshed ${this.availableTemplates.length} templates`);
            
            // Update the dropdown if on review-setup screen
            if (this.currentScreen === 'review-setup') {
                this.updateTemplateDropdown();
            }
            
            // Silently refresh - no notification needed for routine action
        } catch (error) {
            console.error('[APP] ❌ Error refreshing templates:', error);
            this.showNotification('Couldn\'t refresh templates. Please try again.', 'error');
        } finally {
            // Remove spinning animation
            svg.classList.remove('spinning');
            templateBtn.disabled = false;
        }
    },
    
    async refreshPlaybooks() {
        // Get the refresh button and add spinning animation
        const buttons = document.querySelectorAll('.btn-refresh');
        const playbookBtn = buttons[1]; // Second refresh button is playbooks
        
        if (!playbookBtn) return;
        
        const svg = playbookBtn.querySelector('svg');
        svg.classList.add('spinning');
        playbookBtn.disabled = true;
        
        try {
            console.log('[APP] 🔄 Fetching playbooks via Glean Template & Playbook Lister Agent...');
            const result = await gleanApi.listingAgent.fetchLists('Playbooks');
            
            this.availablePlaybooks = result.playbooks || [];
            localStorage.setItem('availablePlaybooks', JSON.stringify(this.availablePlaybooks));
            localStorage.setItem('templatesPlaybooksLastUpdated', Date.now().toString());
            
            console.log(`[APP] ✅ Successfully refreshed ${this.availablePlaybooks.length} playbooks`);
            
            // Update the dropdown if on review-setup screen
            if (this.currentScreen === 'review-setup') {
                this.updatePlaybookDropdown();
            }
            
            // Silently refresh - no notification needed for routine action
        } catch (error) {
            console.error('[APP] ❌ Error refreshing playbooks:', error);
            this.showNotification('Couldn\'t refresh playbooks. Please try again.', 'error');
        } finally {
            // Remove spinning animation
            svg.classList.remove('spinning');
            playbookBtn.disabled = false;
        }
    },
    
    updateTemplateDropdown() {
        const dropdown = document.getElementById('template-select');
        if (!dropdown) return;
        
        const currentValue = dropdown.dataset.value || '';
        const optionsContainer = dropdown.querySelector('.custom-options');
        
        // Rebuild options with custom option + templates
        optionsContainer.innerHTML = `
            <div class="custom-option ${currentValue === 'custom' ? 'selected' : ''}" data-value="custom" onclick="app.selectTemplateOption(event, this, 'Custom Template', 'custom')">Custom Template</div>
            ${this.availableTemplates.map(t => `<div class="custom-option ${currentValue === t.url ? 'selected' : ''}" data-value="${t.url}" onclick="app.selectTemplateOption(event, this, '${t.name}', '${t.url}')">${t.name}</div>`).join('')}
        `;
        
        // Update trigger text if needed
        const trigger = dropdown.querySelector('.custom-select-trigger span');
        if (!currentValue || currentValue === '') {
            trigger.textContent = 'Choose Template';
            trigger.className = 'select-label placeholder';
        }
    },
    
    updatePlaybookDropdown() {
        const dropdown = document.getElementById('playbook-select');
        if (!dropdown) return;
        
        const currentValue = dropdown.dataset.value || '';
        const optionsContainer = dropdown.querySelector('.custom-options');
        
        // Rebuild options with custom option + playbooks
        optionsContainer.innerHTML = `
            <div class="custom-option ${currentValue === 'custom' ? 'selected' : ''}" data-value="custom" onclick="app.selectPlaybookOption(event, this, 'Custom Playbook', 'custom')">Custom Playbook</div>
            ${this.availablePlaybooks.map(p => `<div class="custom-option ${currentValue === p.url ? 'selected' : ''}" data-value="${p.url}" onclick="app.selectPlaybookOption(event, this, '${p.name}', '${p.url}')">${p.name}</div>`).join('')}
        `;
        
        // Update trigger text if needed
        const trigger = dropdown.querySelector('.custom-select-trigger span');
        if (!currentValue || currentValue === '') {
            trigger.textContent = 'Choose Playbook';
            trigger.className = 'select-label placeholder';
        }
    },
    
    toggleDropdown(element) {
        // Close all other dropdowns first
        document.querySelectorAll('.custom-select.open').forEach(dropdown => {
            if (dropdown !== element) {
                dropdown.classList.remove('open');
            }
        });
        
        // Toggle this dropdown
        element.classList.toggle('open');
    },
    
    selectTemplateOption(event, optionElement, displayText, value) {
        event.stopPropagation();
        
        const dropdown = document.getElementById('template-select');
        const trigger = dropdown.querySelector('.custom-select-trigger span');
        
        // Update trigger text
        trigger.textContent = displayText;
        trigger.style.color = value === 'ai-decide' ? '#1e40af' : '#374151';
        trigger.style.fontWeight = value === 'ai-decide' ? '600' : '400';
        
        // Update selected state
        dropdown.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('selected'));
        optionElement.classList.add('selected');
        
        // Close dropdown
        dropdown.classList.remove('open');
        
        // Store selected value
        dropdown.dataset.value = value;
    },
    
    selectPlaybookOption(event, optionElement, displayText, value) {
        event.stopPropagation();
        
        const dropdown = document.getElementById('playbook-select');
        const trigger = dropdown.querySelector('.custom-select-trigger span');
        
        // Update trigger text
        trigger.textContent = displayText;
        trigger.style.color = value === 'ai-decide' ? '#1e40af' : '#374151';
        trigger.style.fontWeight = value === 'ai-decide' ? '600' : '400';
        
        // Update selected state
        dropdown.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('selected'));
        optionElement.classList.add('selected');
        
        // Close dropdown
        dropdown.classList.remove('open');
        
        // Store selected value
        dropdown.dataset.value = value;
    },
    
    async showScreen(screenName, options = {}) {
        const data = options.data || {};
        const clearHistory = options.clearHistory || false;
        
        console.log(`[APP] showScreen called: ${screenName}, screensReady: ${this.screensReady}, screens defined: ${!!this.screens}, has ${screenName}: ${!!(this.screens && this.screens[screenName])}, clearHistory: ${clearHistory}`);
        
        this.currentScreen = screenName;
        const content = document.getElementById('content');
        
        // Load document metadata for home screen
        if (screenName === 'home') {
            await this.loadDocumentMetadata();
        }
        
        if (this.screens && this.screens[screenName]) {
            content.innerHTML = this.screens[screenName]();
            content.scrollTop = 0;
            
            // Load settings if on settings screen
            if (screenName === 'settings') {
                this.loadSettingsScreen();
            }
            
            // Set up chat functionality if on chat screen
            if (screenName === 'chat-document') {
                // Only load history if NOT clearing (i.e., continuing existing chat)
                if (!clearHistory) {
                    this.setupChat();
                }
            }
            
            // Populate dropdowns if on review-setup screen (data should already be loaded)
            if (screenName === 'review-setup') {
                // Use setTimeout to ensure DOM is ready, then populate with already-loaded data
                setTimeout(() => {
                    this.updateTemplateDropdown();
                    this.updatePlaybookDropdown();
                    // Note: Button state is now handled by renderReviewScopeButtons() in template
                }, 10);
            }
            
            // Update Apply button text if on results-dashboard screen
            if (screenName === 'results-dashboard') {
                setTimeout(() => {
                    this.updateApplyButtonText();
                }, 10);
            }
        } else {
            content.innerHTML = '<div class="alert alert-warning">Screen not found: ' + screenName + '</div>';
        }
    },
    
    /**
     * Refresh the add-in and return to dashboard
     */
    async refreshAddIn() {
        console.log('[APP] Refreshing add-in...');
        
        // Clear any in-progress state
        this.currentScreen = 'home';
        
        // Reload document metadata
        await this.loadDocumentMetadata();
        
        // Navigate to home screen
        this.showScreen('home');
        
        // Silently refresh - no notification needed
    },
    
    /**
     * Navigate back to the in-progress analysis screen
     */
    returnToAnalysis() {
        if (!this.isAnalyzing) {
            this.showNotification('No review is currently running', 'info');
            return;
        }
        console.log('[APP] Returning to in-progress analysis');
        this.showScreen('analysis-progress');
        this.startProgressMessages();
    },
    
    /**
     * Cancel the currently running analysis
     */
    cancelAnalysis() {
        console.log('[APP] Cancelling in-progress analysis');
        if (this.analysisAbortController) {
            this.analysisAbortController.abort();
            this.analysisAbortController = null;
        }
        this.isAnalyzing = false;
        this.stopProgressMessages();
    },
    
    /**
     * Load the last review from localStorage
     * Includes 24-hour TTL check - expired data is automatically cleared
     * @returns {Object|null} Last review data or null if none exists
     */
    loadLastReview() {
        try {
            const lastResult = localStorage.getItem('lastAnalysisResult');
            const lastDate = localStorage.getItem('lastAnalysisDate');
            const lastTemplate = localStorage.getItem('lastTemplate');
            const lastPlaybook = localStorage.getItem('lastPlaybook');
            
            // TTL Check: Clear data older than 24 hours
            if (lastDate) {
                const age = Date.now() - new Date(lastDate).getTime();
                const TTL_24_HOURS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
                
                if (age > TTL_24_HOURS) {
                    console.log('[APP] Review data expired (>24 hours), clearing...');
                    this.clearReviewData();
                    return null; // Don't load expired data
                }
            }
            
            // Load data if not expired
            if (lastResult && lastDate) {
                return {
                    result: JSON.parse(lastResult),
                    date: new Date(lastDate),
                    template: lastTemplate || 'ai-decide',
                    playbook: lastPlaybook || 'ai-decide'
                };
            }
        } catch (error) {
            console.error('[APP] Error loading last review:', error);
        }
        return null;
    },
    
    /**
     * Restore the last review and navigate to results
     */
    async restoreLastReview() {
        const lastReview = this.loadLastReview();
        if (!lastReview) {
            this.showNotification('No previous review found', 'error');
            return;
        }
        
        console.log('[APP] Restoring last review from:', lastReview.date);
        
        // Restore the analysis result
        this.currentAnalysisResult = lastReview.result;
        
        // Restore state from localStorage (selectedChanges, lastApplyResults, etc.)
        this.loadState();
        
        // Show results screen
        this.showScreen('results-dashboard');
        
        const timeAgo = this.getTimeAgo(lastReview.date);
        this.showNotification(`Previous review from ${timeAgo} successfully restored`, 'success');
    },
    
    /**
     * Clear the last review from localStorage
     */
    clearLastReview() {
        localStorage.removeItem('lastAnalysisResult');
        localStorage.removeItem('lastAnalysisDate');
        localStorage.removeItem('lastTemplate');
        localStorage.removeItem('lastPlaybook');
        localStorage.removeItem('appliedChangeIds');
        localStorage.removeItem('failedChangeResults');
        this.lastApplyResults = null;
        this.appliedChangeIds = new Set();
        this.failedChangeResults = new Map();
        this.allChangesApplied = false;
        console.log('[APP] Cleared last review from storage');
    },
    
    // Legacy function - kept for backwards compatibility but redirects to new flow
    async applyAllRemainingChanges() {
        return this.applyAllChanges();
    },
    
    
    // Reject all recommendations (regardless of current state)
    rejectAllRecommendations() {
        if (!this.currentAnalysisResult || !this.currentAnalysisResult.changes) {
            this.showNotification('No analysis results available', 'error');
            return;
        }
        
        const totalRecommendations = this.currentAnalysisResult.changes.length;
        
        // Clear applied set and add all to rejected
        this.appliedRecommendations.clear();
        
        for (let i = 1; i <= totalRecommendations; i++) {
            this.rejectedRecommendations.add(i);
        }
        
        this.saveState();
        console.log('Rejected all recommendations');
        
        // Re-render the screen to update UI immediately
        const content = document.getElementById('content');
        if (this.screens && this.screens['results-dashboard']) {
            content.innerHTML = this.screens['results-dashboard']();
            content.scrollTop = 0;
        }
        
        this.showNotification(`Rejected all ${totalRecommendations} recommendations`, 'info');
    },
    
    toggleSection(element) {
        const content = element.nextElementSibling;
        const arrow = element.querySelector('.expand-arrow');
        
        if (content && arrow) {
            content.classList.toggle('collapsed');
            arrow.classList.toggle('collapsed');
        }
    },
    
    renderReviewScopeButtons() {
        const pinnedScope = localStorage.getItem('reviewScopePinned');
        const isPinnedSelected = pinnedScope === 'selected';
        
        // Determine order: if selected is pinned, it goes first
        const buttons = [];
        
        if (isPinnedSelected) {
            // Selected Text first (pinned), Entire Document second
            buttons.push(`
                <button class="toggle-btn active pinned" onclick="app.toggleReviewScope(this, 'selected')">
                    <span class="pin-icon tooltip" data-tooltip="Pin as default" onclick="event.stopPropagation(); app.togglePin(this.parentElement, 'selected')">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 17v5"></path>
                            <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path>
                        </svg>
                    </span>
                    <span class="toggle-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"></circle><path d="M6 3v18"></path><path d="M6 21h12a2 2 0 0 0 2-2V9l-6-6H6"></path></svg></span>
                    <span class="toggle-text">Selected Text</span>
                </button>
            `);
            buttons.push(`
                <button class="toggle-btn" onclick="app.toggleReviewScope(this, 'entire')">
                    <span class="toggle-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg></span>
                    <span class="toggle-text">Entire Document</span>
                </button>
            `);
        } else {
            // Default: Entire Document first (active), Selected Text second (with pin)
            buttons.push(`
                <button class="toggle-btn active" onclick="app.toggleReviewScope(this, 'entire')">
                    <span class="toggle-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg></span>
                    <span class="toggle-text">Entire Document</span>
                </button>
            `);
            buttons.push(`
                <button class="toggle-btn" onclick="app.toggleReviewScope(this, 'selected')">
                    <span class="pin-icon tooltip" data-tooltip="Pin as default" onclick="event.stopPropagation(); app.togglePin(this.parentElement, 'selected')">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 17v5"></path>
                            <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path>
                        </svg>
                    </span>
                    <span class="toggle-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"></circle><path d="M6 3v18"></path><path d="M6 21h12a2 2 0 0 0 2-2V9l-6-6H6"></path></svg></span>
                    <span class="toggle-text">Selected Text</span>
                </button>
            `);
        }
        
        return buttons.join('');
    },
    
    toggleReviewScope(button, scope) {
        const container = button.parentElement;
        const wasPinned = localStorage.getItem('reviewScopePinned');
        
        // Remove pinned and active class from all toggle buttons
        container.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.classList.remove('pinned');
        });
        
        // Clear pinned state from localStorage
        localStorage.removeItem('reviewScopePinned');
        
        // Add active class to clicked button
        button.classList.add('active');
        
        // Store the selected scope in app state
        this.selectedReviewScope = scope;
        console.log('[APP] Review scope changed to:', scope);
        
        // Only re-render if there was a pinned state (to update button order)
        // Otherwise, the visual update is already done
        if (wasPinned) {
            this.showScreen('review-setup');
        }
    },
    
    togglePin(button, scope) {
        const wasPinned = button.classList.contains('pinned');
        
        // Toggle pinned state
        if (!wasPinned) {
            // Pin selected text
            localStorage.setItem('reviewScopePinned', scope);
            this.selectedReviewScope = scope;
            console.log('[APP] Pinned scope:', scope);
        } else {
            // Unpin - return to default (entire document)
            localStorage.removeItem('reviewScopePinned');
            this.selectedReviewScope = 'entire';
            console.log('[APP] Unpinned, returning to default (entire)');
        }
        
        // Re-render the screen to update button order and state
        this.showScreen('review-setup');
    },
    
    toggleDropdown(element) {
        const dropdown = element;
        const isOpen = dropdown.classList.contains('open');
        
        // Close all other dropdowns
        document.querySelectorAll('.custom-select.open').forEach(el => {
            if (el !== dropdown) el.classList.remove('open');
        });
        
        // Toggle this dropdown
        dropdown.classList.toggle('open');
    },
    
    selectOption(event, optionElement, displayText, dataValue) {
        event.stopPropagation();
        
        const dropdown = optionElement.closest('.custom-select');
        const trigger = dropdown.querySelector('.custom-select-trigger span');
        
        // Update trigger text
        trigger.textContent = displayText;
        
        // Update data-value attribute
        dropdown.dataset.value = dataValue;
        console.log('[APP] Dropdown updated:', dropdown.id, '→', dataValue);
        
        // Update selected state
        dropdown.querySelectorAll('.custom-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        optionElement.classList.add('selected');
        
        // Close dropdown
        dropdown.classList.remove('open');
    },
    
    selectTemplateOption(event, optionElement, displayText, dataValue) {
        this.selectOption(event, optionElement, displayText, dataValue);
        
        // Store the selected template value
        this.selectedTemplate = dataValue;
        console.log('[APP] Template selected and stored:', dataValue);
        
        // Show/hide custom template input section
        const customSection = document.getElementById('custom-template-section');
        if (customSection) {
            customSection.style.display = dataValue === 'custom' ? 'block' : 'none';
            
            // If showing custom section, focus on the textarea
            if (dataValue === 'custom') {
                setTimeout(() => {
                    const textarea = document.getElementById('custom-template-input');
                    if (textarea) textarea.focus();
                }, 100);
            }
        }
    },
    
    selectPlaybookOption(event, optionElement, displayText, dataValue) {
        this.selectOption(event, optionElement, displayText, dataValue);
        
        // Store the selected playbook value
        this.selectedPlaybook = dataValue;
        console.log('[APP] Playbook selected and stored:', dataValue);
        
        // Show/hide custom playbook input section
        const customSection = document.getElementById('custom-playbook-section');
        if (customSection) {
            customSection.style.display = dataValue === 'custom' ? 'block' : 'none';
            
            // If showing custom section, focus on the textarea
            if (dataValue === 'custom') {
                setTimeout(() => {
                    const textarea = document.getElementById('custom-playbook-input');
                    if (textarea) textarea.focus();
                }, 100);
            }
        }
    },
    
    // Note: updateAggressiveness removed - change weight slider eliminated
    
    async startAnalysis() {
        if (this.isAnalyzing) {
            const confirmed = await this.showConfirmDialog(
                'Review In Progress',
                'A review is currently running in the background.',
                {
                    okLabel: 'Cancel & Start New',
                    cancelLabel: 'Back to Review',
                    destructive: true
                }
            );
            if (!confirmed) {
                this.returnToAnalysis();
                return;
            }
            this.cancelAnalysis();
        }
        this.isAnalyzing = true;
        this.analysisAbortController = new AbortController();
        this._analysisGeneration = (this._analysisGeneration || 0) + 1;
        const thisGeneration = this._analysisGeneration;
        try {
            console.log('[APP] Starting contract analysis (gen ' + thisGeneration + ')...');
            
            // Clear previous review before starting new one
            this.clearLastReview();
            
            // Use stored review scope (default to 'entire' if not set)
            const reviewScope = this.selectedReviewScope || 'entire';
            const isSelectedTextScope = reviewScope === 'selected';
            
            console.log('[APP] Review scope (from state):', reviewScope);
            console.log('[APP] Will analyze:', isSelectedTextScope ? 'Selected Text' : 'Entire Document');
            
            // IMPORTANT: Capture custom inputs BEFORE changing screen (DOM elements will be destroyed)
            if (this.selectedTemplate === 'custom') {
                const customInput = document.getElementById('custom-template-input');
                if (customInput) {
                    this.customTemplateInput = customInput.value.trim();
                    console.log('[APP] Captured custom template input:', this.customTemplateInput ? this.customTemplateInput.substring(0, 100) + '...' : '(empty)');
                }
            }
            if (this.selectedPlaybook === 'custom') {
                const customInput = document.getElementById('custom-playbook-input');
                if (customInput) {
                    this.customPlaybookInput = customInput.value.trim();
                    console.log('[APP] Captured custom playbook input:', this.customPlaybookInput ? this.customPlaybookInput.substring(0, 100) + '...' : '(empty)');
                }
            }

            // Validate review setup before doing document work or moving to the progress screen.
            const templateValue = this.selectedTemplate || '';
            const playbookValue = this.selectedPlaybook || '';
            if (!templateValue || !playbookValue) {
                const missing = [
                    !templateValue ? 'Template' : null,
                    !playbookValue ? 'Playbook' : null
                ].filter(Boolean).join(' and ');
                this.showNotification(`Please select a valid ${missing} before starting the review.`, 'warning');
                console.warn('[APP] Review setup incomplete:', { templateValue, playbookValue });
                return;
            }
            if (templateValue === 'custom' && !this.customTemplateInput) {
                this.showNotification('Please provide a custom Template URL or text before starting the review.', 'warning');
                console.warn('[APP] Custom template selected without input');
                return;
            }
            if (playbookValue === 'custom' && !this.customPlaybookInput) {
                this.showNotification('Please provide a custom Playbook URL or text before starting the review.', 'warning');
                console.warn('[APP] Custom playbook selected without input');
                return;
            }
            
            // Check for existing tracked changes and accept them before extraction
            const hasTrackedChanges = await officeIntegration.hasTrackedChanges();
            if (hasTrackedChanges) {
                console.log('[APP] Document has existing tracked changes - prompting user');
                const userConfirmed = await this.showConfirmDialog(
                    'Tracked Changes Detected',
                    'This document has existing tracked changes (deletions and insertions). To analyze the effective contract, these changes will be accepted first.\n\nYou can undo this afterwards with Ctrl+Z if needed.\n\nContinue?'
                );
                
                if (!userConfirmed) {
                    console.log('[APP] User cancelled analysis due to tracked changes');
                    return;
                }
                
                console.log('[APP] User confirmed - accepting all tracked changes...');
                const accepted = await officeIntegration.acceptAllTrackedChanges();
                if (!accepted) {
                    console.warn('[APP] Failed to accept tracked changes - proceeding with current document state');
                }
            }
            // Get document content based on scope
            let documentText;
            if (isSelectedTextScope) {
                documentText = await officeIntegration.getSelectedText();
                if (!documentText || documentText.trim().length === 0) {
                    this.showNotification('No text selected. Highlight text in the document first, or switch to Entire Document mode.', 'warning');
                    console.warn('[APP] Selected text review requested without selected text');
                    return;
                }
                console.log('[APP] Selected text length:', documentText.length, 'characters');
            } else {
                documentText = await officeIntegration.getDocumentContent();
                if (!documentText || documentText.trim().length === 0) {
                    this.showNotification('The document appears to be empty. Add content before starting the review.', 'warning');
                    console.warn('[APP] Entire document review requested with empty document content');
                    return;
                }
                console.log('[APP] Document length:', documentText.length, 'characters');
            }

            // Show progress only after all setup validation and document extraction succeeds.
            this.showScreen('analysis-progress');
            this.startProgressMessages();
            
            console.log('[APP] Template selection (from state):', templateValue);
            console.log('[APP] Playbook selection (from state):', playbookValue);
            if (templateValue === 'custom') {
                console.log('[APP] Custom template input:', this.customTemplateInput);
            }
            if (playbookValue === 'custom') {
                console.log('[APP] Custom playbook input:', this.customPlaybookInput);
            }
            console.log('[APP] 📄 Document text being sent to agent:');
            console.log('[APP]   - Length:', documentText.length, 'characters');
            console.log('[APP]   - First 200 chars:', documentText.substring(0, 200));
            console.log('[APP]   - Last 200 chars:', documentText.substring(documentText.length - 200));
            
            // Build analysis parameters with mutually exclusive content fields
            const params = {};
            
            // Add contract text based on scope
            if (isSelectedTextScope) {
                params.selectedText = documentText;
                console.log('[APP] Using selectedText field:', documentText.length, 'characters');
            } else {
                params.contractText = documentText;
                console.log('[APP] Using contractText field:', documentText.length, 'characters');
            }
            
            // Add template link or custom input if selected (and not 'ai-decide')
            if (templateValue && templateValue !== 'ai-decide') {
                if (templateValue === 'custom') {
                    // Use custom template input (URL or text)
                    if (this.customTemplateInput) {
                        params.customTemplateText = this.customTemplateInput;
                        console.log('[APP] Using custom template text:', this.customTemplateInput.substring(0, 100));
                    }
                } else {
                    // Use selected template URL
                    params.templateLink = templateValue;
                    console.log('[APP] Using template link:', templateValue);
                }
            }
            
            // Add playbook link or custom input if selected (and not 'ai-decide')
            if (playbookValue && playbookValue !== 'ai-decide') {
                if (playbookValue === 'custom') {
                    // Use custom playbook input (URL or text)
                    if (this.customPlaybookInput) {
                        params.customPlaybookText = this.customPlaybookInput;
                        console.log('[APP] Using custom playbook text:', this.customPlaybookInput.substring(0, 100));
                    }
                } else {
                    // Use selected playbook URL
                    params.playbookLink = playbookValue;
                    console.log('[APP] Using playbook link:', playbookValue);
                }
            }
            
            // Call Glean Redliner Agent via Lambda
            console.log('[APP] Calling Glean Redliner Agent...');
            const result = await gleanApi.redlinerAgent.analyzeContract(params, { signal: this.analysisAbortController?.signal });
            
            // Clear previous state for new analysis
            this.appliedRecommendations.clear();
            this.rejectedRecommendations.clear();
            this.commentOverrides = {};
            this.manualEdits = {};
            this.selectedChanges.clear(); // Clear change selections for new review
            this.appliedChangeIds = new Set(); // Reset cumulative applied state for new review
            this.failedChangeResults = new Map(); // Reset cumulative failed state for new review
            this.lastApplyResults = null;
            this.allChangesApplied = false; // Reset flag for new review
            localStorage.removeItem('selectedChanges');
            localStorage.removeItem('lastApplyResults');
            localStorage.removeItem('appliedChangeIds');
            localStorage.removeItem('failedChangeResults');
            this.saveState();
            
            // Store results with review scope
            this.currentAnalysisResult = result;
            this.currentAnalysisResult.reviewScope = isSelectedTextScope ? 'selected' : 'entire';
            localStorage.setItem('lastAnalysisResult', JSON.stringify(result));
            localStorage.setItem('lastAnalysisDate', new Date().toISOString());
            localStorage.setItem('lastTemplate', this.selectedTemplate || 'ai-decide');
            localStorage.setItem('lastPlaybook', this.selectedPlaybook || 'ai-decide');
            localStorage.setItem('lastReviewScope', isSelectedTextScope ? 'selected' : 'entire');
            
            console.log('[APP] Analysis complete:', result.changes?.length || 0, 'changes');
            if (result.summary) {
                console.log('[APP] Summary:', result.summary);
            }
            
            // Stop progress messages
            this.stopProgressMessages();
            
            // Show results
            this.showScreen('results-dashboard');
            
            // Warn user if agent response was truncated
            if (result.wasTruncated) {
                console.warn('[APP] Agent response was truncated — some changes may be missing');
                this.showNotification(
                    `Agent response was truncated. ${result.changes?.length || 0} changes recovered, but some may be missing. Consider re-running with a shorter document or selected text.`,
                    'warning'
                );
            }
            
        } catch (error) {
            // Abort errors are expected when user cancels — don't show error screen
            const isAbort = error.name === 'AbortError' || (error.message && error.message.toLowerCase().includes('abort'));
            if (isAbort) {
                console.log('[APP] Analysis (gen ' + thisGeneration + ') was cancelled by user');
                this.stopProgressMessages();
                return;
            }
            // Only show error if this is still the active analysis
            if (this._analysisGeneration === thisGeneration) {
                console.error('[APP] Analysis failed:', error);
                this.stopProgressMessages();
                this.lastAnalysisError = this.categorizeError(error);
                this.showScreen('analysis-error');
            } else {
                console.log('[APP] Ignoring error from stale analysis (gen ' + thisGeneration + ', current gen ' + this._analysisGeneration + ')');
            }
        } finally {
            // Only reset state if this is still the active analysis
            if (this._analysisGeneration === thisGeneration) {
                this.isAnalyzing = false;
                this.analysisAbortController = null;
            } else {
                console.log('[APP] Skipping finally cleanup for stale analysis (gen ' + thisGeneration + ')');
            }
        }
    },
    
    categorizeError(error) {
        const msg = (error?.message || '').toLowerCase();
        
        if (msg.includes('504') || msg.includes('timeout') || msg.includes('timed out')) {
            return {
                title: 'Analysis timed out',
                message: 'The analysis took too long to complete.'
            };
        }
        if (msg.includes('502') || msg.includes('503') || msg.includes('service unavailable')) {
            return {
                title: 'Service unavailable',
                message: 'The analysis service is temporarily unavailable.'
            };
        }
        if (msg.includes('truncated')) {
            return {
                title: 'Incomplete response',
                message: 'The AI response was cut off before finishing.'
            };
        }
        if (msg.includes('parse') || msg.includes('xml')) {
            return {
                title: 'Processing error',
                message: 'The AI response couldn\'t be processed.'
            };
        }
        if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
            return {
                title: 'Connection error',
                message: 'Couldn\'t reach the analysis service. Check your internet connection.'
            };
        }
        if (msg.includes('404') || msg.includes('not enough user permissions')) {
            return {
                title: 'Agent not accessible',
                message: 'The Glean agent could not be reached — either the agent ID is incorrect or your account doesn\'t have permission to use it. Please contact your administrator to verify the agent configuration and your access.'
            };
        }
        if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('forbidden')) {
            return {
                title: 'Authentication error',
                message: 'Your session may have expired. Please try signing out and back in.'
            };
        }
        return {
            title: 'Something went wrong',
            message: 'An unexpected error occurred during analysis.'
        };
    },
    
    startProgressMessages() {
        const messages = [
            'Parsing document structure',
            'Reviewing against template',
            'Applying playbook guidance',
            'Evaluating risk and compliance',
            'Identifying recommended changes',
            'Generating redline suggestions'
        ];
        
        let currentIndex = 0;
        
        // Update message immediately
        const messageEl = document.getElementById('analysis-message');
        if (messageEl) {
            messageEl.textContent = messages[0];
        }
        
        // Rotate messages every 5 seconds with fade transition
        this.progressMessageInterval = setInterval(() => {
            currentIndex = (currentIndex + 1) % messages.length;
            const messageEl = document.getElementById('analysis-message');
            if (messageEl) {
                messageEl.classList.add('fade-out');
                setTimeout(() => {
                    messageEl.textContent = messages[currentIndex];
                    messageEl.classList.remove('fade-out');
                }, 400);
            }
        }, 5000);
    },
    
    stopProgressMessages() {
        if (this.progressMessageInterval) {
            clearInterval(this.progressMessageInterval);
            this.progressMessageInterval = null;
        }
    },
    
    getTotalRecommendations() {
        return this.currentAnalysisResult?.changes?.length || 0;
    },
    
    getAppliedCount() {
        if (!this.currentAnalysisResult?.changes) return 0;
        return this.currentAnalysisResult.changes.filter(change => {
            const changeId = change.id || `change_${this.currentAnalysisResult.changes.indexOf(change) + 1}`;
            return this.getChangeStatus(changeId).status === 'applied';
        }).length;
    },
    
    getFailedCount() {
        if (!this.currentAnalysisResult?.changes) return 0;
        return this.currentAnalysisResult.changes.filter(change => {
            const changeId = change.id || `change_${this.currentAnalysisResult.changes.indexOf(change) + 1}`;
            return this.getChangeStatus(changeId).status === 'failed';
        }).length;
    },
    
    getCategoryBadge(category) {
        const badges = {
            'legal_protection': '<span class="category-badge" style="background: #dbeafe; color: #1e40af;">Legal Protection</span>',
            'compliance': '<span class="category-badge" style="background: #fef3c7; color: #92400e;">Compliance</span>',
            'missing_clause': '<span class="category-badge" style="background: #fee2e2; color: #991b1b;">Missing Clause</span>',
            'language_simplification': '<span class="category-badge" style="background: #e0e7ff; color: #3730a3;">Language</span>',
            'risk_mitigation': '<span class="category-badge" style="background: #fce7f3; color: #831843;">Risk Mitigation</span>'
        };
        return badges[category] || '<span class="category-badge" style="background: #f3f4f6; color: #374151;">Other</span>';
    },
    
    generateRecommendationsList() {
        if (!this.currentAnalysisResult || !this.currentAnalysisResult.changes) {
            return '<div class="alert alert-warning">No recommendations available</div>';
        }
        
        const changes = this.currentAnalysisResult.changes;
        
        return changes.map((change, index) => {
            const recNumber = index + 1;
            const status = this.getRecommendationStatus(recNumber);
            const statusIcon = status === 'applied' 
                ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
                : status === 'rejected'
                ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'
                : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="7" x2="12" y2="13"></line><circle cx="12" cy="16.5" r="0.8" fill="currentColor"></circle></svg>';
            
            const title = change.reason || `Change ${recNumber}`;
            const preview = change.reason || 'No description available';
            
            return `
                <div class="issue-item issue-${status}" onclick="app.viewRecommendation(${recNumber})">
                    <div class="issue-header">
                        <div class="issue-number">${recNumber}</div>
                        <div class="issue-title" title="${title}">${title}</div>
                        <div class="issue-status-icon" title="${status === 'applied' ? 'Applied' : status === 'rejected' ? 'Rejected' : 'Pending'}">
                            ${statusIcon}
                        </div>
                    </div>
                    <div class="issue-location">${this.getCategoryBadge(change.category)} ${change.type}</div>
                    <div class="issue-preview">${preview.substring(0, 150)}${preview.length > 150 ? '...' : ''}</div>
                </div>
            `;
        }).join('');
    },
    
    /**
     * Show a notification toast (Office-compatible replacement for alert)
     * @param {string} message - Message to display
     * @param {string} type - 'success', 'error', 'info', 'warning'
     */
    showNotification(message, type = 'info') {
        // Remove any existing notifications
        const existing = document.querySelector('.notification-toast');
        if (existing) {
            existing.remove();
        }
        
        // Icon SVGs for different notification types
        const icons = {
            success: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
            error: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
            warning: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
            info: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
        };
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification-toast ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-icon">${icons[type] || icons.info}</div>
                <span class="notification-message">${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        // Add to document
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.classList.add('fade-out');
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
    },
    
    /**
     * Show a confirmation dialog (Office-compatible replacement for confirm)
     * @param {string} title - Dialog title
     * @param {string} message - Message to display
     * @returns {Promise<boolean>} - True if confirmed, false if cancelled
     */
    showConfirmDialog(title, message, options = {}) {
        const okLabel = options.okLabel || 'OK';
        const cancelLabel = options.cancelLabel || 'Cancel';
        const destructive = options.destructive || false;
        return new Promise((resolve) => {
            // Remove any existing dialogs
            const existing = document.querySelector('.confirm-dialog-overlay');
            if (existing) {
                existing.remove();
            }
            
            // Create dialog overlay
            const overlay = document.createElement('div');
            overlay.className = 'confirm-dialog-overlay';
            overlay.innerHTML = `
                <div class="confirm-dialog">
                    <div class="confirm-dialog-header">
                        <h3>${title}</h3>
                    </div>
                    <div class="confirm-dialog-body">
                        <p>${message.replace(/\n/g, '<br>')}</p>
                    </div>
                    <div class="confirm-dialog-footer">
                        <button class="btn-secondary confirm-cancel">${cancelLabel}</button>
                        <button class="${destructive ? 'btn-danger' : 'btn-primary'} confirm-ok">${okLabel}</button>
                    </div>
                </div>
            `;
            
            // Add to document
            document.body.appendChild(overlay);
            
            // Handle button clicks
            const okBtn = overlay.querySelector('.confirm-ok');
            const cancelBtn = overlay.querySelector('.confirm-cancel');
            
            const cleanup = () => {
                overlay.classList.add('fade-out');
                setTimeout(() => overlay.remove(), 300);
            };
            
            okBtn.addEventListener('click', () => {
                cleanup();
                resolve(true);
            });
            
            cancelBtn.addEventListener('click', () => {
                cleanup();
                resolve(false);
            });
            
            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    cleanup();
                    resolve(false);
                }
            });
        });
    },
    
    setupChat() {
        console.log('Setting up chat...');
        const input = document.querySelector('.chat-input');
        const sendBtn = document.querySelector('.chat-send-btn');
        
        console.log('Input found:', !!input);
        console.log('Send button found:', !!sendBtn);
        
        if (!input || !sendBtn) {
            console.error('Chat elements not found!');
            return;
        }
        
        const sendMessage = async () => {
            const message = input.value.trim();
            if (!message) {
                console.log('[APP] Send message called with empty input - ignoring');
                return;
            }
            
            console.log('[APP] Send message called');
            
            // Add user message
            const messagesContainer = document.querySelector('.chat-messages');
            const userMessage = document.createElement('div');
            userMessage.className = 'chat-message user';
            userMessage.innerHTML = `
                <div class="chat-bubble">
                    <div class="chat-text">${message}</div>
                </div>
                <div class="chat-avatar">👤</div>
            `;
            messagesContainer.appendChild(userMessage);
            
            // Clear input
            input.value = '';
            
            // Add loading message
            const loadingMessage = document.createElement('div');
            loadingMessage.className = 'chat-message agent';
            loadingMessage.innerHTML = `
                <div class="chat-avatar"><img src="../assets/GLN_logo-icon-Primary.png" alt="Glean" style="width: 24px; height: 24px;"></div>
                <div class="chat-bubble">
                    <div class="chat-loading">
                        <div class="loading-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                        <div class="loading-text">Analyzing document...</div>
                    </div>
                </div>
            `;
            messagesContainer.appendChild(loadingMessage);
            
            // Scroll to bottom
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            
            try {
                // Get document content
                const documentContent = await officeIntegration.getDocumentContent();
                
                // Call Chat Agent
                const response = await gleanApi.chatAgent.sendMessage(message, documentContent);
                
                // Remove loading message
                loadingMessage.remove();
                
                // Add agent response
                const agentMessage = document.createElement('div');
                agentMessage.className = 'chat-message agent';
                agentMessage.innerHTML = `
                    <div class="chat-avatar"><img src="../assets/GLN_logo-icon-Primary.png" alt="Glean" style="width: 24px; height: 24px;"></div>
                    <div class="chat-bubble">
                        <div class="chat-text">${response.reply}</div>
                    </div>
                `;
                messagesContainer.appendChild(agentMessage);
                
                // Scroll to bottom
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            } catch (error) {
                console.error('[APP] Chat error:', error);
                
                // Remove loading message
                loadingMessage.remove();
                
                // Show error message
                const errorMessage = document.createElement('div');
                errorMessage.className = 'chat-message agent';
                errorMessage.innerHTML = `
                    <div class="chat-avatar"><img src="../assets/GLN_logo-icon-Primary.png" alt="Glean" style="width: 24px; height: 24px;"></div>
                    <div class="chat-bubble">
                        <div class="chat-text" style="color: #d32f2f;">
                            Error: ${error.message}
                        </div>
                    </div>
                `;
                messagesContainer.appendChild(errorMessage);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        };
        
        // Initialize send button state
        sendBtn.disabled = true;
        
        // Enable/disable send button based on input
        input.addEventListener('input', () => {
            sendBtn.disabled = !input.value.trim();
        });
        
        sendBtn.addEventListener('click', sendMessage);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && input.value.trim()) {
                sendMessage();
            }
        });
    },
    
    // Track Changes Functions
    /**
     * Generate category breakdown for results dashboard
     */
    generateCategoryBreakdown() {
        if (!this.currentAnalysisResult || !this.currentAnalysisResult.changes) {
            return '<div class="empty-state">No changes to display</div>';
        }
        
        // Count changes by category and type
        const categoryData = {};
        this.currentAnalysisResult.changes.forEach(change => {
            const category = change.category || 'general';
            if (!categoryData[category]) {
                categoryData[category] = { total: 0, types: {} };
            }
            categoryData[category].total++;
            const type = change.type || 'unknown';
            categoryData[category].types[type] = (categoryData[category].types[type] || 0) + 1;
        });
        
        // Category display names and icons
        const categoryInfo = {
            'legal_protection': { name: 'Legal Protection', icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>', color: '#dc2626' },
            'compliance': { name: 'Compliance', icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>', color: '#2563eb' },
            'risk_mitigation': { name: 'Risk Mitigation', icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>', color: '#ea580c' },
            'language_simplification': { name: 'Language', icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>', color: '#16a34a' },
            'general': { name: 'General', icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle></svg>', color: '#6b7280' }
        };
        
        // Type display names and colors
        const typeInfo = {
            'replace': { name: 'Replace', bgColor: '#dbeafe', textColor: '#1e40af' },
            'delete': { name: 'Delete', bgColor: '#fee2e2', textColor: '#991b1b' },
            'insert': { name: 'Insert', bgColor: '#d1fae5', textColor: '#065f46' },
            'insertClause': { name: 'Insert', bgColor: '#d1fae5', textColor: '#065f46' }
        };
        
        return Object.entries(categoryData)
            .map(([category, data]) => {
                const info = categoryInfo[category] || categoryInfo.general;
                
                // Build type breakdown as pill badges
                const typeBreakdown = Object.entries(data.types)
                    .map(([type, count]) => {
                        const typeStyle = typeInfo[type] || { name: type, bgColor: '#f3f4f6', textColor: '#6b7280' };
                        return `<span class="type-pill" style="background-color: ${typeStyle.bgColor}; color: ${typeStyle.textColor};">${typeStyle.name} ${count}</span>`;
                    })
                    .join('');
                
                return `
                    <div class="category-item-compact">
                        <span class="category-badge-compact" style="background-color: ${info.color}20; color: ${info.color};">
                            ${info.icon} ${info.name}
                        </span>
                        <div class="category-types">${typeBreakdown}</div>
                        <span class="category-total">${data.total}</span>
                    </div>
                `;
            })
            .join('');
    },
    
    /**
     * Get the status of a change (applied, failed, or pending)
     */
    getChangeStatus(changeId) {
        // Status is driven by the cumulative per-redline state, which accumulates across
        // every single/bulk apply rather than a single one-shot batch.
        if (this.appliedChangeIds.has(changeId)) {
            return { status: 'applied', reason: null };
        }
        if (this.failedChangeResults.has(changeId)) {
            const failure = this.failedChangeResults.get(changeId);
            return { status: 'failed', reason: (failure && failure.reason) || 'Unknown error' };
        }
        return { status: 'pending', reason: null };
    },

    /**
     * A redline is "finalized" once it has been attempted (success or failure).
     * Finalized redlines are terminal: they cannot be re-applied or re-selected.
     */
    isChangeFinalized(changeId) {
        return this.appliedChangeIds.has(changeId) || this.failedChangeResults.has(changeId);
    },

    /**
     * Number of redlines that have not yet been attempted (still actionable).
     */
    getRemainingCount() {
        if (!this.currentAnalysisResult?.changes) return 0;
        return this.currentAnalysisResult.changes.filter((change, index) => {
            const changeId = change.id || `change_${index + 1}`;
            return !this.isChangeFinalized(changeId);
        }).length;
    },

    /**
     * IDs that are currently selected AND still actionable (not finalized).
     */
    getActiveSelectedIds() {
        return [...this.selectedChanges].filter(id => !this.isChangeFinalized(id));
    },

    /**
     * Merge a batch ApplyResult (or single-change outcome) into the cumulative
     * per-redline state, drop finalized ids from the selection, and persist.
     */
    recordApplyResults(results) {
        this.lastApplyResults = results; // retained for legacy screens
        (results.applied || []).forEach(changeId => {
            this.appliedChangeIds.add(changeId);
            this.failedChangeResults.delete(changeId);
            this.selectedChanges.delete(changeId);
        });
        (results.failed || []).forEach(failure => {
            const changeId = failure.changeId;
            if (!changeId) return;
            if (!this.appliedChangeIds.has(changeId)) {
                this.failedChangeResults.set(changeId, {
                    reason: failure.reason || 'Unknown error',
                    diagnostics: failure.diagnostics || null
                });
            }
            this.selectedChanges.delete(changeId);
        });
        this.allChangesApplied = this.getRemainingCount() === 0;
        this.saveState();
        this.persistAnalysisResult();
    },

    /**
     * Persist the current (possibly edited) analysis result so a reload restores
     * edits + finalized state consistently.
     */
    persistAnalysisResult() {
        try {
            if (this.currentAnalysisResult) {
                localStorage.setItem('lastAnalysisResult', JSON.stringify(this.currentAnalysisResult));
            }
        } catch (error) {
            console.warn('[APP] Failed to persist analysis result:', error);
        }
    },
    
    /**
     * Generate detailed list of all changes (expandable with editable text)
     */
    generateChangeDetailsList() {
        if (!this.currentAnalysisResult || !this.currentAnalysisResult.changes) {
            return '<div class="empty-state">No changes to display</div>';
        }
        
        return this.currentAnalysisResult.changes
            .map((change, index) => {
                const categoryBadge = this.getCategoryBadge(change.category);
                const changeId = change.id || `change_${index + 1}`;
                
                // Get change status
                const changeStatus = this.getChangeStatus(changeId);
                
                // Determine labels and content based on change type
                let leftLabel = '';
                let leftText = '';
                let rightLabel = '';
                let rightText = '';
                let showTwoColumns = true;
                let changeIcon = '';
                
                switch (change.type) {
                    case 'replace':
                        leftLabel = 'Original Text';
                        leftText = change.searchText || '';
                        rightLabel = 'Replacement Text';
                        rightText = change.replaceWith || '';
                        showTwoColumns = true;
                        changeIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>';
                        break;
                    case 'insert':
                        leftLabel = 'Text to Insert';
                        leftText = change.insertText || '';
                        rightLabel = 'Insert After';
                        rightText = change.afterText || 'N/A';
                        showTwoColumns = true;
                        changeIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
                        break;
                    case 'delete':
                        leftLabel = 'Text to Delete';
                        leftText = change.searchText || '';
                        rightLabel = '';
                        rightText = '';
                        showTwoColumns = false;
                        changeIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
                        break;
                    case 'insertClause':
                        leftLabel = 'Clause to Insert';
                        leftText = change.clauseContent || '';
                        rightLabel = 'Insert After Section';
                        rightText = change.afterSection || 'N/A';
                        showTwoColumns = true;
                        changeIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>';
                        break;
                    default:
                        leftLabel = 'Content';
                        leftText = 'N/A';
                        rightLabel = '';
                        rightText = '';
                        showTwoColumns = false;
                        changeIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
                }
                
                // Escape HTML for display
                const escapeHtml = (text) => {
                    const div = document.createElement('div');
                    div.textContent = text;
                    return div.innerHTML;
                };
                
                // Generate status badge HTML
                let statusBadgeHtml = '';
                if (changeStatus.status === 'applied') {
                    statusBadgeHtml = '<span class="change-status-badge status-applied"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Applied</span>';
                } else if (changeStatus.status === 'failed') {
                    statusBadgeHtml = '<span class="change-status-badge status-failed"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Failed</span>';
                }
                
                // Generate failure alert HTML for expanded view
                let failureAlertHtml = '';
                if (changeStatus.status === 'failed') {
                    failureAlertHtml = `
                        <div class="failure-alert">
                            <div class="failure-alert-header">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="8" x2="12" y2="12"></line>
                                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                </svg>
                                <strong>This change could not be applied automatically</strong>
                            </div>
                            <div class="failure-alert-reason">
                                <strong>Reason:</strong> ${escapeHtml(changeStatus.reason)}
                            </div>
                            <div class="failure-alert-action">
                                This redline is closed for automatic apply. Use "Navigate to change" above to locate the text and apply it manually in the document.
                            </div>
                        </div>
                    `;
                }
                
                // Finalized = attempted (success or failure) and therefore terminal
                const isApplied = changeStatus.status === 'applied';
                const isFailed = changeStatus.status === 'failed';
                const finalized = isApplied || isFailed;
                
                // Card styling: gray out finalized redlines, accent applied vs failed
                let itemClass = 'change-detail-item clickable-change';
                if (isApplied) itemClass += ' item-applied finalized';
                else if (isFailed) itemClass += ' item-failed finalized';
                
                // Selection: applied shows as checked; finalized cards are not toggleable
                const isSelected = this.selectedChanges.has(changeId) || isApplied;
                const isDisabled = finalized;
                const checkboxTitle = isApplied
                    ? 'Applied. This redline has been applied to the document.'
                    : (isFailed
                        ? 'This redline was attempted and cannot be re-applied here.'
                        : (isSelected ? 'Click to deselect this redline' : 'Click to select this redline for application'));
                
                return `
                    <div class="${itemClass}" data-change-id="${changeId}">
                        <div class="change-detail-header" onclick="app.toggleChangeDetail('${changeId}')">
                            <div class="change-header-top">
                                <span class="change-expand-arrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></span>
                                <span class="change-number">#${index + 1}</span>
                                ${statusBadgeHtml}
                                <div class="change-header-info">
                                    <div class="change-title">${escapeHtml(change.reason || 'No description provided')}</div>
                                    <div class="change-meta">
                                        ${categoryBadge}
                                        <span class="change-type-badge">${change.type}</span>
                                    </div>
                                </div>
                                <div class="change-select-checkbox ${isSelected ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}" 
                                     onclick="event.stopPropagation(); app.toggleChangeSelection('${changeId}')" 
                                     title="${checkboxTitle}"
                                     data-change-id="${changeId}">
                                </div>
                            </div>
                            <div class="change-header-bottom">
                                <a class="navigate-link" onclick="event.stopPropagation(); app.navigateToChange('${changeId}')" title="Navigate to this change in the document">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                        <circle cx="12" cy="10" r="3"></circle>
                                    </svg>
                                    Navigate to change
                                </a>
                            </div>
                        </div>
                        <div class="change-detail-body collapsed">
                            ${failureAlertHtml}
                            <div class="change-text-section">
                                <div class="change-text-label">
                                    <div class="label-text-wrapper">
                                        <span class="change-icon">${changeIcon}</span>
                                        <span class="label-text">${leftLabel}:</span>
                                    </div>
                                    ${((change.type === 'insert' || change.type === 'insertClause') && !finalized) ? `
                                        <button class="btn-edit-inline" onclick="app.toggleEditMode('${changeId}', 'left')" data-change-id="${changeId}" data-column="left">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                            </svg>
                                            Edit
                                        </button>
                                    ` : ''}
                                </div>
                                <div class="change-text-display ${change.type === 'delete' ? 'delete-text' : 'primary-text'}" data-change-id="${changeId}" data-column="left">${escapeHtml(leftText)}</div>
                                ${(change.type === 'insert' || change.type === 'insertClause') ? `
                                    <textarea class="change-text-edit hidden" data-change-id="${changeId}" data-column="left" rows="4">${escapeHtml(leftText)}</textarea>
                                    <div class="edit-actions hidden" data-change-id="${changeId}" data-column="left">
                                        <button class="btn btn-sm btn-secondary" onclick="app.cancelEditChange('${changeId}', 'left')">Cancel</button>
                                        <button class="btn btn-sm btn-primary" onclick="app.saveEditChange('${changeId}', 'left')">Save</button>
                                    </div>
                                ` : ''}
                            </div>
                            ${showTwoColumns ? `
                                <div class="change-text-section ${change.type === 'insert' || change.type === 'insertClause' ? 'context-section' : ''}">
                                    <div class="change-text-label">
                                        <span class="label-text">${rightLabel}:</span>
                                        ${(change.type === 'replace' && !finalized) ? `
                                            <button class="btn-edit-inline" onclick="app.toggleEditMode('${changeId}', 'right')" data-change-id="${changeId}" data-column="right">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                                </svg>
                                                Edit
                                            </button>
                                        ` : ''}
                                    </div>
                                    <div class="change-text-display ${change.type === 'insert' || change.type === 'insertClause' ? 'context-text' : 'secondary-text'}" data-change-id="${changeId}" data-column="right">${escapeHtml(rightText)}</div>
                                    ${change.type === 'replace' ? `
                                        <textarea class="change-text-edit hidden" data-change-id="${changeId}" data-column="right" rows="4">${escapeHtml(rightText)}</textarea>
                                        <div class="edit-actions hidden" data-change-id="${changeId}" data-column="right">
                                            <button class="btn btn-sm btn-secondary" onclick="app.cancelEditChange('${changeId}', 'right')">Cancel</button>
                                            <button class="btn btn-sm btn-primary" onclick="app.saveEditChange('${changeId}', 'right')">Save</button>
                                        </div>
                                    ` : ''}
                                </div>
                            ` : ''}
                            ${change.reason ? `
                                <div class="change-reasoning-section">
                                    <div class="change-reasoning-label">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="12" cy="12" r="10"></circle>
                                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                        </svg>
                                        <span class="label-text">REASONING:</span>
                                    </div>
                                    <div class="change-reasoning-text">${escapeHtml(change.reason)}</div>
                                </div>
                            ` : ''}
                            ${!finalized ? `
                                <div class="change-apply-row">
                                    <button class="btn-apply-single" data-change-id="${changeId}" onclick="event.stopPropagation(); app.applySingleChange('${changeId}')" title="Apply just this redline to the document">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <polyline points="20 6 9 17 4 12"></polyline>
                                        </svg>
                                        Apply this redline
                                    </button>
                                </div>
                            ` : (isApplied ? `
                                <div class="change-applied-note">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                    Applied to the document
                                </div>
                            ` : '')}
                        </div>
                    </div>
                `;
            })
            .join('');
    },
    
    /**
     * Toggle change detail expansion
     */
    toggleChangeDetail(changeId) {
        const item = document.querySelector(`.change-detail-item[data-change-id="${changeId}"]`);
        if (!item) return;
        
        const body = item.querySelector('.change-detail-body');
        const arrow = item.querySelector('.change-expand-arrow');
        
        if (body.classList.contains('collapsed')) {
            body.classList.remove('collapsed');
            arrow.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
        } else {
            body.classList.add('collapsed');
            arrow.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
        }
    },
    
    /**
     * Toggle change selection for application
     */
    toggleChangeSelection(changeId) {
        // Finalized redlines are terminal — they can't be re-selected
        if (this.isChangeFinalized(changeId)) {
            return;
        }
        
        // Toggle selection in Set
        if (this.selectedChanges.has(changeId)) {
            this.selectedChanges.delete(changeId);
        } else {
            this.selectedChanges.add(changeId);
        }
        
        // Update checkbox visual state
        const checkbox = document.querySelector(`.change-select-checkbox[data-change-id="${changeId}"]`);
        if (checkbox) {
            if (this.selectedChanges.has(changeId)) {
                checkbox.classList.add('checked');
                checkbox.title = 'Click to deselect this redline';
            } else {
                checkbox.classList.remove('checked');
                checkbox.title = 'Click to select this redline for application';
            }
        }
        
        // Persist selection and update the apply button + summary counts
        this.saveState();
        this.updateApplyButtonText();
        this.updateResultsSummary();
        
        console.log(`[APP] Change ${changeId} ${this.selectedChanges.has(changeId) ? 'selected' : 'deselected'}. Total selected: ${this.selectedChanges.size}`);
    },
    
    /**
     * Update Apply All Changes button text to show selection count
     */
    updateApplyButtonText() {
        // Only manage the apply button on the dashboard that actually lists changes.
        // (The no-changes success variant reuses .btn-action.btn-primary for "Back to Home".)
        if (!this.currentAnalysisResult?.changes?.length) return;
        if (!document.querySelector('.change-details-list')) return;
        
        const applyBtn = document.querySelector('.btn-action.btn-primary');
        if (!applyBtn) return;
        
        const iconSvg = applyBtn.querySelector('svg');
        const remaining = this.getRemainingCount();
        
        // Everything has been attempted — nothing left to apply
        if (remaining === 0) {
            applyBtn.innerHTML = (iconSvg ? iconSvg.outerHTML : '') + ' All Changes Applied';
            applyBtn.disabled = true;
            applyBtn.classList.add('disabled');
            applyBtn.title = 'All redlines have been applied. Run a new review to generate more.';
            return;
        }
        
        const selectedCount = this.getActiveSelectedIds().length;
        
        // Update button text based on the active (non-finalized) selection
        if (selectedCount === 0) {
            applyBtn.innerHTML = (iconSvg ? iconSvg.outerHTML : '') + ' Apply Selected';
            applyBtn.disabled = true;
            applyBtn.classList.add('disabled');
            applyBtn.title = 'Select at least one redline to apply, or apply one directly from its card.';
        } else if (selectedCount === remaining) {
            applyBtn.innerHTML = (iconSvg ? iconSvg.outerHTML : '') + ` Apply All ${remaining} Remaining`;
            applyBtn.disabled = false;
            applyBtn.classList.remove('disabled');
            applyBtn.title = 'Apply all remaining selected redlines to the document';
        } else {
            applyBtn.innerHTML = (iconSvg ? iconSvg.outerHTML : '') + ` Apply ${selectedCount} Selected`;
            applyBtn.disabled = false;
            applyBtn.classList.remove('disabled');
            applyBtn.title = `Apply ${selectedCount} selected redline${selectedCount !== 1 ? 's' : ''} to the document`;
        }
    },
    
    /**
     * Update the results summary stats + selection header in place (no full re-render).
     */
    updateResultsSummary() {
        const appliedEl = document.getElementById('stat-applied');
        if (appliedEl) appliedEl.textContent = this.getAppliedCount();
        const failedEl = document.getElementById('stat-failed');
        if (failedEl) failedEl.textContent = this.getFailedCount();
        const remainingEl = document.getElementById('stat-remaining');
        if (remainingEl) remainingEl.textContent = this.getRemainingCount();
        
        // Toggle success/error emphasis on the stat boxes
        const appliedBox = document.getElementById('stat-applied-box');
        if (appliedBox) appliedBox.classList.toggle('stat-success', this.getAppliedCount() > 0);
        const failedBox = document.getElementById('stat-failed-box');
        if (failedBox) failedBox.classList.toggle('stat-error', this.getFailedCount() > 0);
        
        // Selection / remaining label
        const selLabel = document.getElementById('changes-selected-label');
        if (selLabel) {
            const sel = this.getActiveSelectedIds().length;
            selLabel.textContent = `${sel} selected · ${this.getRemainingCount()} remaining`;
        }
        
        // Disable bulk-selection controls when nothing remains
        const remaining = this.getRemainingCount();
        document.querySelectorAll('.changes-bulk-btn').forEach(b => { b.disabled = remaining === 0; });
    },
    
    /**
     * Re-render the change list in place after an apply, preserving which cards
     * are expanded and the scroll position, then refresh stats + the apply button.
     */
    refreshResultsView() {
        const list = document.querySelector('.change-details-list');
        if (!list) {
            // List not mounted (e.g. user navigated away) — nothing to refresh
            return;
        }
        
        // Capture currently expanded cards
        const expanded = new Set();
        document.querySelectorAll('.change-detail-item').forEach(item => {
            const body = item.querySelector('.change-detail-body');
            if (body && !body.classList.contains('collapsed')) {
                expanded.add(item.getAttribute('data-change-id'));
            }
        });
        
        // Re-render the list
        list.innerHTML = this.generateChangeDetailsList();
        
        // Restore expansion state
        const downChevron = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
        expanded.forEach(id => {
            const item = document.querySelector(`.change-detail-item[data-change-id="${id}"]`);
            if (!item) return;
            const body = item.querySelector('.change-detail-body');
            const arrow = item.querySelector('.change-expand-arrow');
            if (body) body.classList.remove('collapsed');
            if (arrow) arrow.innerHTML = downChevron;
        });
        
        this.updateResultsSummary();
        this.updateApplyButtonText();
    },
    
    /**
     * Select all changes
     */
    selectAllChanges() {
        if (!this.currentAnalysisResult || !this.currentAnalysisResult.changes) return;
        
        if (this.getRemainingCount() === 0) {
            this.showNotification('All redlines have been applied. Run a new review to generate more.', 'warning');
            return;
        }
        
        // Select every redline that is still actionable (not finalized)
        this.currentAnalysisResult.changes.forEach((change, index) => {
            const changeId = change.id || `change_${index + 1}`;
            if (!this.isChangeFinalized(changeId)) {
                this.selectedChanges.add(changeId);
            }
        });
        
        this.saveState();
        // Re-render to update all checkboxes
        this.showScreen('results-dashboard');
    },
    
    /**
     * Deselect all changes
     */
    deselectAllChanges() {
        this.selectedChanges.clear();
        this.saveState();
        
        // Re-render to update all checkboxes
        this.showScreen('results-dashboard');
    },
    
    /**
     * Toggle edit mode for a change text field
     */
    toggleEditMode(changeId, column) {
        // Prevent editing once this redline has been attempted (terminal)
        if (this.isChangeFinalized(changeId)) {
            this.showNotification('This redline has already been applied and can no longer be edited.', 'warning');
            return;
        }
        
        const displayEl = document.querySelector(`.change-text-display[data-change-id="${changeId}"][data-column="${column}"]`);
        const editEl = document.querySelector(`.change-text-edit[data-change-id="${changeId}"][data-column="${column}"]`);
        const actionsEl = document.querySelector(`.edit-actions[data-change-id="${changeId}"][data-column="${column}"]`);
        const editBtn = document.querySelector(`.btn-edit-inline[data-change-id="${changeId}"][data-column="${column}"]`);
        
        if (!displayEl || !editEl || !actionsEl || !editBtn) {
            console.warn('[APP] Could not find edit elements for', changeId, column);
            return;
        }
        
        // Enter edit mode
        displayEl.classList.add('hidden');
        editEl.classList.remove('hidden');
        actionsEl.classList.remove('hidden');
        editBtn.classList.add('hidden');
        
        // Focus the textarea
        editEl.focus();
    },
    
    /**
     * Cancel editing a change
     * @param {string} changeId - ID of the change
     * @param {string} column - 'left' or 'right' column
     */
    cancelEditChange(changeId, column) {
        const displayEl = document.querySelector(`.change-text-display[data-change-id="${changeId}"][data-column="${column}"]`);
        const editEl = document.querySelector(`.change-text-edit[data-change-id="${changeId}"][data-column="${column}"]`);
        const actionsEl = document.querySelector(`.edit-actions[data-change-id="${changeId}"][data-column="${column}"]`);
        const editBtn = document.querySelector(`.btn-edit-inline[data-change-id="${changeId}"][data-column="${column}"]`);
        
        if (!displayEl || !editEl || !actionsEl || !editBtn) return;
        
        // Reset textarea to original value
        const change = this.currentAnalysisResult.changes.find(c => (c.id || `change_${this.currentAnalysisResult.changes.indexOf(c) + 1}`) === changeId);
        if (change) {
            let originalText = '';
            switch (change.type) {
                case 'replace':
                    // For replace, we edit the replacement text (right column)
                    originalText = change.replaceWith || '';
                    break;
                case 'insert':
                    // For insert, we edit the insert text (left column)
                    originalText = change.insertText || '';
                    break;
                case 'insertClause':
                    // For insertClause, we edit the clause content (left column)
                    originalText = change.clauseContent || '';
                    break;
            }
            editEl.value = originalText;
        }
        
        // Exit edit mode
        displayEl.classList.remove('hidden');
        editEl.classList.add('hidden');
        actionsEl.classList.add('hidden');
        editBtn.classList.remove('hidden');
    },
    
    /**
     * Save edited change text
     * @param {string} changeId - ID of the change
     * @param {string} column - 'left' or 'right' column
     */
    saveEditChange(changeId, column) {
        const displayEl = document.querySelector(`.change-text-display[data-change-id="${changeId}"][data-column="${column}"]`);
        const editEl = document.querySelector(`.change-text-edit[data-change-id="${changeId}"][data-column="${column}"]`);
        const actionsEl = document.querySelector(`.edit-actions[data-change-id="${changeId}"][data-column="${column}"]`);
        const editBtn = document.querySelector(`.btn-edit-inline[data-change-id="${changeId}"][data-column="${column}"]`);
        
        if (!displayEl || !editEl || !actionsEl || !editBtn) return;
        
        const newValue = editEl.value;
        
        // Update the change in currentAnalysisResult
        const change = this.currentAnalysisResult.changes.find(c => (c.id || `change_${this.currentAnalysisResult.changes.indexOf(c) + 1}`) === changeId);
        if (change && change.type !== 'delete') {
            // Update the appropriate field based on change type
            switch (change.type) {
                case 'replace':
                    // For replace, we edit the replacement text (right column)
                    change.replaceWith = newValue;
                    break;
                case 'insert':
                    // For insert, we edit the insert text (left column)
                    change.insertText = newValue;
                    break;
                case 'insertClause':
                    // For insertClause, we edit the clause content (left column)
                    change.clauseContent = newValue;
                    break;
            }
            
            // Update display
            const escapeHtml = (text) => {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            };
            displayEl.innerHTML = escapeHtml(newValue);
            
            // Persist the edit so a reload restores it (and a later apply uses it)
            this.persistAnalysisResult();
        }
        
        // Exit edit mode
        displayEl.classList.remove('hidden');
        editEl.classList.add('hidden');
        actionsEl.classList.add('hidden');
        editBtn.classList.remove('hidden');
        
        // Show confirmation
        this.showNotification('Change updated', 'success');
    },
    
    /**
     * Generate list of failed changes
     */
    generateFailedChangesList() {
        if (!this.lastApplyResults || !this.lastApplyResults.failed || this.lastApplyResults.failed.length === 0) {
            return '';
        }
        
        return this.lastApplyResults.failed
            .map(failure => `
                <div class="failed-change-item">
                    <strong>Change ${failure.changeId}:</strong> ${failure.reason}
                </div>
            `)
            .join('');
    },
    
    /**
     * Apply all changes as tracked changes
     */
    async applyAllChanges() {
        // Back-compat alias — the bottom button now applies the active selection.
        return this.applySelectedChanges();
    },

    /**
     * Apply a single redline on its own, in place, without leaving the results list.
     * Uses the change's current (possibly edited) text. Terminal: the redline is
     * finalized whether the attempt succeeds or fails.
     */
    async applySingleChange(changeId) {
        if (this.isApplyingChanges) {
            this.showNotification('Another change is still being applied. Please wait.', 'warning');
            return;
        }
        if (this.isChangeFinalized(changeId)) {
            return; // Already attempted — terminal
        }

        const change = this.currentAnalysisResult?.changes?.find((c, index) =>
            (c.id || `change_${index + 1}`) === changeId
        );
        if (!change) {
            this.showNotification('Change not found', 'error');
            return;
        }

        // Inline button feedback (no screen navigation)
        const btn = document.querySelector(`.btn-apply-single[data-change-id="${changeId}"]`);
        let originalBtnHtml = null;
        if (btn) {
            originalBtnHtml = btn.innerHTML;
            btn.disabled = true;
            btn.classList.add('applying');
            btn.innerHTML = '<span class="btn-spinner-sm"></span> Applying...';
        }

        this.isApplyingChanges = true;
        try {
            const { trackChangesService } = await import('../services/trackChangesService.js');
            const { TrackedChange } = await import('../models/changeModels.js');

            const tracked = new TrackedChange(change);
            tracked.validate();

            await trackChangesService.enableTrackChanges();
            const result = await trackChangesService.applyChangeAsTracked(tracked);

            if (result && result.success) {
                this.recordApplyResults({ applied: [changeId], failed: [] });
                this.showNotification('Redline applied to the document.', 'success');
            } else {
                const reason = (result && result.error) || 'Unknown error';
                this.recordApplyResults({ applied: [], failed: [{ changeId, reason }] });
                this.showNotification(`This redline could not be applied automatically: ${reason}`, 'warning');
            }
        } catch (error) {
            console.error(`[APP] Error applying single change ${changeId}:`, error);
            this.recordApplyResults({ applied: [], failed: [{ changeId, reason: error.message || 'Unexpected error' }] });
            this.showNotification(`This redline could not be applied: ${error.message || 'Unexpected error'}`, 'warning');
        } finally {
            this.isApplyingChanges = false;
            // Reflect the finalized state in place (preserves expansion + scroll)
            this.refreshResultsView();
            if (btn && document.body.contains(btn) && originalBtnHtml !== null) {
                // Card was not re-rendered (defensive) — restore button
                btn.disabled = false;
                btn.classList.remove('applying');
                btn.innerHTML = originalBtnHtml;
            }
        }
    },

    /**
     * Apply the currently selected (and still-actionable) redlines as a batch.
     * Repeatable: only operates on non-finalized selected redlines, accumulates
     * results, and leaves any remaining redlines applicable.
     */
    async applySelectedChanges() {
        // Prevent concurrent apply operations
        if (this.isApplyingChanges) return;
        
        if (!this.currentAnalysisResult || !this.currentAnalysisResult.changes) {
            this.showNotification('No changes to apply', 'error');
            return;
        }
        
        // Only apply changes that are selected AND not already finalized
        const activeSelectedIds = this.getActiveSelectedIds();
        if (activeSelectedIds.length === 0) {
            this.showNotification('Please select at least one change to apply', 'warning');
            return;
        }
        
        this.isApplyingChanges = true;
        try {
            // Import services
            const { trackChangesService } = await import('../services/trackChangesService.js');
            const { TrackedChange } = await import('../models/changeModels.js');
            
            // Show progress screen
            this.showScreen('applying-changes');
            
            // Filter to selected + non-finalized changes and convert to TrackedChange objects
            const changes = this.currentAnalysisResult.changes
                .filter((c, index) => {
                    const changeId = c.id || `change_${index + 1}`;
                    return activeSelectedIds.includes(changeId);
                })
                .map(c => new TrackedChange(c));
            
            console.log(`[APP] Applying ${changes.length} selected changes (${this.getRemainingCount()} remaining of ${this.currentAnalysisResult.changes.length} total)`);
            
            // Validate all changes
            console.log('[APP] Validating changes...');
            for (const change of changes) {
                try {
                    change.validate();
                } catch (error) {
                    console.error(`[APP] Validation failed for change ${change.id}:`, error.message);
                    throw new Error(`Invalid change ${change.id}: ${error.message}`);
                }
            }
            
            console.log('[APP] All changes validated successfully');
            
            // Apply changes with progress callback
            const results = await trackChangesService.applyAllChangesAsTracked(changes, (progress) => {
                // Update progress UI
                const progressBar = document.getElementById('apply-progress-bar');
                const progressPercent = document.getElementById('progress-percent');
                const progressMessage = document.getElementById('progress-message');
                const progressDetail = document.getElementById('progress-detail');
                const progressStats = document.getElementById('progress-stats');
                
                if (progressBar) {
                    progressBar.style.width = `${progress.percentage}%`;
                }
                if (progressPercent) {
                    progressPercent.textContent = `${Math.round(progress.percentage)}%`;
                }
                if (progressMessage) {
                    progressMessage.textContent = `Applying change ${progress.current} of ${progress.total}...`;
                }
                if (progressDetail) {
                    progressDetail.textContent = '';
                }
                if (progressStats) {
                    progressStats.textContent = `${progress.current} of ${progress.total} changes applied`;
                }
            });
            
            // Merge results into the cumulative per-redline state (does not lock the session)
            this.recordApplyResults(results);
            
            console.log('[APP] Apply complete:', results.getSummary());
            
            // Navigate back to results-dashboard
            this.showScreen('results-dashboard');
            
            // Show notification based on this batch's outcome
            const appliedCount = (results.applied || []).length;
            const failedCount = (results.failed || []).length;
            const remaining = this.getRemainingCount();
            if (failedCount === 0) {
                const tail = remaining > 0 ? ` ${remaining} redline${remaining !== 1 ? 's' : ''} still available to apply.` : ' All redlines have now been applied.';
                this.showNotification(`Applied ${appliedCount} redline${appliedCount !== 1 ? 's' : ''}.${tail}`, 'success');
            } else if (appliedCount > 0) {
                this.showNotification(`Applied ${appliedCount} redline${appliedCount !== 1 ? 's' : ''}. ${failedCount} could not be applied automatically — see details below.`, 'warning');
            } else {
                this.showNotification(`No redlines could be applied. See details below.`, 'error');
            }
            
        } catch (error) {
            console.error('[APP] Error applying changes:', error);
            this.showNotification(`Something went wrong while applying changes. Please try again.`, 'error');
            this.showScreen('results-dashboard');
        } finally {
            this.isApplyingChanges = false;
        }
    },
    
    /**
     * Retry failed changes from previous apply
     */
    async retryFailedChanges() {
        if (this.isApplyingChanges) return;
        
        if (!this.lastApplyResults || !this.lastApplyResults.failed || this.lastApplyResults.failed.length === 0) {
            this.showNotification('No failed changes to retry', 'error');
            return;
        }
        
        this.isApplyingChanges = true;
        
        try {
            const { trackChangesService } = await import('../services/trackChangesService.js');
            const { TrackedChange } = await import('../models/changeModels.js');
            
            // Show progress screen
            this.showScreen('applying-changes');
            
            // Get all original changes
            const allChanges = this.currentAnalysisResult.changes.map(c => new TrackedChange(c));
            
            // Retry failed changes
            const results = await trackChangesService.retryFailedChanges(allChanges, this.lastApplyResults);
            
            // Merge results with previous results
            results.applied.forEach(id => {
                if (!this.lastApplyResults.applied.includes(id)) {
                    this.lastApplyResults.applied.push(id);
                }
            });
            
            // Update failed list
            this.lastApplyResults.failed = results.failed;
            
            console.log('[APP] Retry complete:', this.lastApplyResults.getSummary());
            
            // Show results screen
            this.showScreen('changes-applied');
            
        } catch (error) {
            console.error('[APP] Error retrying changes:', error);
            this.showNotification(`Failed to retry changes: ${error.message}`, 'error');
            this.showScreen('changes-applied');
        } finally {
            this.isApplyingChanges = false;
        }
    },
    
    /**
     * Navigate to a specific change in the Word document
     * Uses status-aware navigation with fallback strategies
     * @param {string} changeId - ID of the change to navigate to
     */
    async navigateToChange(changeId) {
        try {
            // Find the change object
            const change = this.currentAnalysisResult?.changes?.find(c => 
                (c.id || `change_${this.currentAnalysisResult.changes.indexOf(c) + 1}`) === changeId
            );
            
            if (!change) {
                this.showNotification('Change not found', 'error');
                return;
            }
            
            // Get change status to determine if it was applied
            const status = this.getChangeStatus(changeId);
            const wasApplied = status.status === 'applied';
            
            console.log(`[APP] Navigating to change ${changeId} (${change.type}), applied: ${wasApplied}`);
            
            // Determine primary and fallback search texts based on status and type
            const searchStrategies = this._getNavigationStrategies(change, wasApplied);
            
            if (searchStrategies.length === 0) {
                this.showNotification('No text available for navigation', 'error');
                return;
            }
            
            // Try each strategy in order until one succeeds
            let success = false;
            let strategyUsed = '';
            
            for (const strategy of searchStrategies) {
                if (!strategy.text || strategy.text.trim().length === 0) {
                    continue;
                }
                
                console.log(`[APP] Trying ${strategy.name} strategy:`, strategy.text.substring(0, 100) + '...');
                
                success = await officeIntegration.navigateToText(strategy.text);
                
                if (success) {
                    strategyUsed = strategy.name;
                    break;
                }
            }
            
            // Show appropriate feedback based on result
            if (success) {
                // Silent navigation - no notification needed
                console.log(`[APP] Navigation successful using ${strategyUsed} strategy`);
            } else {
                const helpText = wasApplied 
                    ? 'The change was applied but cannot be located. The document may have been edited.'
                    : 'The text to be changed cannot be located in the document.';
                this.showNotification(`Could not locate change. ${helpText}`, 'warning');
                console.warn(`[APP] All navigation strategies failed for ${changeId}`);
            }
            
        } catch (error) {
            console.error('[APP] Error navigating to change:', error);
            this.showNotification(`Navigation failed: ${error.message}`, 'error');
        }
    },
    
    /**
     * Get navigation strategies for a change based on its type and application status
     * Returns array of strategies to try in order of preference
     * @private
     */
    _getNavigationStrategies(change, wasApplied) {
        const strategies = [];
        
        if (wasApplied) {
            // Change was applied - search for result text
            switch (change.type) {
                case 'delete':
                    // Deleted text is still in document (marked with strikethrough)
                    // Try original text first, then context
                    strategies.push(
                        { name: 'deleted-text', text: change.searchText },
                        { name: 'context-text', text: change.afterText }
                    );
                    break;
                    
                case 'insert':
                    // Inserted text is now in document
                    // Try inserted text first, then anchor
                    strategies.push(
                        { name: 'inserted-text', text: change.insertText },
                        { name: 'anchor-text', text: change.afterText }
                    );
                    break;
                    
                case 'insertClause':
                    // Inserted clause is now in document
                    strategies.push(
                        { name: 'inserted-clause', text: change.clauseContent },
                        { name: 'anchor-section', text: change.afterSection }
                    );
                    break;
                    
                case 'replace':
                    // Both old (strikethrough) and new (underline) text are in document
                    // Try new text first (more reliable), then old text
                    strategies.push(
                        { name: 'replacement-text', text: change.replaceWith },
                        { name: 'original-text', text: change.searchText }
                    );
                    break;
            }
        } else {
            // Change NOT applied - search for original/anchor text
            switch (change.type) {
                case 'delete':
                case 'replace':
                    // Search for original text (still unchanged in document)
                    strategies.push(
                        { name: 'original-text', text: change.searchText }
                    );
                    break;
                    
                case 'insert':
                    // Search for anchor text (where it will be inserted)
                    // Try anchor first, then the text to be inserted as fallback
                    strategies.push(
                        { name: 'anchor-text', text: change.afterText },
                        { name: 'insert-preview', text: change.insertText }
                    );
                    break;
                    
                case 'insertClause':
                    // Search for section anchor
                    strategies.push(
                        { name: 'anchor-section', text: change.afterSection },
                        { name: 'clause-preview', text: change.clauseContent }
                    );
                    break;
            }
        }
        
        // Add key phrase fallback for all types if we have searchText
        if (change.searchText && change.searchText.length > 100) {
            // Extract a distinctive key phrase from the middle of the text
            const keyPhrase = this._extractKeyPhrase(change.searchText);
            if (keyPhrase) {
                strategies.push({ name: 'key-phrase', text: keyPhrase });
            }
        }
        
        return strategies;
    },
    
    /**
     * Extract a distinctive key phrase from text for fallback navigation
     * @private
     */
    _extractKeyPhrase(text) {
        if (!text || text.length < 50) return null;
        
        // Take a chunk from the middle of the text (more distinctive than start/end)
        const start = Math.floor(text.length * 0.3);
        const length = Math.min(150, text.length - start);
        
        return text.substring(start, start + length).trim();
    },
    
    /**
     * Load and cache document metadata
     */
    async loadDocumentMetadata() {
        try {
            const metadata = await officeIntegration.getDocumentMetadata();
            this.documentMetadata = metadata;
            return metadata;
        } catch (error) {
            console.error('[APP] Error loading document metadata:', error);
            // Return default metadata
            return {
                filename: 'Document.docx',
                wordCount: 0,
                pageCount: 0,
                lastModified: null
            };
        }
    },
    
    /**
     * Format document metadata for display
     */
    formatDocumentMetadata(metadata) {
        if (!metadata) return '...';
        
        const parts = [];
        
        // Page count
        if (metadata.pageCount > 0) {
            parts.push(`${metadata.pageCount} page${metadata.pageCount !== 1 ? 's' : ''}`);
        }
        
        // Word count with comma formatting
        if (metadata.wordCount > 0) {
            const formattedCount = metadata.wordCount.toLocaleString();
            parts.push(`${formattedCount} words`);
        }
        
        return parts.join(' • ');
    },
    
    /**
     * Generate Most Recent Review section HTML
     */
    generateMostRecentReview() {
        // Show in-progress card if analysis is running
        if (this.isAnalyzing) {
            return `
                <div class="recent-activity-card recent-activity-card-progress">
                    <div class="activity-card-header">
                        <div class="activity-card-icon">
                            <div class="mini-orb-container">
                                <div class="mini-orb-ring"></div>
                                <div class="mini-orb-core">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                                    </svg>
                                </div>
                            </div>
                        </div>
                        <div class="activity-card-title">Review In Progress</div>
                    </div>
                    <div class="activity-card-desc">Analyzing with Glean AI...</div>
                    <button class="btn btn-secondary activity-card-btn" onclick="app.returnToAnalysis()">
                        Back to Review
                    </button>
                </div>
            `;
        }
        
        const lastReview = this.loadLastReview();
        
        if (!lastReview) {
            return `
                <div class="recent-activity-card recent-activity-card-empty">
                    <div class="activity-card-header">
                        <div class="activity-card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg></div>
                        <div class="activity-card-title">No recent reviews</div>
                    </div>
                    <div class="activity-card-desc">Run automated redlines on your document</div>
                </div>
            `;
        }
        
        // Format date/time
        const now = new Date();
        const reviewDate = lastReview.date;
        const diffMs = now - reviewDate;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        let timeAgo;
        if (diffMins < 1) {
            timeAgo = 'Just now';
        } else if (diffMins < 60) {
            timeAgo = `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
        } else if (diffHours < 24) {
            timeAgo = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        } else if (diffDays < 7) {
            timeAgo = `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
        } else {
            timeAgo = reviewDate.toLocaleDateString();
        }
        
        // Get template/playbook names
        const templateName = lastReview.template === 'ai-decide' ? 'AI Selected' : 
            (this.availableTemplates.find(t => t.url === lastReview.template)?.name || 'Custom Template');
        const playbookName = lastReview.playbook === 'ai-decide' ? 'AI Selected' : 
            (this.availablePlaybooks.find(p => p.url === lastReview.playbook)?.name || 'Custom Playbook');
        
        const changeCount = lastReview.result?.changes?.length || 0;
        
        return `
            <div class="recent-activity-card">
                <button class="clear-tile-btn" onclick="app.clearReviewManually()" title="Clear review data">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
                <div class="activity-card-header">
                    <div class="activity-card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg></div>
                    <div class="activity-card-title">Contract Review Completed</div>
                </div>
                <div class="activity-card-time">${timeAgo}</div>
                <div class="activity-card-meta">${changeCount} change${changeCount !== 1 ? 's' : ''} • ${templateName} • ${playbookName}</div>
                <button class="btn btn-secondary activity-card-btn" onclick="app.restoreLastReview()">
                    Continue Review
                </button>
            </div>
        `;
    },
    
    /**
     * Generate Most Recent Chat section HTML
     */
    generateMostRecentChat() {
        console.log(`[APP] Generating Most Recent Chat (Timestamp: ${Date.now()})`);
        
        // Try to get history from Glean API (memory) first, then localStorage
        let history = [];
        let sessionId = localStorage.getItem('chatSessionId');
        let startTime = localStorage.getItem('chatSessionStartTime');
        
        try {
            // Check in-memory history first
            const memoryHistory = gleanApi.chatAgent.getHistory();
            if (memoryHistory && memoryHistory.length > 0) {
                console.log('[APP] Using in-memory chat history:', memoryHistory.length, 'items');
                history = memoryHistory;
            } else {
                // Fallback to localStorage
                const storedHistory = localStorage.getItem('chatHistory');
                if (storedHistory) {
                    history = JSON.parse(storedHistory);
                    console.log('[APP] Using localStorage chat history:', history.length, 'items');
                }
            }
        } catch (e) {
            console.error('[APP] Error retrieving chat history:', e);
            history = [];
        }

        console.log('[APP] Final history count for display:', history.length);

        // If no history, show empty state
        if (!history || history.length === 0) {
            console.log('[APP] No history found, showing empty state');
            return `
                <div class="recent-activity-card recent-activity-card-empty">
                    <div class="activity-card-header">
                        <div class="activity-card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></div>
                        <div class="activity-card-title">No recent conversations</div>
                    </div>
                    <div class="activity-card-desc">Ask questions and get clarifications</div>
                </div>
            `;
        }
        
        // Fallback for missing metadata
        if (!startTime && history.length > 0 && history[0].timestamp) {
            startTime = history[0].timestamp;
        } else if (!startTime) {
            startTime = new Date().toISOString();
        }
        
        let firstMessage = 'Chat session';
        if (history.length > 0) {
            // Find first user message
            const firstUserMsg = history.find(m => m.role === 'user');
            if (firstUserMsg) {
                const content = firstUserMsg.content;
                firstMessage = content.length > 100 ? content.substring(0, 100) + '...' : content;
            }
        }

        const messageCount = history.length;
        
        // Format time ago
        const now = new Date();
        const chatDate = new Date(startTime);
        const diffMs = now - chatDate;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        let timeAgo;
        if (diffMins < 1) {
            timeAgo = 'Just now';
        } else if (diffMins < 60) {
            timeAgo = `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
        } else if (diffHours < 24) {
            timeAgo = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        } else if (diffDays < 7) {
            timeAgo = `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
        } else {
            timeAgo = chatDate.toLocaleDateString();
        }
        
        const canContinue = !!sessionId;
        
        return `
            <div class="recent-activity-card">
                <button class="clear-tile-btn" onclick="app.clearChatManually()" title="Clear chat history">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
                <div class="activity-card-header">
                    <div class="activity-card-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></div>
                    <div class="activity-card-title">${firstMessage}</div>
                </div>
                <div class="activity-card-time">${timeAgo}</div>
                <div class="activity-card-meta">${messageCount} message${messageCount !== 1 ? 's' : ''}</div>
                <button class="btn btn-secondary activity-card-btn" onclick="app.loadMostRecentChat()" ${canContinue ? '' : 'disabled title="Cannot continue: Chat ID missing"'}>
                    ${canContinue ? 'Continue Chat' : 'Cannot Continue'}
                </button>
            </div>
        `;
    },
    
    /**
     * Load and restore the most recent chat session
     */
    async loadMostRecentChat() {
        console.log('[APP] Loading most recent chat (continuing existing session)...');
        
        const chatHistory = localStorage.getItem('chatHistory');
        const sessionId = localStorage.getItem('chatSessionId');
        
        if (!chatHistory || !sessionId) {
            console.warn('[APP] No chat history found');
            return;
        }
        
        // Navigate to chat screen WITHOUT clearing history (continue existing chat)
        this.showScreen('chat-document', { clearHistory: false });
        
        // Wait for screen to render
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Clear the default welcome message
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }
        
        // Restore chat history
        const history = JSON.parse(chatHistory);
        history.forEach(msg => {
            this.renderMessage(msg.content, msg.role === 'user' ? 'user' : 'agent');
        });
        
        console.log('[APP] Chat history restored:', history.length, 'messages');
        
        // Scroll to bottom to show latest message
        setTimeout(() => this.scrollToBottom(), 150);
    },
    
    // Settings Management
    loadSettingsScreen() {
        console.log('[APP] Loading settings screen...');
        const authMode = settings.getAuthMode();
        
        // Hide API Token section in SSO mode (OAuth handles auth automatically)
        const apiTokenSection = document.getElementById('api-token-section');
        if (apiTokenSection) {
            apiTokenSection.style.display = authMode === 'sso' ? 'none' : 'block';
        }
        
        // Load API Token (only relevant in Cognito mode)
        if (authMode !== 'sso') {
            const apiTokenInput = document.getElementById('setting-api-token');
            if (apiTokenInput) {
                apiTokenInput.value = settings.get('glean_api_token', '') || '';
            }
        }
        
        // Load Instance - show default as placeholder if user hasn't overridden
        const instanceInput = document.getElementById('setting-instance');
        if (instanceInput) {
            const savedInstance = settings.get('glean_instance', '');
            instanceInput.value = savedInstance;
            const effectiveInstance = settings.getEffectiveDefault('gleanInstance', 'instance');
            instanceInput.placeholder = effectiveInstance ? `Default: ${effectiveInstance}` : 'No default configured';
        }
        
        // Load Chat Agent ID - show default as placeholder
        const chatAgentInput = document.getElementById('setting-chat-agent-id');
        if (chatAgentInput) {
            const savedChatAgentId = settings.get('glean_chat_agent_id', '');
            chatAgentInput.value = savedChatAgentId;
            const effectiveChat = settings.getEffectiveDefault('chatAgentId', 'chatAgentId');
            chatAgentInput.placeholder = effectiveChat ? `Default: ${effectiveChat}` : 'No default configured';
        }
        
        // Load Redliner Agent ID
        const redlinerAgentInput = document.getElementById('setting-redliner-agent-id');
        if (redlinerAgentInput) {
            const savedRedlinerAgentId = settings.get('glean_redliner_agent_id', '');
            redlinerAgentInput.value = savedRedlinerAgentId;
            const effectiveRedliner = settings.getEffectiveDefault('redlinerAgentId', 'redlinerAgentId');
            redlinerAgentInput.placeholder = effectiveRedliner ? `Default: ${effectiveRedliner}` : 'No default configured';
        }
        
        // Load Listing Agent ID
        const listingAgentInput = document.getElementById('setting-listing-agent-id');
        if (listingAgentInput) {
            const savedListingAgentId = settings.get('glean_listing_agent_id', '');
            listingAgentInput.value = savedListingAgentId;
            const effectiveListing = settings.getEffectiveDefault('listingAgentId', 'listingAgentId');
            listingAgentInput.placeholder = effectiveListing ? `Default: ${effectiveListing}` : 'No default configured';
        }
        
        // Show admin section toggle if user is admin (content hidden until acknowledged)
        const adminSection = document.getElementById('admin-settings-section');
        if (adminSection) {
            adminSection.style.display = this.isAdmin ? 'block' : 'none';
        }
        this.adminAcknowledged = false;
        
        console.log('[APP] Settings loaded');
    },
    
    async loadAdminSettingsSection() {
        const orgConfig = settings.getOrgConfig() || {};
        
        // Glean Instance
        const adminInstanceInput = document.getElementById('admin-instance');
        if (adminInstanceInput) {
            adminInstanceInput.value = orgConfig.gleanInstance || '';
            adminInstanceInput.placeholder = GLEAN_DEFAULTS.instance || '';
        }
        
        // Agent IDs
        const adminChatAgentInput = document.getElementById('admin-chat-agent-id');
        if (adminChatAgentInput) {
            adminChatAgentInput.value = orgConfig.chatAgentId || '';
            adminChatAgentInput.placeholder = GLEAN_DEFAULTS.chatAgentId || '';
        }
        const adminRedlinerInput = document.getElementById('admin-redliner-agent-id');
        if (adminRedlinerInput) {
            adminRedlinerInput.value = orgConfig.redlinerAgentId || '';
            adminRedlinerInput.placeholder = GLEAN_DEFAULTS.redlinerAgentId || '';
        }
        const adminListingInput = document.getElementById('admin-listing-agent-id');
        if (adminListingInput) {
            adminListingInput.value = orgConfig.listingAgentId || '';
            adminListingInput.placeholder = GLEAN_DEFAULTS.listingAgentId || '';
        }
        
        // Default Playbook (name + url)
        const playbook = settings.getOrgDefaultPlaybook();
        const pbNameInput = document.getElementById('admin-playbook-name');
        const pbUrlInput = document.getElementById('admin-playbook-url');
        if (pbNameInput) pbNameInput.value = playbook.name;
        if (pbUrlInput) pbUrlInput.value = playbook.url;
        
        // Default Template (name + url)
        const template = settings.getOrgDefaultTemplate();
        const tmplNameInput = document.getElementById('admin-template-name');
        const tmplUrlInput = document.getElementById('admin-template-url');
        if (tmplNameInput) tmplNameInput.value = template.name;
        if (tmplUrlInput) tmplUrlInput.value = template.url;
        
        // Admin Emails
        this.renderAdminEmails();
    },
    
    renderAdminEmails() {
        const container = document.getElementById('admin-emails-list');
        if (!container) return;
        
        if (this.adminEmails.length === 0) {
            container.innerHTML = '<span style="color: #9ca3af; font-size: 12px;">No admin emails configured</span>';
            return;
        }
        container.innerHTML = this.adminEmails.map((email, i) => `
            <span class="admin-email-tag">
                ${this.escapeHtml(email)}
                <span class="admin-email-remove" onclick="app.removeAdminEmail(${i})">&times;</span>
            </span>
        `).join('');
    },
    
    addAdminEmail() {
        const input = document.getElementById('admin-email-input');
        if (!input) return;
        const email = input.value.trim().toLowerCase();
        if (!email) return;
        
        // Basic email validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            this.showNotification('Please enter a valid email address', 'error');
            return;
        }
        if (this.adminEmails.includes(email)) {
            this.showNotification('Email already in admin list', 'error');
            return;
        }
        
        this.adminEmails.push(email);
        input.value = '';
        this.renderAdminEmails();
    },
    
    removeAdminEmail(index) {
        if (index >= 0 && index < this.adminEmails.length) {
            this.adminEmails.splice(index, 1);
            this.renderAdminEmails();
        }
    },
    
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
    
    async saveAdminSettings() {
        console.log('[APP] Saving admin settings...');
        const token = settings.getApiToken();
        if (!token) {
            this.showNotification('No auth token available', 'error');
            return;
        }
        
        const config = {
            gleanInstance: document.getElementById('admin-instance')?.value.trim() || '',
            chatAgentId: document.getElementById('admin-chat-agent-id')?.value.trim() || '',
            redlinerAgentId: document.getElementById('admin-redliner-agent-id')?.value.trim() || '',
            listingAgentId: document.getElementById('admin-listing-agent-id')?.value.trim() || '',
            defaultPlaybook: {
                name: document.getElementById('admin-playbook-name')?.value.trim() || '',
                url: document.getElementById('admin-playbook-url')?.value.trim() || ''
            },
            defaultTemplate: {
                name: document.getElementById('admin-template-name')?.value.trim() || '',
                url: document.getElementById('admin-template-url')?.value.trim() || ''
            },
            adminEmails: [...this.adminEmails]
        };
        
        const result = await settings.saveOrgConfig(token, config);
        if (result.success) {
            this.showNotification('Admin settings saved successfully', 'success');
        } else {
            this.showNotification('Failed to save: ' + (result.error || 'Unknown error'), 'error');
        }
    },
    
    toggleAdvancedOverrides() {
        const content = document.getElementById('advanced-overrides-content');
        const arrow = document.getElementById('advanced-overrides-arrow');
        if (!content) return;
        
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        if (arrow) arrow.textContent = isHidden ? '▾' : '▸';
    },
    
    adminAcknowledged: false,
    
    async expandAdminSection() {
        const content = document.getElementById('admin-settings-content');
        const arrow = document.getElementById('admin-section-arrow');
        if (!content) return;
        
        if (this.adminAcknowledged) {
            // Toggle content visibility
            const isHidden = content.style.display === 'none';
            content.style.display = isHidden ? 'block' : 'none';
            if (arrow) arrow.textContent = isHidden ? '▾' : '▸';
        } else {
            // Show confirm modal (same pattern as tracked-changes dialog)
            const confirmed = await this.showConfirmDialog(
                'Deployment Admin Settings',
                'Changes here affect all users across the organization.\n\nAre you sure you want to continue?'
            );
            if (confirmed) {
                this.adminAcknowledged = true;
                content.style.display = 'block';
                if (arrow) arrow.textContent = '▾';
                this.loadAdminSettingsSection();
            }
        }
    },
    
    saveSettings() {
        console.log('[APP] Saving user settings...');
        const authMode = settings.getAuthMode();
        
        const apiTokenInput = document.getElementById('setting-api-token');
        const chatAgentIdInput = document.getElementById('setting-chat-agent-id');
        const redlinerAgentIdInput = document.getElementById('setting-redliner-agent-id');
        const listingAgentIdInput = document.getElementById('setting-listing-agent-id');
        
        const apiToken = apiTokenInput?.value.trim();
        const instance = document.getElementById('setting-instance')?.value.trim();
        const chatAgentId = chatAgentIdInput?.value.trim();
        const redlinerAgentId = redlinerAgentIdInput?.value.trim();
        const listingAgentId = listingAgentIdInput?.value.trim();
        
        [apiTokenInput, chatAgentIdInput, redlinerAgentIdInput, listingAgentIdInput].forEach(input => {
            if (input) {
                input.classList.remove('error');
                const errorMsg = input.parentElement.querySelector('.form-error');
                if (errorMsg) errorMsg.remove();
            }
        });
        
        const errors = [];
        if (authMode !== 'sso' && !apiToken) {
            errors.push({ input: apiTokenInput, message: 'API Token is required' });
        }
        
        if (errors.length > 0) {
            errors.forEach(({ input, message }) => {
                if (input) {
                    input.classList.add('error');
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'form-error';
                    errorDiv.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> ${message}`;
                    input.parentElement.appendChild(errorDiv);
                }
            });
            this.showNotification('Please fill in all required fields', 'error');
            return false;
        }
        
        try {
            if (authMode !== 'sso') {
                settings.setApiToken(apiToken);
            }
            settings.set('glean_instance', instance);
            settings.setChatAgentId(chatAgentId);
            settings.setRedlinerAgentId(redlinerAgentId);
            settings.setListingAgentId(listingAgentId);
            
            console.log('[APP] User settings saved');
            this.loadTemplatesAndPlaybooks();
            return true;
        } catch (error) {
            console.error('[APP] Error saving settings:', error);
            this.showNotification('Error saving settings: ' + error.message, 'error');
            return false;
        }
    },
    
    async saveAllSettings() {
        console.log('[APP] Saving all settings...');
        
        // Save user settings first
        const userOk = this.saveSettings();
        if (userOk === false) return;
        
        // Save admin settings if admin section is expanded and acknowledged
        if (this.isAdmin && this.adminAcknowledged) {
            await this.saveAdminSettings();
        } else {
            this.showNotification('Settings saved successfully', 'success');
        }
        
        setTimeout(() => {
            this.showScreen('home');
        }, 1500);
    },
    
    cancelSettings() {
        this.showScreen('home');
    },
    
    showSettingsFeedback(type, message) {
        const feedback = document.getElementById('settings-feedback');
        if (!feedback) return;
        
        feedback.style.display = 'block';
        feedback.textContent = message;
        feedback.style.whiteSpace = 'pre-line';
        
        if (type === 'success') {
            feedback.style.backgroundColor = '#d1fae5';
            feedback.style.color = '#065f46';
            feedback.style.border = '1px solid #10b981';
        } else {
            feedback.style.backgroundColor = '#fee2e2';
            feedback.style.color = '#991b1b';
            feedback.style.border = '1px solid #ef4444';
        }
        
        // Scroll to top to show feedback
        document.getElementById('content').scrollTop = 0;
    },
    
    togglePasswordVisibility(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        
        if (input.type === 'password') {
            input.type = 'text';
        } else {
            input.type = 'password';
        }
    },
    
    // === Connection Test Runner Methods ===
    
    async runRedlinerTest() {
        const resultEl = document.getElementById('test-result-redliner');
        const btn = document.getElementById('test-btn-redliner');
        if (!resultEl || !btn) return;
        
        btn.disabled = true;
        resultEl.className = 'test-card-result test-running';
        resultEl.innerHTML = '<span class="test-spinner"></span> Running...';
        
        const start = performance.now();
        try {
            const result = await gleanApi.redlinerAgent.analyzeContract({
                contractText: TEST_CONTRACT,
                customTemplateText: TEST_TEMPLATE,
                customPlaybookText: TEST_PLAYBOOK,
            });
            const elapsed = ((performance.now() - start) / 1000).toFixed(1);
            const count = result?.changes?.length || 0;
            resultEl.className = 'test-card-result test-success';
            resultEl.textContent = `\u2713 ${count} redline${count !== 1 ? 's' : ''} found (${elapsed}s)`;
        } catch (err) {
            const elapsed = ((performance.now() - start) / 1000).toFixed(1);
            resultEl.className = 'test-card-result test-error';
            resultEl.textContent = `\u2717 Error: ${err.message} (${elapsed}s)`;
        } finally {
            btn.disabled = false;
        }
    },
    
    async runChatTest() {
        const resultEl = document.getElementById('test-result-chat');
        const btn = document.getElementById('test-btn-chat');
        if (!resultEl || !btn) return;
        
        btn.disabled = true;
        resultEl.className = 'test-card-result test-running';
        resultEl.innerHTML = '<span class="test-spinner"></span> Running...';
        
        const start = performance.now();
        try {
            gleanApi.chatAgent.newSession();
            const result = await gleanApi.chatAgent.sendMessage(TEST_CHAT_QUESTION, TEST_CONTRACT);
            const elapsed = ((performance.now() - start) / 1000).toFixed(1);
            const chars = result?.reply?.length || 0;
            resultEl.className = 'test-card-result test-success';
            resultEl.textContent = `\u2713 Reply received, ${chars} chars (${elapsed}s)`;
        } catch (err) {
            const elapsed = ((performance.now() - start) / 1000).toFixed(1);
            resultEl.className = 'test-card-result test-error';
            resultEl.textContent = `\u2717 Error: ${err.message} (${elapsed}s)`;
        } finally {
            btn.disabled = false;
        }
    },
    
    async runListerTest(type) {
        const key = type === 'Templates' ? 'templates' : 'playbooks';
        const resultEl = document.getElementById(`test-result-lister-${key}`);
        const btn = document.getElementById(`test-btn-lister-${key}`);
        if (!resultEl || !btn) return;
        
        btn.disabled = true;
        resultEl.className = 'test-card-result test-running';
        resultEl.innerHTML = '<span class="test-spinner"></span> Running...';
        
        const start = performance.now();
        try {
            const result = await gleanApi.listingAgent.fetchLists(type);
            const elapsed = ((performance.now() - start) / 1000).toFixed(1);
            const items = result?.[key]?.length || 0;
            resultEl.className = 'test-card-result test-success';
            resultEl.textContent = `\u2713 ${items} ${key} found (${elapsed}s)`;
        } catch (err) {
            const elapsed = ((performance.now() - start) / 1000).toFixed(1);
            resultEl.className = 'test-card-result test-error';
            resultEl.textContent = `\u2717 Error: ${err.message} (${elapsed}s)`;
        } finally {
            btn.disabled = false;
        }
    },

    // Screens will be loaded from screens.js
    screens: {}
};

// Initialize app when Office.js is ready
Office.onReady((info) => {
    console.log('Office.js is ready');
    console.log('Host:', info.host);
    console.log('Platform:', info.platform);
    
    // Production: Only run in Microsoft Word
    if (info.host === Office.HostType.Word) {
        app.officeReady = true;
        
        // Initialize app when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                app.init();
                setupGlobalEventListeners();
            });
        } else {
            app.init();
            setupGlobalEventListeners();
        }
    } else {
        console.error('This add-in is designed for Microsoft Word only');
        document.getElementById('content').innerHTML = 
            '<div class="alert alert-warning">This add-in is designed for Microsoft Word only.</div>';
    }
});

// Global event listeners
function setupGlobalEventListeners() {
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-select')) {
            document.querySelectorAll('.custom-select.open').forEach(el => {
                el.classList.remove('open');
            });
        }
    });
    
    // Keyboard navigation support
    document.addEventListener('keydown', (e) => {
        // Escape key - close dialogs and dropdowns
        if (e.key === 'Escape') {
            // Close any open dropdowns
            document.querySelectorAll('.custom-select.open').forEach(el => {
                el.classList.remove('open');
            });
            
            // Close any open dialogs
            const dialog = document.querySelector('.confirm-dialog-overlay');
            if (dialog) {
                dialog.remove();
            }
            
            // Close notifications
            const notification = document.querySelector('.notification-toast');
            if (notification) {
                notification.remove();
            }
        }
        
        // Ctrl/Cmd + Enter - Submit forms
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            // In chat screen, submit message
            if (window.app.currentScreen === 'chat-document') {
                const chatInput = document.getElementById('chat-input');
                if (chatInput && chatInput.value.trim()) {
                    window.app.handleChatSubmit();
                }
            }
        }
    });
}
