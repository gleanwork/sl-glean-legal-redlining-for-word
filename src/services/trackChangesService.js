// Track Changes Service
// Handles applying changes using Word's native Track Changes API

import { ApplyResult } from '../models/changeModels.js';

export const trackChangesService = {
    /**
     * Enable Track Changes mode in Word
     * @returns {Promise<boolean>} Success status
     */
    async enableTrackChanges() {
        try {
            return await Word.run(async (context) => {
                context.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
                await context.sync();
                console.log('[TRACK CHANGES] ✓ Track changes enabled');
                return true;
            });
        } catch (error) {
            console.error('[TRACK CHANGES] Error enabling track changes:', error);
            console.warn('[TRACK CHANGES] Fallback: Please enable track changes manually (Review tab → Track Changes)');
            return false;
        }
    },

    /**
     * Disable Track Changes mode in Word
     * @returns {Promise<boolean>} Success status
     */
    async disableTrackChanges() {
        try {
            return await Word.run(async (context) => {
                context.document.changeTrackingMode = Word.ChangeTrackingMode.off;
                await context.sync();
                console.log('[TRACK CHANGES] ✓ Track changes disabled');
                return true;
            });
        } catch (error) {
            console.error('[TRACK CHANGES] Error disabling track changes:', error);
            return false;
        }
    },

    /**
     * Get current Track Changes status
     * @returns {Promise<string>} Current mode: 'off', 'trackAll', or 'trackMineOnly'
     */
    async getTrackChangesStatus() {
        try {
            return await Word.run(async (context) => {
                const document = context.document;
                document.load('changeTrackingMode');
                await context.sync();
                
                const mode = document.changeTrackingMode;
                console.log('[TRACK CHANGES] Current mode:', mode);
                return mode;
            });
        } catch (error) {
            console.error('[TRACK CHANGES] Error getting status:', error);
            return 'unknown';
        }
    },

    /**
     * Find text in the document using Word's search API with progressive fallback strategies
     * @param {string} searchText - Text to search for
     * @param {Object} context - Word.run context
     * @param {string} changeId - Change ID for logging purposes
     * @param {string} changeType - Type of change ('replace', 'delete', 'insert', 'insertClause')
     *   Delete operations allow multiple matches (any duplicate occurrence is valid to remove).
     *   Replace operations reject multiple matches to avoid modifying the wrong occurrence.
     * @returns {Promise<Object>} Object with {range, strategy} or {range: null, strategy: null, diagnostics}
     */
    async findText(searchText, context, changeId = 'unknown', changeType = 'replace') {
        try {
            // Preprocess search text to remove XML formatting artifacts (literal newlines)
            const cleanedSearchText = searchText
                .replace(/\n/g, ' ')      // Replace literal newlines with spaces
                .replace(/\s+/g, ' ')      // Collapse multiple spaces to single space
                .trim();                    // Remove leading/trailing whitespace
            
            // Word's body.search() has a 255-character limit on desktop (office-js #31, #168, #320)
            const WORD_SEARCH_CHAR_LIMIT = 255;
            
            // Track whether failure was due to multiple matches (for error reporting)
            let multipleMatchesDetected = false;
            let multipleMatchCount = 0;
            
            // For delete operations, multiple matches are acceptable (any duplicate is valid to remove)
            const allowMultiple = (changeType === 'delete');
            
            // Strategy 1: Exact match with ignoreSpace (only if within character limit)
            if (cleanedSearchText.length <= WORD_SEARCH_CHAR_LIMIT) {
                const exactResult = await this._searchWithStrategy(
                    context, 
                    cleanedSearchText, 
                    'exact',
                    changeId,
                    {},
                    allowMultiple
                );
                
                if (exactResult.found) {
                    console.log(`[TRACK CHANGES] ✓ Found match using EXACT strategy for ${changeId}`);
                    return { range: exactResult.range, strategy: 'exact' };
                }
                
                // Track if failure was due to multiple matches for diagnostics
                if (exactResult.multipleMatches) {
                    multipleMatchesDetected = true;
                    multipleMatchCount = exactResult.matchCount;
                }
                
                // Strategy 1b: Exact match with ignorePunct (handles curly quotes, em-dashes, etc.)
                const ignorePunctResult = await this._searchWithStrategy(
                    context,
                    cleanedSearchText,
                    'exact_ignorepunct',
                    changeId,
                    { ignorePunct: true },
                    allowMultiple
                );
                
                if (ignorePunctResult.found) {
                    console.log(`[TRACK CHANGES] ✓ Found match using EXACT_IGNOREPUNCT strategy for ${changeId}`);
                    return { range: ignorePunctResult.range, strategy: 'exact_ignorepunct' };
                }
                
                if (ignorePunctResult.multipleMatches) {
                    multipleMatchesDetected = true;
                    multipleMatchCount = ignorePunctResult.matchCount;
                }
            } else {
                console.log(`[TRACK CHANGES] Skipping exact strategies: text (${cleanedSearchText.length} chars) exceeds ${WORD_SEARCH_CHAR_LIMIT}-char Word search limit for ${changeId}`);
            }
            
            // Strategy 2: Substring matching (first 100 + last 100 chars)
            if (cleanedSearchText.length > 150) {
                const substringResult = await this._searchWithSubstring(
                    context,
                    cleanedSearchText,
                    changeId
                );
                
                if (substringResult.found) {
                    console.log(`[TRACK CHANGES] ✓ Found match using SUBSTRING strategy for ${changeId}`);
                    return { range: substringResult.range, strategy: 'substring' };
                }
            }
            
            // Strategy 3: Key phrase matching (extract distinctive phrases)
            const keyPhraseResult = await this._searchWithKeyPhrases(
                context,
                cleanedSearchText,
                changeId
            );
            
            if (keyPhraseResult.found) {
                console.log(`[TRACK CHANGES] ✓ Found match using KEY_PHRASE strategy for ${changeId}`);
                return { range: keyPhraseResult.range, strategy: 'key_phrase' };
            }
            
            // Strategy 4: Position-based key phrase (same approach as navigation)
            // Takes middle 30% of text which is more likely to match even if start/end differ
            if (cleanedSearchText.length >= 100) {
                const positionKeyPhraseResult = await this._searchWithPositionKeyPhrase(
                    context,
                    cleanedSearchText,
                    changeId,
                    allowMultiple
                );
                
                if (positionKeyPhraseResult.found) {
                    console.log(`[TRACK CHANGES] ✓ Found match using POSITION_KEY_PHRASE strategy for ${changeId}`);
                    return { range: positionKeyPhraseResult.range, strategy: 'position_key_phrase' };
                }
            }
            
            // All strategies failed - provide detailed diagnostics
            console.error(`[TRACK CHANGES] ✗ All search strategies failed for ${changeId}`);
            console.error(`[TRACK CHANGES] Full search text (${cleanedSearchText.length} chars):`);
            console.error(cleanedSearchText);
            if (multipleMatchesDetected) {
                console.error(`[TRACK CHANGES] Root cause: text matched ${multipleMatchCount} times (ambiguous)`);
            }
            
            return {
                range: null,
                strategy: null,
                multipleMatches: multipleMatchesDetected,
                matchCount: multipleMatchCount,
                diagnostics: {
                    searchTextLength: cleanedSearchText.length,
                    fullSearchText: cleanedSearchText,
                    originalSearchText: searchText,
                    strategiesTried: ['exact', 'exact_ignorepunct', 'substring', 'key_phrase', 'position_key_phrase'],
                    multipleMatches: multipleMatchesDetected,
                    matchCount: multipleMatchCount
                }
            };
            
        } catch (error) {
            console.error(`[TRACK CHANGES] Error in findText for ${changeId}:`, error);
            return {
                range: null,
                strategy: null,
                diagnostics: {
                    error: error.message,
                    fullSearchText: searchText
                }
            };
        }
    },

    /**
     * Generate user-friendly error message for failed text search
     * @private
     */
    _generateSearchErrorMessage(searchResult, searchText, changeType) {
        // Check if failure was due to multiple matches (ambiguous)
        if (searchResult.multipleMatches) {
            return `This text appears multiple times in your document, so it couldn't be applied automatically. Please apply this change manually.`;
        }
        
        // Standard "not found" error
        let errorMsg = '';
        switch (changeType) {
            case 'replace':
                errorMsg = 'Could not find this text in your document. It may have been modified or removed. Please apply manually if needed.';
                break;
            case 'delete':
                errorMsg = 'Could not find the text to remove. It may have been modified or removed. Please apply manually if needed.';
                break;
            case 'insert':
                errorMsg = 'Could not find the insertion point in your document. Please apply manually if needed.';
                break;
            case 'insertClause':
                errorMsg = 'Could not find the target section for this new clause. Please apply manually if needed.';
                break;
            default:
                errorMsg = 'Could not locate this text in your document. Please apply manually if needed.';
        }
        
        return errorMsg;
    },

    /**
     * Normalize text for comparison (same preprocessing as findText)
     * @private
     */
    _normalizeText(text) {
        if (!text) return '';
        return text
            .replace(/\n/g, ' ')      // Replace literal newlines with spaces
            .replace(/\s+/g, ' ')      // Collapse multiple spaces to single space
            .trim();                    // Remove leading/trailing whitespace
    },

    /**
     * Get the text that will be modified by a change
     * @private
     */
    _getModificationText(change) {
        switch (change.type) {
            case 'replace':
            case 'delete':
                return this._normalizeText(change.searchText);
            case 'insert':
            case 'insertClause':
                // These types don't modify existing text, they add after
                return '';
            default:
                return '';
        }
    },

    /**
     * Get the anchor text used to locate where a change should be applied
     * @private
     */
    _getAnchorText(change) {
        switch (change.type) {
            case 'replace':
            case 'delete':
                return this._normalizeText(change.searchText);
            case 'insert':
                return this._normalizeText(change.afterText);
            case 'insertClause':
                return this._normalizeText(change.afterSection);
            default:
                return '';
        }
    },

    /**
     * Detect conflicting changes that reference overlapping text at overlapping positions
     * Returns a Map of changeId -> conflict reason
     * @private
     * @param {Array<{change: TrackedChange, position: number}>} changesWithPositions - Changes with their document positions
     */
    _detectConflictingChanges(changesWithPositions) {
        const conflicts = new Map();
        
        // Check each pair of changes for conflicts
        for (let i = 0; i < changesWithPositions.length; i++) {
            const itemA = changesWithPositions[i];
            const changeA = itemA.change;
            const positionA = itemA.position;
            
            // Skip if position is unknown
            if (positionA === null || positionA === Number.MAX_SAFE_INTEGER) {
                continue;
            }
            
            const modificationText = this._getModificationText(changeA);
            
            // Skip if this change doesn't modify existing text
            if (!modificationText || modificationText.length === 0) {
                continue;
            }
            
            // Calculate the range that changeA modifies
            const modificationStart = positionA;
            const modificationEnd = positionA + modificationText.length;
            
            for (let j = i + 1; j < changesWithPositions.length; j++) {
                // Only check later changes (j > i) to avoid marking both sides as conflicted
                // This allows the first occurrence to proceed while skipping duplicates
                
                const itemB = changesWithPositions[j];
                const changeB = itemB.change;
                const positionB = itemB.position;
                
                // Skip if position is unknown
                if (positionB === null || positionB === Number.MAX_SAFE_INTEGER) {
                    continue;
                }
                
                const anchorText = this._getAnchorText(changeB);
                
                // Skip if no anchor text
                if (!anchorText || anchorText.length === 0) {
                    continue;
                }
                
                // Calculate the range where changeB's anchor is located
                const anchorStart = positionB;
                const anchorEnd = positionB + anchorText.length;
                
                // Check if the position ranges overlap in the document
                // Ranges overlap if: (startA <= endB) AND (endA >= startB)
                const positionsOverlap = (modificationStart <= anchorEnd) && (modificationEnd >= anchorStart);
                
                if (positionsOverlap) {
                    // Position ranges overlap - now check if text also overlaps
                    const aContainsB = anchorText.includes(modificationText);
                    const bContainsA = modificationText.includes(anchorText);
                    
                    if (aContainsB || bContainsA) {
                        // Found a true conflict - both position and text overlap.
                        // Prefer the MORE COMPREHENSIVE change (larger searchText = superset).
                        // Mark the subset (smaller) change as conflicted so the superset is applied.
                        const aLen = modificationText.length;
                        const bLen = anchorText.length;
                        
                        let winnerId, loserId;
                        if (bLen > aLen) {
                            // changeB is the superset — mark changeA as conflicted
                            winnerId = changeB.id;
                            loserId = changeA.id;
                        } else {
                            // changeA is the superset (or equal) — mark changeB as conflicted
                            winnerId = changeA.id;
                            loserId = changeB.id;
                        }
                        
                        const winnerNum = winnerId.replace('change_', '');
                        const reason = `Skipped — this change overlaps with Change ${winnerNum}, which is a broader change that was already applied. ` +
                                     `Review Change ${winnerNum} and apply this one manually if still needed.`;
                        
                        conflicts.set(loserId, reason);
                        
                        console.warn(`[TRACK CHANGES] Conflict detected: ${loserId} is a subset of ${winnerId} — skipping ${loserId}`);
                    }
                }
            }
        }
        
        return conflicts;
    },

    /**
     * Search using exact match with ignoreSpace and optional additional search options
     * @private
     * @param {Object} context - Word.run context
     * @param {string} searchText - Text to search for
     * @param {string} strategyName - Name of strategy for logging
     * @param {string} changeId - Change ID for logging
     * @param {Object} [extraOptions={}] - Additional Word search options (e.g., { ignorePunct: true })
     * @param {boolean} [allowMultiple=false] - If true, use first match when multiple found (for delete ops)
     */
    async _searchWithStrategy(context, searchText, strategyName, changeId, extraOptions = {}, allowMultiple = false) {
        try {
            const searchOptions = {
                matchCase: false,
                matchWholeWord: false,
                ignoreSpace: true,
                ...extraOptions
            };
            
            const searchResults = context.document.body.search(searchText, searchOptions);
            
            searchResults.load('items');
            await context.sync();
            
            if (searchResults.items.length === 0) {
                console.warn(`[TRACK CHANGES] ${strategyName.toUpperCase()} strategy: No matches for ${changeId}`);
                return { found: false, range: null };
            }
            
            if (searchResults.items.length > 1) {
                console.warn(`[TRACK CHANGES] ${strategyName.toUpperCase()} strategy: Multiple matches (${searchResults.items.length}) for ${changeId}`);
                
                // For EXACT-type strategies with multiple matches:
                if (strategyName === 'exact' || strategyName === 'exact_ignorepunct') {
                    if (allowMultiple) {
                        // Delete operations: any occurrence of duplicated text is valid to remove.
                        // Use the FIRST match — changes are applied bottom-to-top, so the first
                        // match (topmost in document) is the safest choice to avoid position shifts.
                        console.log(`[TRACK CHANGES] ${strategyName.toUpperCase()} strategy: Multiple matches (${searchResults.items.length}) but allowMultiple=true — using first match for ${changeId}`);
                    } else {
                        // Replace operations: ambiguous — we can't be sure which occurrence to modify.
                        console.error(`[TRACK CHANGES] ${strategyName.toUpperCase()} strategy: Failing due to ambiguous matches for ${changeId}`);
                        return { 
                            found: false, 
                            range: null,
                            multipleMatches: true,
                            matchCount: searchResults.items.length
                        };
                    }
                } else {
                    // For fallback strategies, proceed with first match (best effort)
                    console.warn(`[TRACK CHANGES] ${strategyName.toUpperCase()} strategy: Using first match as fallback for ${changeId}`);
                }
            }
            
            const range = searchResults.items[0];
            range.load('text');
            await context.sync();
            
            return { found: true, range };
            
        } catch (error) {
            console.error(`[TRACK CHANGES] Error in ${strategyName} strategy:`, error);
            return { found: false, range: null };
        }
    },

    /**
     * Search using substring matching (beginning and end)
     * Uses bookend approach: finds first N chars and last N chars independently,
     * then validates by checking the span length is reasonable.
     * This handles multi-paragraph text that the old same-paragraph check missed.
     * @private
     */
    async _searchWithSubstring(context, searchText, changeId) {
        try {
            // Extract first 100 and last 100 characters
            const firstPart = searchText.substring(0, 100).trim();
            const lastPart = searchText.substring(searchText.length - 100).trim();
            
            console.log(`[TRACK CHANGES] SUBSTRING strategy: Searching for first 100 + last 100 chars for ${changeId}`);
            
            // Search for both parts independently
            const firstResults = context.document.body.search(firstPart, {
                matchCase: false,
                matchWholeWord: false,
                ignoreSpace: true
            });
            const lastResults = context.document.body.search(lastPart, {
                matchCase: false,
                matchWholeWord: false,
                ignoreSpace: true
            });
            
            firstResults.load('items');
            lastResults.load('items');
            await context.sync();
            
            if (firstResults.items.length === 0) {
                console.warn(`[TRACK CHANGES] SUBSTRING strategy: First part not found for ${changeId}`);
                return { found: false, range: null };
            }
            
            if (lastResults.items.length === 0) {
                console.warn(`[TRACK CHANGES] SUBSTRING strategy: Last part not found for ${changeId}`);
                return { found: false, range: null };
            }
            
            console.log(`[TRACK CHANGES] SUBSTRING strategy: First part matches=${firstResults.items.length}, Last part matches=${lastResults.items.length} for ${changeId}`);
            
            // Try each first/last pair to find a span with reasonable length
            for (let i = 0; i < Math.min(firstResults.items.length, 3); i++) {
                for (let j = 0; j < Math.min(lastResults.items.length, 3); j++) {
                    try {
                        const candidateRange = firstResults.items[i].expandTo(lastResults.items[j]);
                        candidateRange.load('text');
                        await context.sync();
                        
                        // Sanity check: expanded range should be close to the full text length
                        const lengthRatio = candidateRange.text.length / searchText.length;
                        if (lengthRatio >= 0.7 && lengthRatio <= 1.4) {
                            console.log(`[TRACK CHANGES] SUBSTRING strategy: Found valid span (ratio: ${lengthRatio.toFixed(2)}) for ${changeId}`);
                            return { found: true, range: firstResults.items[i] };
                        }
                    } catch (e) {
                        // expandTo fails if ranges are in wrong order — skip this pair
                        continue;
                    }
                }
            }
            
            // Fallback: if we have exactly one first-part match, use it even without
            // last-part validation (better than failing entirely)
            if (firstResults.items.length === 1) {
                console.log(`[TRACK CHANGES] SUBSTRING strategy: Using sole first-part match as fallback for ${changeId}`);
                const range = firstResults.items[0];
                range.load('text');
                await context.sync();
                return { found: true, range };
            }
            
            console.warn(`[TRACK CHANGES] SUBSTRING strategy: No valid span found for ${changeId}`);
            return { found: false, range: null };
            
        } catch (error) {
            console.error(`[TRACK CHANGES] Error in SUBSTRING strategy:`, error);
            return { found: false, range: null };
        }
    },

    /**
     * Search using key distinctive phrases
     * @private
     */
    async _searchWithKeyPhrases(context, searchText, changeId) {
        try {
            // Extract potential key phrases (quoted text, capitalized terms, etc.)
            const keyPhrases = this._extractKeyPhrases(searchText);
            
            if (keyPhrases.length === 0) {
                console.warn(`[TRACK CHANGES] KEY_PHRASE strategy: No distinctive phrases found for ${changeId}`);
                return { found: false, range: null };
            }
            
            console.log(`[TRACK CHANGES] KEY_PHRASE strategy: Found ${keyPhrases.length} key phrases for ${changeId}`);
            
            // Try each key phrase
            for (const phrase of keyPhrases) {
                const results = context.document.body.search(phrase, {
                    matchCase: false,
                    matchWholeWord: false,
                    ignoreSpace: true
                });
                
                results.load('items');
                await context.sync();
                
                if (results.items.length > 0 && results.items.length <= 3) {
                    // Found a phrase with reasonable number of matches
                    console.log(`[TRACK CHANGES] KEY_PHRASE strategy: Found match for phrase "${phrase.substring(0, 30)}..." for ${changeId}`);
                    const range = results.items[0];
                    range.load('text');
                    await context.sync();
                    return { found: true, range };
                }
            }
            
            console.warn(`[TRACK CHANGES] KEY_PHRASE strategy: No unique phrases found for ${changeId}`);
            return { found: false, range: null };
            
        } catch (error) {
            console.error(`[TRACK CHANGES] Error in KEY_PHRASE strategy:`, error);
            return { found: false, range: null };
        }
    },

    /**
     * Extract distinctive key phrases from text
     * @private
     */
    _extractKeyPhrases(text) {
        const phrases = [];
        
        // Extract quoted text
        const quotedMatches = text.match(/"[^"]{10,}?"/g);
        if (quotedMatches) {
            phrases.push(...quotedMatches.map(m => m.replace(/"/g, '')));
        }
        
        // Extract capitalized phrases (likely section headers or defined terms)
        const capitalizedMatches = text.match(/\b[A-Z][A-Z\s]{10,}?[.,:;]/g);
        if (capitalizedMatches) {
            phrases.push(...capitalizedMatches.map(m => m.trim()));
        }
        
        // Extract phrases with special punctuation patterns
        const specialMatches = text.match(/\([^)]{15,}?\)/g);
        if (specialMatches) {
            phrases.push(...specialMatches.slice(0, 3));
        }
        
        // Return unique phrases, sorted by length (longer = more distinctive)
        return [...new Set(phrases)]
            .filter(p => p.length >= 15 && p.length <= 100)
            .sort((a, b) => b.length - a.length)
            .slice(0, 5);
    },

    /**
     * Search using position-based key phrase extraction (like navigation uses)
     * Takes the middle 30% of the text which is more likely to match even if start/end differ
     * @private
     * @param {boolean} [allowMultiple=false] - If true, use first match when multiple found (for delete ops)
     */
    async _searchWithPositionKeyPhrase(context, searchText, changeId, allowMultiple = false) {
        try {
            // Only use for longer text where middle extraction makes sense
            if (searchText.length < 100) {
                console.log(`[TRACK CHANGES] POSITION_KEY_PHRASE strategy: Text too short (${searchText.length} chars) for ${changeId}`);
                return { found: false, range: null };
            }
            
            // Take middle 30% of text (same approach as navigation in app.js)
            const start = Math.floor(searchText.length * 0.3);
            const length = Math.min(150, searchText.length - start);
            const middlePhrase = searchText.substring(start, start + length).trim();
            
            if (middlePhrase.length < 50) {
                console.log(`[TRACK CHANGES] POSITION_KEY_PHRASE strategy: Middle phrase too short for ${changeId}`);
                return { found: false, range: null };
            }
            
            console.log(`[TRACK CHANGES] POSITION_KEY_PHRASE strategy: Searching for middle ${length} chars for ${changeId}`);
            console.log(`[TRACK CHANGES] POSITION_KEY_PHRASE strategy: "${middlePhrase.substring(0, 50)}..."`);
            
            const results = context.document.body.search(middlePhrase, {
                matchCase: false,
                matchWholeWord: false,
                ignoreSpace: true
            });
            
            results.load('items');
            await context.sync();
            
            if (results.items.length === 1) {
                console.log(`[TRACK CHANGES] POSITION_KEY_PHRASE strategy: Found unique match for ${changeId}`);
                const range = results.items[0];
                range.load('text');
                await context.sync();
                return { found: true, range };
            } else if (results.items.length > 1) {
                if (allowMultiple) {
                    // Delete operations: any occurrence is valid to remove
                    console.log(`[TRACK CHANGES] POSITION_KEY_PHRASE strategy: Multiple matches (${results.items.length}) but allowMultiple=true — using first match for ${changeId}`);
                    const range = results.items[0];
                    range.load('text');
                    await context.sync();
                    return { found: true, range };
                }
                console.warn(`[TRACK CHANGES] POSITION_KEY_PHRASE strategy: Multiple matches (${results.items.length}) - too ambiguous for ${changeId}`);
                return { found: false, range: null };
            } else {
                console.warn(`[TRACK CHANGES] POSITION_KEY_PHRASE strategy: No matches found for ${changeId}`);
                return { found: false, range: null };
            }
            
        } catch (error) {
            console.error(`[TRACK CHANGES] Error in POSITION_KEY_PHRASE strategy:`, error);
            return { found: false, range: null };
        }
    },

    /**
     * Expand a partial match range to cover the full searchText using bookend matching.
     * Searches for the first N chars and last N chars of the full text independently,
     * then uses expandTo() to span the precise range. Falls back to paragraph-based
     * expansion if bookend matching fails.
     * @private
     * @param {Object} context - Word.run context
     * @param {Word.Range} partialRange - The range from a partial match (substring/key_phrase)
     * @param {string} fullSearchText - The complete text we want to cover
     * @param {string} changeId - Change ID for logging
     * @returns {Promise<Word.Range>} Expanded range covering the full text
     */
    async _expandToFullRange(context, partialRange, fullSearchText, changeId) {
        const WORD_SEARCH_CHAR_LIMIT = 255;
        const normalizedText = this._normalizeText(fullSearchText);
        
        // For short text that fits in a single search, no expansion needed
        if (normalizedText.length <= WORD_SEARCH_CHAR_LIMIT) {
            console.log(`[TRACK CHANGES] Text fits in search limit, no expansion needed for ${changeId}`);
            return partialRange;
        }
        
        // Bookend approach: search for start and end fragments independently
        const bookendLength = Math.min(200, Math.floor(normalizedText.length / 3));
        const startFragment = normalizedText.substring(0, bookendLength).trim();
        const endFragment = normalizedText.substring(normalizedText.length - bookendLength).trim();
        
        console.log(`[TRACK CHANGES] Bookend expansion: searching for first ${startFragment.length} and last ${endFragment.length} chars for ${changeId}`);
        
        try {
            // Search for start fragment
            const startResults = context.document.body.search(startFragment, {
                matchCase: false,
                matchWholeWord: false,
                ignoreSpace: true
            });
            startResults.load('items');
            await context.sync();
            
            // Search for end fragment
            const endResults = context.document.body.search(endFragment, {
                matchCase: false,
                matchWholeWord: false,
                ignoreSpace: true
            });
            endResults.load('items');
            await context.sync();
            
            if (startResults.items.length === 1 && endResults.items.length === 1) {
                // Ideal case: unique start and end matches
                const expandedRange = startResults.items[0].expandTo(endResults.items[0]);
                console.log(`[TRACK CHANGES] Bookend expansion: unique start+end matches for ${changeId}`);
                return expandedRange;
            }
            
            if (startResults.items.length >= 1 && endResults.items.length >= 1) {
                // Multiple matches — pick the start/end pair closest to our partial match
                // Load text for comparison
                for (const item of startResults.items) { item.load('text'); }
                for (const item of endResults.items) { item.load('text'); }
                partialRange.load('text');
                await context.sync();
                
                // Use the first start match and last end match that are near the partial range
                // (heuristic: try each start, expand to each end, check if reasonable)
                for (const startRange of startResults.items) {
                    for (const endRange of endResults.items) {
                        try {
                            const candidateRange = startRange.expandTo(endRange);
                            candidateRange.load('text');
                            await context.sync();
                            
                            // Sanity check: expanded range length should be close to the full text length
                            const lengthRatio = candidateRange.text.length / normalizedText.length;
                            if (lengthRatio >= 0.8 && lengthRatio <= 1.3) {
                                console.log(`[TRACK CHANGES] Bookend expansion: found reasonable range (ratio: ${lengthRatio.toFixed(2)}) for ${changeId}`);
                                return candidateRange;
                            }
                        } catch (e) {
                            // expandTo fails if ranges are in wrong order — skip this pair
                            continue;
                        }
                    }
                }
                
                console.warn(`[TRACK CHANGES] Bookend expansion: no reasonable start+end pair found for ${changeId}`);
            } else {
                console.warn(`[TRACK CHANGES] Bookend expansion: start matches=${startResults.items.length}, end matches=${endResults.items.length} for ${changeId}`);
            }
        } catch (bookendError) {
            console.warn(`[TRACK CHANGES] Bookend expansion failed for ${changeId}:`, bookendError);
        }
        
        // Fallback: paragraph-based expansion (original approach)
        console.log(`[TRACK CHANGES] Falling back to paragraph expansion for ${changeId}`);
        return await this._expandByParagraphs(context, partialRange, normalizedText.length, changeId);
    },

    /**
     * Fallback range expansion using paragraph walking (original approach)
     * @private
     */
    async _expandByParagraphs(context, partialRange, fullTextLength, changeId) {
        const estimatedParagraphs = Math.ceil(fullTextLength / 500);
        console.log(`[TRACK CHANGES] Paragraph expansion: ${fullTextLength} chars, ~${estimatedParagraphs} paragraphs for ${changeId}`);
        
        const startParagraph = partialRange.paragraphs.getFirst();
        startParagraph.load('text');
        await context.sync();
        
        let expandedRange = partialRange.getRange();
        let currentParagraph = startParagraph;
        
        for (let i = 1; i < Math.min(estimatedParagraphs, 20); i++) {
            try {
                const nextParagraph = currentParagraph.getNext();
                nextParagraph.load('text');
                await context.sync();
                
                expandedRange = expandedRange.expandTo(nextParagraph.getRange());
                currentParagraph = nextParagraph;
            } catch (e) {
                console.log(`[TRACK CHANGES] Reached end of document after ${i} paragraphs`);
                break;
            }
        }
        
        return expandedRange;
    },

    /**
     * Apply a single change as a tracked change
     * @param {TrackedChange} change - Change to apply
     * @returns {Promise<Object>} Result with success status
     */
    async applyChangeAsTracked(change) {
        console.log(`[TRACK CHANGES] Applying change ${change.id} (${change.type})`);
        
        return Word.run(async (context) => {
            let searchResult;
            let strategy = null;
            
            // Apply change based on type
            switch (change.type) {
                case 'replace': {
                    // Find the text to replace
                    searchResult = await this.findText(change.searchText, context, change.id, change.type);
                    if (!searchResult.range) {
                        throw new Error(this._generateSearchErrorMessage(searchResult, change.searchText, 'replace'));
                    }
                    strategy = searchResult.strategy;
                    
                    // If we used a partial-match strategy, expand range to cover full text
                    if (strategy === 'substring' || strategy === 'key_phrase' || strategy === 'position_key_phrase') {
                        console.warn(`[TRACK CHANGES] Replace used ${strategy} strategy - expanding range to cover full text`);
                        
                        try {
                            const expandedRange = await this._expandToFullRange(context, searchResult.range, change.searchText, change.id);
                            expandedRange.insertText(change.replaceWith, Word.InsertLocation.replace);
                            await context.sync();
                            console.log('[TRACK CHANGES] Replaced expanded range');
                        } catch (expandError) {
                            console.warn('[TRACK CHANGES] Expanded replace failed, trying delete-then-insert fallback:', expandError.message);
                            try {
                                // Fallback: re-find the range (previous attempt may have invalidated it),
                                // delete it, then insert the replacement text separately.
                                const retryResult = await this.findText(change.searchText, context, change.id, change.type);
                                if (retryResult.range) {
                                    const retryRange = await this._expandToFullRange(context, retryResult.range, change.searchText, change.id);
                                    retryRange.insertText(change.replaceWith, Word.InsertLocation.before);
                                    await context.sync();
                                    // Re-find the original text and delete it
                                    const cleanupResult = await this.findText(change.searchText, context, change.id, change.type);
                                    if (cleanupResult.range) {
                                        const cleanupRange = await this._expandToFullRange(context, cleanupResult.range, change.searchText, change.id);
                                        cleanupRange.delete();
                                        await context.sync();
                                    }
                                    console.log('[TRACK CHANGES] Replaced via delete-then-insert fallback');
                                } else {
                                    console.warn('[TRACK CHANGES] Could not re-find text for fallback, replacing partial match only');
                                    searchResult.range.insertText(change.replaceWith, Word.InsertLocation.replace);
                                }
                            } catch (fallbackError) {
                                console.warn('[TRACK CHANGES] Delete-then-insert fallback also failed:', fallbackError.message);
                                searchResult.range.insertText(change.replaceWith, Word.InsertLocation.replace);
                            }
                        }
                    } else {
                        // Exact match - replace normally (Word tracks automatically)
                        searchResult.range.insertText(change.replaceWith, Word.InsertLocation.replace);
                    }
                    
                    break;
                }
                
                case 'insert': {
                    // Find the location to insert after
                    searchResult = await this.findText(change.afterText, context, change.id, change.type);
                    if (!searchResult.range) {
                        throw new Error(this._generateSearchErrorMessage(searchResult, change.afterText, 'insert'));
                    }
                    strategy = searchResult.strategy;
                    
                    // insertText with 'After' creates tracked changes (verified by diagnostic)
                    searchResult.range.insertText(' ' + change.insertText, Word.InsertLocation.after);
                    
                    break;
                }
                
                case 'delete': {
                    // Find the text to delete
                    searchResult = await this.findText(change.searchText, context, change.id, change.type);
                    if (!searchResult.range) {
                        throw new Error(this._generateSearchErrorMessage(searchResult, change.searchText, 'delete'));
                    }
                    strategy = searchResult.strategy;
                    
                    // If we used a partial-match strategy, expand range to cover full text
                    if (strategy === 'substring' || strategy === 'key_phrase' || strategy === 'position_key_phrase') {
                        console.warn(`[TRACK CHANGES] Delete used ${strategy} strategy - expanding range to cover full text`);
                        
                        try {
                            const expandedRange = await this._expandToFullRange(context, searchResult.range, change.searchText, change.id);
                            expandedRange.delete();
                            await context.sync();
                            console.log('[TRACK CHANGES] Deleted expanded range');
                        } catch (expandError) {
                            console.warn('[TRACK CHANGES] Expanded delete failed, trying re-find fallback:', expandError.message);
                            try {
                                const retryResult = await this.findText(change.searchText, context, change.id, change.type);
                                if (retryResult.range) {
                                    const retryRange = await this._expandToFullRange(context, retryResult.range, change.searchText, change.id);
                                    retryRange.delete();
                                    await context.sync();
                                    console.log('[TRACK CHANGES] Deleted via re-find fallback');
                                } else {
                                    console.warn('[TRACK CHANGES] Could not re-find text for fallback, deleting partial match only');
                                    searchResult.range.delete();
                                }
                            } catch (fallbackError) {
                                console.warn('[TRACK CHANGES] Delete fallback also failed:', fallbackError.message);
                                searchResult.range.delete();
                            }
                        }
                    } else {
                        // Exact match - delete normally (Word tracks automatically)
                        searchResult.range.delete();
                    }
                    
                    break;
                }
                
                case 'insertClause': {
                    // Find the section to insert after
                    searchResult = await this.findText(change.afterSection, context, change.id, change.type);
                    if (!searchResult.range) {
                        throw new Error(this._generateSearchErrorMessage(searchResult, change.afterSection, 'insertClause'));
                    }
                    strategy = searchResult.strategy;
                    
                    // Split clause content by double newlines to preserve paragraph structure
                    const paragraphs = change.clauseContent.split('\n\n').filter(p => p.trim());
                    
                    if (paragraphs.length === 0) {
                        throw new Error('Clause content is empty after splitting');
                    }
                    
                    // insertText with 'After' creates tracked changes (verified by diagnostic)
                    // insertParagraph with 'After' does NOT create tracked changes
                    // Use \r in insertText to create paragraph breaks — this is tracked AND preserves paragraph structure
                    const clauseText = '\r' + paragraphs.map(p => p.trim()).join('\r');
                    searchResult.range.insertText(clauseText, Word.InsertLocation.after);
                    
                    break;
                }
                
                default:
                    throw new Error(`Unknown change type: ${change.type}`);
            }
            
            await context.sync();
            
            console.log(`[TRACK CHANGES] ✓ Change ${change.id} applied successfully using ${strategy} strategy`);
            return {
                success: true,
                changeId: change.id,
                strategy: strategy
            };
        }).catch(error => {
            console.error(`[TRACK CHANGES] ✗ Change ${change.id} failed:`, error.message);
            return {
                success: false,
                changeId: change.id,
                error: error.message
            };
        });
    },

    /**
     * Get the document position of a change by searching for its anchor text
     * @param {TrackedChange} change - Change to locate
     * @param {Object} context - Word.run context
     * @returns {Promise<number|null>} Position index or null if not found
     */
    async getChangePosition(change, context) {
        try {
            // Determine what text to search for based on change type
            let searchText;
            if (change.type === 'replace' || change.type === 'delete') {
                searchText = change.searchText;
            } else if (change.type === 'insert') {
                searchText = change.afterText;
            } else if (change.type === 'insertClause') {
                searchText = change.afterSection;
            } else {
                return null;
            }
            
            // Use the enhanced findText with fallback strategies
            const searchResult = await this.findText(searchText, context, change.id, change.type);
            
            if (!searchResult.range) {
                console.warn(`[TRACK CHANGES] Could not find position for ${change.id} - will be sorted last`);
                return null;
            }
            
            // Determine document position for sorting.
            // Use containing paragraph text (more unique) rather than just the matched
            // fragment, which may appear multiple times in legal boilerplate.
            const bodyText = context.document.body;
            bodyText.load('text');
            
            const range = searchResult.range;
            const paragraph = range.paragraphs.getFirst();
            paragraph.load('text');
            range.load('text');
            await context.sync();
            
            let position = -1;
            
            // First try: locate using the paragraph text (longer = more unique)
            if (paragraph.text && paragraph.text.length > 0) {
                position = bodyText.text.indexOf(paragraph.text);
                if (position >= 0) {
                    // Add approximate offset within paragraph for better precision
                    const offsetInParagraph = paragraph.text.indexOf(range.text);
                    if (offsetInParagraph > 0) {
                        position += offsetInParagraph;
                    }
                }
            }
            
            // Fallback: locate using just the range text
            if (position < 0 && range.text && range.text.length > 0) {
                position = bodyText.text.indexOf(range.text);
            }
            
            if (position >= 0) {
                console.log(`[TRACK CHANGES] Position for ${change.id}: ${position} (found via ${searchResult.strategy})`);
            }
            
            return position >= 0 ? position : null;
            
        } catch (error) {
            console.warn(`[TRACK CHANGES] Could not determine position for change ${change.id}:`, error.message);
            return null;
        }
    },

    /**
     * Sort changes by document position (bottom to top)
     * This prevents position shifts when applying changes sequentially
     * @param {TrackedChange[]} changes - Array of changes to sort
     * @returns {Promise<Array<{change: TrackedChange, position: number}>>} Sorted changes with positions (bottom to top)
     */
    async sortChangesByPosition(changes) {
        console.log('[TRACK CHANGES] Sorting changes by document position...');
        
        return await Word.run(async (context) => {
            // Get position for each change
            const changesWithPositions = [];
            
            for (const change of changes) {
                const position = await this.getChangePosition(change, context);
                changesWithPositions.push({
                    change,
                    position: position !== null ? position : Number.MAX_SAFE_INTEGER
                });
            }
            
            // Sort by position (descending = bottom to top)
            // Changes without a position go last (will likely fail anyway)
            changesWithPositions.sort((a, b) => b.position - a.position);
            
            console.log('[TRACK CHANGES] Changes sorted by position (bottom to top)');
            changesWithPositions.forEach((item, index) => {
                const posStr = item.position === Number.MAX_SAFE_INTEGER ? 'unknown' : item.position;
                console.log(`  ${index + 1}. ${item.change.id} at position ${posStr}`);
            });
            
            // Return the full objects with position data, not just the changes
            return changesWithPositions;
        });
    },

    /**
     * Apply all changes as tracked changes (batch operation)
     * @param {TrackedChange[]} changes - Array of changes to apply
     * @param {Function} progressCallback - Optional callback for progress updates
     * @returns {Promise<ApplyResult>} Result object with applied/failed arrays
     */
    async applyAllChangesAsTracked(changes, progressCallback = null) {
        console.log(`[TRACK CHANGES] Starting batch apply: ${changes.length} changes`);
        
        const result = new ApplyResult();
        result.total = changes.length;
        
        try {
            // Enable track changes first
            const trackingEnabled = await this.enableTrackChanges();
            result.trackChangesEnabled = trackingEnabled;
            
            if (!trackingEnabled) {
                console.warn('[TRACK CHANGES] Track changes not enabled, changes will not be tracked');
            }
            
            // Sort changes by position (bottom to top) to prevent position shifts
            // This is a best practice from LSP spec and text editor implementations
            // Returns array of {change, position} objects
            const changesWithPositions = await this.sortChangesByPosition(changes);
            
            // Detect conflicting changes that reference overlapping text at overlapping positions
            // This prevents failures where one change modifies text that another change uses as anchor
            const conflictingChanges = this._detectConflictingChanges(changesWithPositions);
            
            if (conflictingChanges.size > 0) {
                console.warn(`[TRACK CHANGES] Detected ${conflictingChanges.size} conflicting changes that will be skipped`);
            }
            
            // Track strategy usage for analytics
            const strategyStats = {
                exact: 0,
                exact_ignorepunct: 0,
                substring: 0,
                key_phrase: 0,
                position_key_phrase: 0,
                failed: 0,
                conflicted: 0
            };
            
            // Apply changes one by one
            for (let i = 0; i < changesWithPositions.length; i++) {
                const item = changesWithPositions[i];
                const change = item.change;
                
                // Check if this change conflicts with another
                if (conflictingChanges.has(change.id)) {
                    const conflictReason = conflictingChanges.get(change.id);
                    console.warn(`[TRACK CHANGES] Skipping ${change.id} due to conflict`);
                    result.addFailure(change.id, conflictReason);
                    strategyStats.conflicted++;
                    
                    // Update progress
                    if (progressCallback) {
                        progressCallback({
                            current: i + 1,
                            total: changes.length,
                            changeId: change.id,
                            percentage: Math.round(((i + 1) / changes.length) * 100)
                        });
                    }
                    
                    continue; // Skip to next change
                }
                
                // Update progress
                if (progressCallback) {
                    progressCallback({
                        current: i + 1,
                        total: changes.length,
                        changeId: change.id,
                        percentage: Math.round(((i + 1) / changes.length) * 100)
                    });
                }
                
                try {
                    const changeResult = await this.applyChangeAsTracked(change);
                    
                    if (changeResult.success) {
                        result.addSuccess(change.id);
                        // Track which strategy was used
                        if (changeResult.strategy) {
                            strategyStats[changeResult.strategy] = (strategyStats[changeResult.strategy] || 0) + 1;
                        }
                    } else {
                        result.addFailure(change.id, changeResult.error || 'Unknown error');
                        strategyStats.failed++;
                    }
                } catch (error) {
                    result.addFailure(change.id, error.message);
                    strategyStats.failed++;
                }
                
                // Small delay between changes to avoid overwhelming Word
                if (i < changes.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            console.log(`[TRACK CHANGES] Batch apply complete: ${result.applied.length}/${result.total} succeeded`);
            console.log(`[TRACK CHANGES] Strategy usage: Exact=${strategyStats.exact}, ExactIgnorePunct=${strategyStats.exact_ignorepunct || 0}, Substring=${strategyStats.substring}, KeyPhrase=${strategyStats.key_phrase}, PositionKeyPhrase=${strategyStats.position_key_phrase}, Conflicted=${strategyStats.conflicted}, Failed=${strategyStats.failed}`);
            
            if (result.failed.length > 0) {
                console.warn(`[TRACK CHANGES] ${result.failed.length} changes failed:`);
                result.failed.forEach(f => {
                    console.warn(`  - ${f.changeId}: ${f.reason}`);
                    if (f.diagnostics && f.diagnostics.fullSearchText) {
                        console.warn(`    Full search text (${f.diagnostics.searchTextLength || 'unknown'} chars):`, f.diagnostics.fullSearchText);
                    }
                });
            }
            
            return result;
            
        } catch (error) {
            console.error('[TRACK CHANGES] Fatal error during batch apply:', error);
            throw error;
        }
    },

    /**
     * Retry failed changes from a previous apply operation
     * @param {TrackedChange[]} allChanges - All original changes
     * @param {ApplyResult} previousResult - Previous apply result
     * @returns {Promise<ApplyResult>} New result object
     */
    async retryFailedChanges(allChanges, previousResult) {
        console.log(`[TRACK CHANGES] Retrying ${previousResult.failed.length} failed changes`);
        
        // Get the changes that failed
        const failedIds = previousResult.failed.map(f => f.changeId);
        const changesToRetry = allChanges.filter(c => failedIds.includes(c.id));
        
        // Apply them again
        return await this.applyAllChangesAsTracked(changesToRetry);
    }
};
