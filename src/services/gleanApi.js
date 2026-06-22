// Glean API Integration Service
// Production implementation for Glean AI agents

import { settings } from './settings.js';
import { parseAgentXml, validateChanges } from './xmlParser.js';

// Config globals loaded via classic <script> tags in HTML
const API_CONFIG = window.API_CONFIG || {};

// API Gateway Lambda Proxy URL
const API_GATEWAY_URL = API_CONFIG.GATEWAY_URL;

/**
 * Get Glean base URL derived from instance name
 * @returns {string} Glean API base URL
 */
function getGleanBaseUrl() {
    const instance = settings.getInstance();
    if (!instance) {
        console.warn('[GLEAN API] No instance configured, using default');
        return 'https://scio-prod-be.glean.com';
    }
    return `https://${instance}-be.glean.com`;
}

// Note: JSON parsing functions removed - now using XML parser

/**
 * Read an SSE-framed streaming response from a Lambda proxy.
 * Extracts JSON from 'data:' lines; ignores ':' heartbeat comments.
 * @param {Response} response - Fetch Response with streaming body
 * @returns {Promise<Object>} Parsed JSON from the SSE data event
 */
async function readSSEResponse(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
    }
    // Parse SSE: extract JSON from 'data:' lines, ignore ':' comment heartbeats
    let jsonStr = '';
    for (const line of buffer.split('\n')) {
        if (line.startsWith('data: ')) {
            jsonStr += line.slice(6);
        }
    }
    jsonStr = jsonStr.trim();
    if (!jsonStr) throw new Error('Empty response from service');
    return JSON.parse(jsonStr);
}

/**
 * Helper: Get configuration from settings
 */
function getConfig() {
    return {
        apiToken: settings.getApiToken(),
        redlinerAgentId: settings.getRedlinerAgentId(),
        chatAgentId: settings.getChatAgentId()
    };
}

/**
 * Helper: Make API call to Glean agent
 * @param {string} agentId - Agent ID
 * @param {Object} fields - Input fields for the agent
 * @param {string} sessionId - Optional session ID for chat
 * @returns {Promise<Object>} Agent response
 */
async function callGleanAgent(agentId, fields, sessionId = null) {
    const config = getConfig();
    
    if (!config.apiToken) {
        throw new Error('API token not configured. Please check settings.');
    }
    
    const payload = {
        agentId: agentId,
        fields: fields
    };
    
    if (sessionId) {
        payload.sessionId = sessionId;
    }
    
    console.log('[GLEAN API] Calling agent:', agentId);
    
    const response = await fetch(`${getGleanBaseUrl()}/api/agents/invoke`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.apiToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `API call failed: ${response.status} ${response.statusText}`;
        
        try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.message || errorJson.error || errorMessage;
        } catch (e) {
            // Use default error message
        }
        
        throw new Error(errorMessage);
    }
    
    return await response.json();
}

