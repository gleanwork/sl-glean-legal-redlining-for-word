// Glean OAuth2 PKCE Flow Service
// Handles authorization, token exchange, storage, and refresh for SSO mode

import { settings } from './settings.js';
const API_CONFIG = window.API_CONFIG || {};

// PKCE helpers
function generateRandomString(length) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('').slice(0, length);
}

async function sha256(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return await crypto.subtle.digest('SHA-256', data);
}

function base64UrlEncode(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateCodeChallenge(verifier) {
    const hashed = await sha256(verifier);
    return base64UrlEncode(hashed);
}

// Token storage keys
const TOKEN_KEYS = {
    ACCESS_TOKEN: 'glean_oauth_access_token',
    REFRESH_TOKEN: 'glean_oauth_refresh_token',
    TOKEN_EXPIRY: 'glean_oauth_token_expiry',
    ID_TOKEN: 'glean_oauth_id_token',
    DCR_CLIENT_ID: 'glean_dcr_client_id'
};

// PKCE flow state (ephemeral, used during auth flow)
const PKCE_KEYS = {
    CODE_VERIFIER: 'glean_oauth_code_verifier',
    STATE: 'glean_oauth_state'
};

// Refresh loop prevention state
let lastRefreshAttempt = 0;
let consecutiveFailures = 0;
const MIN_REFRESH_INTERVAL_MS = 60000; // 60 seconds
const MAX_BACKOFF_MS = 300000; // 5 minutes
const MAX_CONSECUTIVE_FAILURES = 5;

export const gleanOAuth = {
    // OAuth configuration — returns config for either DCR or static client mode
    getAuthConfig() {
        const instance = settings.getInstance();
        const baseUrl = window.location.origin;
        const oauthClientType = settings.getOAuthClientType();
        const isDCR = oauthClientType === 'dcr';
        
        if (isDCR) {
            // DCR mode: public client (no secret). Token exchange still routes through the
            // Lambda proxy rather than calling Glean directly — Glean only returns CORS
            // headers for allowlisted origins, so a browser-direct call fails in CORS-strict
            // contexts like Word Online. The proxy relays server-to-server, so it works everywhere.
            const dcrClientId = localStorage.getItem(TOKEN_KEYS.DCR_CLIENT_ID) || '';
            return {
                authorizeUrl: `https://${instance}-be.glean.com/oauth/authorize`,
                tokenUrl: null, // not used — token exchange goes through the proxy
                tokenProxyUrl: API_CONFIG.OAUTH_TOKEN_ENDPOINT,
                clientId: dcrClientId,
                redirectUri: `${baseUrl}/taskpane/oauth-callback.html`,
                scopes: 'agents chat search',
                isDCR: true
            };
        } else {
            // Static client mode: use configured client_id, token exchange goes through Lambda proxy
            const clientId = settings.getOAuthClientId();
            return {
                authorizeUrl: `https://${instance}-be.glean.com/oauth/authorize`,
                tokenUrl: null, // not used in static mode
                tokenProxyUrl: API_CONFIG.OAUTH_TOKEN_ENDPOINT,
                clientId: clientId,
                redirectUri: `${baseUrl}/taskpane/oauth-callback.html`,
                scopes: 'agents chat search',
                isDCR: false
            };
        }
    },
    
    // DCR: Get or register a dynamic OAuth client via the Lambda proxy
    async getOrRegisterDCRClient() {
        // Check localStorage cache first
        const cached = localStorage.getItem(TOKEN_KEYS.DCR_CLIENT_ID);
        if (cached) {
            console.log('[OAUTH] Using cached DCR client_id');
            return cached;
        }
        
        // Call the DCR registration Lambda endpoint
        const registerUrl = API_CONFIG.DCR_REGISTER_ENDPOINT;
        if (!registerUrl) {
            throw new Error('DCR register endpoint not configured (API_CONFIG.DCR_REGISTER_ENDPOINT)');
        }
        
        console.log('[OAUTH] Registering DCR client via Lambda proxy...');
        
        const response = await fetch(registerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        
        if (!response.ok) {
            const errBody = await response.json().catch(() => ({ error: 'DCR registration failed' }));
            throw new Error(errBody.error || errBody.details || `DCR registration HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const clientId = data.client_id;
        
        if (!clientId) {
            throw new Error('DCR registration returned no client_id');
        }
        
        // Cache it
        localStorage.setItem(TOKEN_KEYS.DCR_CLIENT_ID, clientId);
        console.log(`[OAUTH] DCR client registered (cached=${data.cached}): ${clientId.substring(0, 20)}...`);
        
        return clientId;
    },
    
    // Clear cached DCR client_id (for re-registration on error)
    clearDCRClient() {
        localStorage.removeItem(TOKEN_KEYS.DCR_CLIENT_ID);
        console.log('[OAUTH] DCR client_id cache cleared');
    },
    
    // Start OAuth PKCE flow — returns the authorization URL
    async startAuthFlow() {
        let config = this.getAuthConfig();
        
        // If DCR mode and no client_id cached, register first
        if (config.isDCR && !config.clientId) {
            await this.getOrRegisterDCRClient();
            config = this.getAuthConfig(); // re-read with cached client_id
        }
        
        if (!config.clientId) {
            throw new Error(config.isDCR 
                ? 'DCR registration failed — no client_id available.'
                : 'OAuth Client ID not configured. Check admin settings.');
        }
        
        // Generate PKCE values
        const codeVerifier = generateRandomString(64);
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        const state = generateRandomString(32);
        
        // Store PKCE state for callback verification
        sessionStorage.setItem(PKCE_KEYS.CODE_VERIFIER, codeVerifier);
        sessionStorage.setItem(PKCE_KEYS.STATE, state);
        
        // Build authorization URL
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            scope: config.scopes,
            state: state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256'
        });
        
        return `${config.authorizeUrl}?${params.toString()}`;
    },
    
    // Exchange authorization code for tokens (called from callback page)
    async exchangeCode(code, state) {
        // Verify state parameter (CSRF protection)
        const savedState = sessionStorage.getItem(PKCE_KEYS.STATE);
        if (!savedState || savedState !== state) {
            throw new Error('Invalid state parameter — possible CSRF attack');
        }
        
        const codeVerifier = sessionStorage.getItem(PKCE_KEYS.CODE_VERIFIER);
        if (!codeVerifier) {
            throw new Error('Missing code verifier — auth flow may have expired');
        }
        
        const config = this.getAuthConfig();
        
        // Exchange through the Lambda token proxy (server-to-server, no browser CORS dependency
        // on Glean). For DCR the proxy relays a public-client request; for static it injects the
        // client_secret. Identical request shape for both modes.
        const response = await fetch(config.tokenProxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: config.redirectUri,
                client_id: config.clientId,
                code_verifier: codeVerifier
            })
        });
        
        // Clean up PKCE state
        sessionStorage.removeItem(PKCE_KEYS.CODE_VERIFIER);
        sessionStorage.removeItem(PKCE_KEYS.STATE);
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Token exchange failed' }));
            // If DCR mode and "unknown client" error, clear cached client and suggest re-auth
            if (config.isDCR && (error.error === 'invalid_client' || (error.error_description || '').includes('unknown client'))) {
                this.clearDCRClient();
                throw new Error('DCR client expired — please sign in again.');
            }
            throw new Error(error.error_description || error.error || `HTTP ${response.status}`);
        }
        
        const tokenData = await response.json();
        this.storeTokens(tokenData);
        
        return tokenData;
    },
    
    // Refresh access token using refresh token (with loop prevention)
    async refreshAccessToken() {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) {
            throw new Error('No refresh token available');
        }
        
        // Loop prevention: enforce minimum interval between attempts
        const now = Date.now();
        const timeSinceLastAttempt = now - lastRefreshAttempt;
        const backoffMs = Math.min(
            MIN_REFRESH_INTERVAL_MS * Math.pow(2, consecutiveFailures),
            MAX_BACKOFF_MS
        );
        
        if (timeSinceLastAttempt < backoffMs) {
            const waitSec = Math.round((backoffMs - timeSinceLastAttempt) / 1000);
            console.warn(`[OAUTH] Refresh throttled, retry in ${waitSec}s (failures: ${consecutiveFailures})`);
            throw new Error(`Refresh throttled, retry in ${waitSec}s`);
        }
        
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            console.error('[OAUTH] Max refresh failures reached, requires re-auth');
            this.clearTokens();
            throw new Error('Max refresh failures — re-authentication required');
        }
        
        lastRefreshAttempt = now;
        
        const config = this.getAuthConfig();
        
        try {
            // Refresh through the Lambda token proxy (server-to-server) for both modes, same as
            // the initial exchange — avoids the browser CORS dependency on Glean's token endpoint.
            const response = await fetch(config.tokenProxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                    client_id: config.clientId
                })
            });
            
            if (!response.ok) {
                consecutiveFailures++;
                console.warn(`[OAUTH] Refresh failed (attempt ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
                // If DCR mode and invalid_client, clear DCR cache for re-registration
                if (config.isDCR) {
                    const errBody = await response.json().catch(() => ({}));
                    if (errBody.error === 'invalid_client') {
                        this.clearDCRClient();
                    }
                }
                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    this.clearTokens();
                }
                throw new Error('Refresh token expired or revoked');
            }
            
            const tokenData = await response.json();
            this.storeTokens(tokenData);
            
            // Reset failure counter on success
            consecutiveFailures = 0;
            
            return tokenData;
        } catch (error) {
            if (!error.message.includes('expired or revoked')) {
                consecutiveFailures++;
            }
            throw error;
        }
    },
    
    // Store tokens from token response
    storeTokens(tokenData) {
        if (tokenData.access_token) {
            localStorage.setItem(TOKEN_KEYS.ACCESS_TOKEN, tokenData.access_token);
        }
        if (tokenData.refresh_token) {
            localStorage.setItem(TOKEN_KEYS.REFRESH_TOKEN, tokenData.refresh_token);
        }
        if (tokenData.id_token) {
            localStorage.setItem(TOKEN_KEYS.ID_TOKEN, tokenData.id_token);
        }
        if (tokenData.expires_in) {
            const expiryMs = Date.now() + (tokenData.expires_in * 1000);
            localStorage.setItem(TOKEN_KEYS.TOKEN_EXPIRY, expiryMs.toString());
        }
        console.log('[OAUTH] Tokens stored, expires_in:', tokenData.expires_in);
    },
    
    // Get stored access token
    getAccessToken() {
        return localStorage.getItem(TOKEN_KEYS.ACCESS_TOKEN);
    },
    
    // Get stored refresh token
    getRefreshToken() {
        return localStorage.getItem(TOKEN_KEYS.REFRESH_TOKEN);
    },
    
    // Get stored ID token
    getIdToken() {
        return localStorage.getItem(TOKEN_KEYS.ID_TOKEN);
    },
    
    // Check if access token is expired or near expiry
    isTokenExpired(bufferSeconds = 60) {
        const expiry = localStorage.getItem(TOKEN_KEYS.TOKEN_EXPIRY);
        if (!expiry) return true;
        
        const expiryMs = parseInt(expiry, 10);
        return Date.now() > (expiryMs - (bufferSeconds * 1000));
    },
    
    // Check if user has a valid (non-expired) access token
    isAuthenticated() {
        const token = this.getAccessToken();
        return !!token && !this.isTokenExpired();
    },
    
    // Get a valid access token, refreshing if needed
    async getValidToken() {
        if (!this.isTokenExpired(60)) {
            return this.getAccessToken();
        }
        
        // Token expired or near expiry — try refresh
        const refreshToken = this.getRefreshToken();
        if (refreshToken) {
            try {
                const tokenData = await this.refreshAccessToken();
                return tokenData.access_token;
            } catch (error) {
                console.warn('[OAUTH] Token refresh failed:', error.message);
                // Fall through — caller should initiate re-auth
            }
        }
        
        return null; // No valid token, needs re-auth
    },
    
    // Extract email from JWT access token (for admin check, display)
    getEmailFromToken() {
        const token = this.getAccessToken() || this.getIdToken();
        if (!token) return null;
        
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.email || payload.preferred_username || null;
        } catch (e) {
            console.warn('[OAUTH] Failed to decode token:', e.message);
            return null;
        }
    },
    
    // Clear all stored tokens (logout) — preserves DCR client_id by default
    clearTokens(clearDCR = false) {
        Object.entries(TOKEN_KEYS).forEach(([name, key]) => {
            if (name === 'DCR_CLIENT_ID' && !clearDCR) return;
            localStorage.removeItem(key);
        });
        Object.values(PKCE_KEYS).forEach(key => sessionStorage.removeItem(key));
        console.log('[OAUTH] Tokens cleared' + (clearDCR ? ' (including DCR client)' : ''));
    },
    
    // Reset failure counter (call after successful login)
    resetRefreshState() {
        consecutiveFailures = 0;
        lastRefreshAttempt = 0;
    },
    
    // Start silent refresh timer (call after login)
    startRefreshTimer() {
        const expiry = localStorage.getItem(TOKEN_KEYS.TOKEN_EXPIRY);
        if (!expiry) return;
        
        const expiryMs = parseInt(expiry, 10);
        const now = Date.now();
        const ttl = expiryMs - now;
        
        if (ttl <= 0) {
            console.warn('[OAUTH] Token already expired, dispatching re-auth event');
            window.dispatchEvent(new CustomEvent('oauth-token-expired'));
            return;
        }
        
        // Refresh at 80% of TTL
        const refreshDelay = Math.max(ttl * 0.8, 10000); // Min 10 seconds
        
        console.log(`[OAUTH] Scheduling token refresh in ${Math.round(refreshDelay / 1000)}s`);
        
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
        }
        
        this._refreshTimer = setTimeout(async () => {
            try {
                await this.refreshAccessToken();
                console.log('[OAUTH] Silent refresh succeeded');
                this.startRefreshTimer(); // Schedule next refresh
            } catch (error) {
                console.warn('[OAUTH] Silent refresh failed:', error.message);
                // Dispatch event so UI can prompt re-auth via Dialog API
                window.dispatchEvent(new CustomEvent('oauth-token-expired', {
                    detail: { reason: error.message, failures: consecutiveFailures }
                }));
            }
        }, refreshDelay);
    },
    
    // Stop refresh timer (call on logout)
    stopRefreshTimer() {
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
            this._refreshTimer = null;
        }
    },
    
    _refreshTimer: null
};