// Chat Agent - Session Management
const chatSession = {
    currentSessionId: null,
    chatHistory: [],
    sessionStartTime: null,
    firstMessage: null,
    
    /**
     * Load chat history from localStorage
     * Includes 24-hour TTL check - expired data is automatically cleared
     */
    load() {
        const saved = localStorage.getItem('chatHistory');
        const sessionId = localStorage.getItem('chatSessionId');
        const startTime = localStorage.getItem('chatSessionStartTime');
        const firstMsg = localStorage.getItem('chatFirstMessage');
        
        // TTL Check: Clear data older than 24 hours
        if (startTime) {
            const age = Date.now() - new Date(startTime).getTime();
            const TTL_24_HOURS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
            
            if (age > TTL_24_HOURS) {
                console.log('[CHAT SESSION] Data expired (>24 hours), clearing...');
                this.clear();
                return; // Don't load expired data
            }
        }
        
        // Load data if not expired
        if (saved) {
            this.chatHistory = JSON.parse(saved);
        }
        if (sessionId) {
            this.currentSessionId = sessionId;
        }
        if (startTime) {
            this.sessionStartTime = new Date(startTime);
        }
        if (firstMsg) {
            this.firstMessage = firstMsg;
        }
    },
    
    /**
     * Save chat history to localStorage
     */
    save() {
        console.log('[GLEAN API] Saving chat session:', {
            historyCount: this.chatHistory.length,
            hasSessionId: !!this.currentSessionId,
            hasStartTime: !!this.sessionStartTime
        });
        
        localStorage.setItem('chatHistory', JSON.stringify(this.chatHistory));
        if (this.currentSessionId) {
            localStorage.setItem('chatSessionId', this.currentSessionId);
        }
        if (this.sessionStartTime) {
            localStorage.setItem('chatSessionStartTime', this.sessionStartTime.toISOString());
        }
        if (this.firstMessage) {
            localStorage.setItem('chatFirstMessage', this.firstMessage);
        }
    },
    
    /**
     * Clear chat session
     */
    clear() {
        this.currentSessionId = null;
        this.chatHistory = [];
        this.sessionStartTime = null;
        this.firstMessage = null;
        localStorage.removeItem('chatHistory');
        localStorage.removeItem('chatSessionId');
        localStorage.removeItem('chatSessionStartTime');
        localStorage.removeItem('chatFirstMessage');
    },
    
    /**
     * Format chat history for agent
     */
    formatHistory() {
        if (this.chatHistory.length === 0) {
            return 'No previous messages';
        }
        
        return this.chatHistory.map(msg => 
            `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
        ).join('\n\n');
    },
    
    /**
     * Add message to history
     */
    addMessage(role, content) {
        console.log(`[GLEAN API] Adding ${role} message to history`);
        
        // Self-healing: Set session start time if missing
        if (!this.sessionStartTime) {
            this.sessionStartTime = new Date();
        }
        
        // Self-healing: Set first message preview if missing and this is a user message
        if (!this.firstMessage && role === 'user') {
            this.firstMessage = content.length > 100 ? content.substring(0, 100) + '...' : content;
        }
        
        this.chatHistory.push({
            role: role,
            content: content,
            timestamp: new Date().toISOString()
        });
        this.save();
    }
};

// Initialize chat session
chatSession.load();

export const gleanApi = {
    // Chat Agent API
    chatAgent: {
        /**
         * Send a message to the chat agent via Lambda proxy
         * @param {string} message - User message
         * @param {string} documentContent - Document text for context
         * @returns {Promise<Object>} Chat response with reply and chatId
         */
        async sendMessage(message, documentContent) {
            const config = getConfig();
            
            console.log('[CHAT AGENT] Sending message via Lambda');
            console.log('[CHAT AGENT] Config:', {
                hasToken: !!config.apiToken,
                hasChatId: !!chatSession.currentSessionId,
                hasChatAgentId: !!config.chatAgentId
            });
            
            if (!config.apiToken) {
                throw new Error('API token not configured');
            }
            
            if (!message) {
                throw new Error('Message is required');
            }

            if (!config.chatAgentId) {
                throw new Error('Chat Agent ID not configured. Check settings or admin defaults.');
            }
            
            try {
                // We send the raw message and document content to the Lambda.
                // The Lambda handles the formatting/concatenation for the Glean API.
                const payload = {
                    apiToken: config.apiToken,
                    authType: settings.getAuthMode() === 'sso' ? 'oauth' : 'token',
                    instance: settings.getInstance(),
                    message: message,
                    documentContent: documentContent || '',
                    chatAgentId: config.chatAgentId,
                    chatId: chatSession.currentSessionId || null
                };

                const response = await fetch(`${API_GATEWAY_URL}/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
                
                console.log('[CHAT AGENT] Response status:', response.status);
                
                if (!response.ok) {
                    throw new Error(`Chat request failed: ${response.status}`);
                }
                
                // Read SSE-framed streaming response
                const result = await readSSEResponse(response);
                
                // Check for embedded errors
                if (result.error) {
                    console.error('[CHAT AGENT] Glean API error details:', result.details || 'none');
                    const details = result.details ? ` | Details: ${result.details}` : '';
                    throw new Error(result.error + details);
                }
                
                // Store chat ID for future messages
                if (result.chatId) {
                    chatSession.currentSessionId = result.chatId;
                }

                const reply = (result.message || '').trim();
                if (!reply) {
                    throw new Error('No assistant response returned from chat agent.');
                }
                
                // Add messages to history
                chatSession.addMessage('user', message);
                chatSession.addMessage('assistant', reply);
                
                console.log('[CHAT AGENT] Chat response received');
                
                return {
                    reply,
                    chatId: chatSession.currentSessionId
                };
            } catch (error) {
                console.error('[CHAT AGENT] Error:', error);
                throw new Error(`Failed to send chat message: ${error.message}`);
            }
        },

        /**
         * Start a new chat session
         */
        newSession() {
            console.log('[CHAT AGENT] Starting new chat session');
            chatSession.clear();
        },

        /**
         * Get current chat history
         * @returns {Array} Chat messages
         */
        getHistory() {
            return chatSession.chatHistory;
        }
    },

    // Redliner Agent API
    redlinerAgent: {
        /**
         * Process and validate analysis result
         * @param {Object} result - Raw result from agent
         * @returns {Object} Validated result
         */
        processAnalysisResult(result) {
            // Validate response structure
            if (!result.changes || !Array.isArray(result.changes)) {
                throw new Error('Invalid response: missing changes array');
            }
            
            console.log('[REDLINER AGENT] Processing', result.changes.length, 'changes');
            
            // Validate each change
            for (let i = 0; i < result.changes.length; i++) {
                const change = result.changes[i];
                
                // Ensure ID exists
                if (!change.id) {
                    change.id = `change_${i + 1}`;
                }
                
                // Validate type
                if (!change.type) {
                    throw new Error(`Change ${change.id}: missing type field`);
                }
                
                // Validate required fields based on type
                if (change.type === 'replace') {
                    if (!change.searchText) {
                        throw new Error(`Change ${change.id}: replace type requires searchText`);
                    }
                    if (!change.replaceWith) {
                        throw new Error(`Change ${change.id}: replace type requires replaceWith`);
                    }
                } else if (change.type === 'insert') {
                    if (!change.afterText) {
                        throw new Error(`Change ${change.id}: insert type requires afterText`);
                    }
                    if (!change.insertText) {
                        throw new Error(`Change ${change.id}: insert type requires insertText`);
                    }
                } else if (change.type === 'delete') {
                    if (!change.searchText) {
                        throw new Error(`Change ${change.id}: delete type requires searchText`);
                    }
                } else if (change.type === 'insertClause') {
                    if (!change.afterSection) {
                        throw new Error(`Change ${change.id}: insertClause type requires afterSection`);
                    }
                    if (!change.clauseContent) {
                        throw new Error(`Change ${change.id}: insertClause type requires clauseContent`);
                    }
                }
                
                // Ensure category exists
                if (!change.category) {
                    change.category = 'general';
                }
                
                // Ensure reason exists
                if (!change.reason) {
                    change.reason = 'No description provided';
                }
            }
            
            console.log('[REDLINER AGENT] All changes validated successfully');
            
            return result;
        },
        
        /**
         * Analyze contract and generate redline recommendations via Lambda proxy
         * @param {Object} params - Analysis parameters
         * @param {string} [params.contractText] - Full contract text (mutually exclusive with selectedText)
         * @param {string} [params.selectedText] - Selected text excerpt (mutually exclusive with contractText)
         * @param {string} [params.templateLink] - GDrive link to template (optional)
         * @param {string} [params.playbookLink] - GDrive link to playbook (optional)
         * @returns {Promise<Object>} Analysis result with changes array and summary
         */
        async analyzeContract(params, options = {}) {
            const config = getConfig();
            
            console.log('[REDLINER AGENT] Starting contract analysis via Glean');
            console.log('[REDLINER AGENT] Config:', {
                hasToken: !!config.apiToken,
                tokenLength: config.apiToken?.length
            });
            
            if (!config.apiToken) {
                throw new Error('API token not configured');
            }
            
            // Validate mutually exclusive content fields
            if (params.contractText && params.selectedText) {
                throw new Error('Cannot provide both contractText and selectedText');
            }
            if (!params.contractText && !params.selectedText) {
                throw new Error('Must provide either contractText or selectedText');
            }
            
            try {
                const fetchOptions = {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        apiToken: config.apiToken,
                        authType: settings.getAuthMode() === 'sso' ? 'oauth' : 'token',
                        instance: settings.getInstance(),
                        redlinerAgentId: config.redlinerAgentId,
                        contractText: params.contractText || '',
                        selectedText: params.selectedText || '',
                        templateLink: params.templateLink || '',
                        customTemplateText: params.customTemplateText || '',
                        playbookLink: params.playbookLink || '',
                        customPlaybookText: params.customPlaybookText || '',
                        additionalInstructions: params.additionalInstructions || ''
                    })
                };
                if (options.signal) {
                    fetchOptions.signal = options.signal;
                }
                const response = await fetch(`${API_GATEWAY_URL}/analyze`, fetchOptions);
                
                console.log('[REDLINER AGENT] Response status:', response.status);
                
                // Fallback for API Gateway infrastructure errors (502, 503, etc.)
                // Lambda errors are always returned as 200 with error embedded in body (streaming limitation)
                if (!response.ok) {
                    console.error('[REDLINER AGENT] HTTP error:', response.status);
                    throw new Error(`Analysis service error: ${response.status}`);
                }
                
                // Read SSE-framed streaming response (Lambda sends heartbeat comments + final data event)
                const gleanResponse = await readSSEResponse(response);
                
                // Check for embedded errors (Glean API failures that occurred after streaming started)
                if (gleanResponse.error) {
                    console.error('[REDLINER AGENT] Embedded error:', gleanResponse);
                    console.error('[REDLINER AGENT] Glean API error details:', gleanResponse.details || 'none');
                    throw new Error(gleanResponse.error + (gleanResponse.details ? ` | Details: ${gleanResponse.details}` : ''));
                }
                console.log('[REDLINER AGENT] Glean response keys:', Object.keys(gleanResponse));
                
                // Extract text from agent response (matches reference implementation)
                let responseText = '';
                if (gleanResponse.messages && gleanResponse.messages.length > 0) {
                    console.log('[REDLINER AGENT] Found', gleanResponse.messages.length, 'messages');
                    
                    // Find the GLEAN_AI message (the actual agent output)
                    const gleanMessage = gleanResponse.messages.find(msg => msg.role === 'GLEAN_AI') 
                                      || gleanResponse.messages[gleanResponse.messages.length - 1];
                    
                    if (gleanMessage && gleanMessage.content) {
                        for (const content of gleanMessage.content) {
                            if (content.type === 'text') {
                                responseText += content.text;
                            }
                        }
                    }
                }
                
                if (!responseText) {
                    throw new Error('No response from Glean agent');
                }
                
                console.log('[REDLINER AGENT] Response text length:', responseText.length);
                console.log('[REDLINER AGENT] First 200 chars:', responseText.substring(0, 200));
                console.log('[REDLINER AGENT] Full XML response:', responseText);
                
                // Parse XML from response
                const parsedData = parseAgentXml(responseText);
                
                // Validate the parsed data
                validateChanges(parsedData.changes);
                
                console.log('[REDLINER AGENT] ✅ Successfully parsed agent response');
                return this.processAnalysisResult(parsedData);
            } catch (error) {
                // Re-throw abort errors directly so callers can detect cancellation
                if (error.name === 'AbortError') throw error;
                console.error('[REDLINER AGENT] Error:', error);
                throw new Error(`Failed to analyze contract: ${error.message}`);
            }
        },
        
        /**
         * Extract a short search phrase from longer text (for legacy format conversion)
         * @param {string} text - Full text
         * @returns {string} Short search phrase (5-10 words)
         */
        extractSearchPhrase(text) {
            if (!text) return '';
            
            // Take first 10 words
            const words = text.trim().split(/\s+/);
            const phrase = words.slice(0, Math.min(10, words.length)).join(' ');
            
            console.log(`[REDLINER AGENT] Extracted search phrase: "${phrase}" from ${words.length} words`);
            return phrase;
        }
    },

    // GDrive Search API
    gdriveSearch: {
        /**
         * Search for templates in GDrive
         * @returns {Promise<Array>} List of templates
         */
        async searchTemplates() {
            console.log('[GLEAN API] Searching for templates in GDrive');
            
            const config = getConfig();
            
            const response = await fetch(`${getGleanBaseUrl()}/api/search`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: 'template contract standard',
                    datasources: ['gdrive'],
                    pageSize: 50
                })
            });
            
            if (!response.ok) {
                throw new Error(`Search failed: ${response.status}`);
            }
            
            const results = await response.json();
            
            // Filter and format results
            return (results.results || [])
                .filter(r => r.title && r.title.toLowerCase().includes('template'))
                .map(r => ({
                    name: r.title,
                    url: r.url,
                    description: r.snippet || '',
                    id: r.id
                }));
        },

        /**
         * Search for playbooks in GDrive
         * @returns {Promise<Array>} List of playbooks
         */
        async searchPlaybooks() {
            console.log('[GLEAN API] Searching for playbooks in GDrive');
            
            const config = getConfig();
            
            const response = await fetch(`${getGleanBaseUrl()}/api/search`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: 'playbook contract review',
                    datasources: ['gdrive'],
                    pageSize: 50
                })
            });
            
            if (!response.ok) {
                throw new Error(`Search failed: ${response.status}`);
            }
            
            const results = await response.json();
            
            return (results.results || [])
                .filter(r => r.title && r.title.toLowerCase().includes('playbook'))
                .map(r => ({
                    name: r.title,
                    url: r.url,
                    description: r.snippet || '',
                    id: r.id
                }));
        },

        /**
         * Get document content from GDrive
         * @param {string} documentUrl - Document URL or ID
         * @returns {Promise<string>} Document content
         */
        async getDocumentContent(documentUrl) {
            console.log('[GLEAN API] Fetching document content:', documentUrl);
            
            const config = getConfig();
            
            // Search for the specific document to get its content
            const response = await fetch(`${getGleanBaseUrl()}/api/search`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: `url:${documentUrl}`,
                    datasources: ['gdrive'],
                    pageSize: 1
                })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch document: ${response.status}`);
            }
            
            const results = await response.json();
            
            if (!results.results || results.results.length === 0) {
                throw new Error('Document not found');
            }
            
            // Return the document content (snippet or full text if available)
            const doc = results.results[0];
            return doc.content || doc.snippet || '';
        }
    },

    // Authentication
    auth: {
        /**
         * Validate API credentials
         * @returns {Promise<Object>} Validation result
         */
        async validate() {
            console.log('[GLEAN API] Validating credentials');
            
            const config = getConfig();
            
            if (!config.apiToken) {
                return {
                    valid: false,
                    message: 'API token not configured'
                };
            }
            
            try {
                // Test API call with a simple search
                const response = await fetch(`${getGleanBaseUrl()}/api/search`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${config.apiToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        query: 'test',
                        pageSize: 1
                    })
                });
                
                if (response.ok) {
                    return {
                        valid: true,
                        message: 'Connected successfully'
                    };
                } else {
                    return {
                        valid: false,
                        message: `Authentication failed: ${response.status}`
                    };
                }
            } catch (error) {
                return {
                    valid: false,
                    message: error.message
                };
            }
        }
    },
    
    /**
     * Template and Playbook Listing Agent
     */
    listingAgent: {
        /**
         * Fetch templates and/or playbooks via Lambda proxy
         * @param {string} type - "Templates", "Playbooks", or "Both"
         * @returns {Promise<Object>} Object with templates and/or playbooks arrays
         */
        async fetchLists(type = 'Both') {
            const config = getConfig();
            
            console.log('[LISTING AGENT] Config:', {
                hasToken: !!config.apiToken,
                tokenLength: config.apiToken?.length,
                tokenPreview: config.apiToken ? config.apiToken.substring(0, 10) + '...' : 'none'
            });
            
            if (!config.apiToken) {
                throw new Error('API token not configured');
            }
            
            console.log(`[LISTING AGENT] 🔄 Fetching ${type} via Glean Template & Playbook Lister Agent`);
            
            try {
                const response = await fetch(`${API_GATEWAY_URL}/list`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        apiToken: config.apiToken,
                        authType: settings.getAuthMode() === 'sso' ? 'oauth' : 'token',
                        instance: settings.getInstance(),
                        listingAgentId: settings.getListingAgentId(),
                        type: type
                    })
                });
                
                console.log('[LISTING AGENT] Response status:', response.status);
                
                if (!response.ok) {
                    throw new Error(`Listing agent failed: ${response.status}`);
                }
                
                // Read SSE-framed streaming response
                const result = await readSSEResponse(response);
                
                // Check for embedded errors
                if (result.error) {
                    console.error('[LISTING AGENT] Glean API error details:', result.details || 'none');
                    const details = result.details ? ` | Details: ${result.details}` : '';
                    throw new Error(result.error + details);
                }
                
                console.log('[LISTING AGENT] Response:', result);
                
                return result;
            } catch (error) {
                console.error('[LISTING AGENT] Error:', error);
                throw new Error(`Failed to fetch templates/playbooks: ${error.message}`);
            }
        }
    }
};
