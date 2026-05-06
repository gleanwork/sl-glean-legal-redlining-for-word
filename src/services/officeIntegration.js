// Office.js Integration Service
// Provides helper functions for Word API interactions

export const officeIntegration = {
    /**
     * Get the full document content as text
     * @returns {Promise<string>} Document content
     */
    async getDocumentContent() {
        return Word.run(async (context) => {
            const body = context.document.body;
            body.load('text');
            await context.sync();
            
            console.log('Document content retrieved:', body.text.length, 'characters');
            return body.text;
        }).catch(error => {
            console.error('Error getting document content:', error);
            throw error;
        });
    },

    /**
     * Get the selected text from the document
     * @returns {Promise<string>} Selected text
     */
    async getSelectedText() {
        return Word.run(async (context) => {
            const selection = context.document.getSelection();
            selection.load('text');
            await context.sync();
            
            console.log('Selected text retrieved:', selection.text.length, 'characters');
            return selection.text;
        }).catch(error => {
            console.error('Error getting selected text:', error);
            throw error;
        });
    },

    /**
     * Get document metadata (page count, word count, etc.)
     * @returns {Promise<Object>} Document metadata
     */
    async getDocumentMetadata() {
        return Word.run(async (context) => {
            const body = context.document.body;
            const properties = context.document.properties;
            
            body.load('text');
            properties.load('title,author,lastModifiedBy');
            await context.sync();
            
            // Calculate word count
            const text = body.text;
            const wordCount = text.trim().split(/\s+/).length;
            
            // Estimate page count (more conservative: 500-550 words per page for typical documents)
            // This accounts for margins, headers, footers, spacing
            const pageCount = Math.max(1, Math.ceil(wordCount / 550));
            
            // Get document filename from URL or title
            let filename = properties.title || 'Untitled Document';
            
            // Try to get filename from document URL if available
            try {
                if (Office.context.document && Office.context.document.url) {
                    const url = Office.context.document.url;
                    // Extract filename from URL (works for both local paths and SharePoint URLs)
                    const urlParts = url.split('/');
                    const lastPart = urlParts[urlParts.length - 1];
                    // Decode URL encoding and remove query parameters
                    const decodedName = decodeURIComponent(lastPart.split('?')[0]);
                    if (decodedName && decodedName.length > 0) {
                        filename = decodedName;
                    }
                }
            } catch (e) {
                console.log('Could not extract filename from URL, using title instead');
            }
            
            const metadata = {
                filename: filename,
                title: properties.title || 'Untitled Document',
                author: properties.author || 'Unknown',
                lastModifiedBy: properties.lastModifiedBy || 'Unknown',
                wordCount: wordCount,
                pageCount: pageCount,
                // Note: Office.js doesn't provide last modified date directly
                // We show "Recently modified" in the UI instead
                lastModified: null
            };
            
            console.log('Document metadata:', metadata);
            return metadata;
        }).catch(error => {
            console.error('Error getting document metadata:', error);
            // Return mock data if error
            return {
                filename: 'Document.docx',
                title: 'Document',
                wordCount: 0,
                pageCount: 0,
                lastModified: null
            };
        });
    },

    /**
     * Insert text at the current cursor position with track changes enabled
     * @param {string} text - Text to insert
     * @param {boolean} trackChanges - Whether to enable track changes
     * @returns {Promise<void>}
     */
    async insertTextWithTracking(text, trackChanges = true) {
        return Word.run(async (context) => {
            // Note: Track changes must be enabled in Word settings
            // Office.js doesn't have direct API to toggle track changes programmatically
            // Users must enable it manually in Word
            
            const selection = context.document.getSelection();
            selection.insertText(text, Word.InsertLocation.replace);
            
            await context.sync();
            console.log('Text inserted successfully');
        }).catch(error => {
            console.error('Error inserting text:', error);
            throw error;
        });
    },




    /**
     * Enable track changes in Word programmatically
     * @returns {Promise<boolean>} Success status
     */
    async enableTrackChanges() {
        return Word.run(async (context) => {
            context.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
            await context.sync();
            console.log('[OFFICE] Track changes enabled successfully');
            return true;
        }).catch(error => {
            console.error('[OFFICE] Error enabling track changes:', error);
            console.log('[OFFICE] Fallback: Please enable track changes manually in Word (Review tab → Track Changes)');
            return false;
        });
    },

    /**
     * Check if the document has existing tracked changes (deletions or insertions)
     * Requires WordApi 1.6. Returns false gracefully if API is unavailable.
     * @returns {Promise<boolean>} True if tracked changes exist
     */
    async hasTrackedChanges() {
        try {
            // Check if WordApi 1.6 is available (required for getTrackedChanges)
            if (!Office.context.requirements.isSetSupported('WordApi', '1.6')) {
                console.log('[OFFICE] WordApi 1.6 not available - skipping tracked change detection');
                return false;
            }

            return await Word.run(async (context) => {
                const trackedChanges = context.document.body.getTrackedChanges();
                trackedChanges.load('items');
                await context.sync();

                const count = trackedChanges.items.length;
                console.log(`[OFFICE] Document has ${count} tracked change(s)`);
                return count > 0;
            });
        } catch (error) {
            console.warn('[OFFICE] Error checking for tracked changes:', error);
            return false;
        }
    },

    /**
     * Accept all existing tracked changes in the document
     * Requires WordApi 1.6. This is destructive — deletions are removed, insertions become permanent.
     * @returns {Promise<boolean>} True if changes were accepted successfully
     */
    async acceptAllTrackedChanges() {
        try {
            if (!Office.context.requirements.isSetSupported('WordApi', '1.6')) {
                console.warn('[OFFICE] WordApi 1.6 not available - cannot accept tracked changes');
                return false;
            }

            return await Word.run(async (context) => {
                const trackedChanges = context.document.body.getTrackedChanges();
                trackedChanges.acceptAll();
                await context.sync();

                console.log('[OFFICE] All tracked changes accepted successfully');
                return true;
            });
        } catch (error) {
            console.error('[OFFICE] Error accepting tracked changes:', error);
            return false;
        }
    },







    /**
     * Navigate to and select a specific text range in the document
     * Uses sophisticated search with multiple strategies for maximum reliability
     * @param {string} searchText - Text to search for and navigate to
     * @returns {Promise<boolean>} True if navigation successful
     */
    async navigateToText(searchText) {
        return Word.run(async (context) => {
            if (!searchText || searchText.trim().length === 0) {
                console.warn('[OFFICE] Empty search text provided');
                return false;
            }
            
            // Preprocess search text the same way trackChangesService does
            // Remove XML formatting artifacts and normalize whitespace
            const cleanedSearchText = searchText
                .replace(/\n/g, ' ')      // Replace literal newlines with spaces
                .replace(/\s+/g, ' ')      // Collapse multiple spaces to single space
                .trim();                    // Remove leading/trailing whitespace
            
            console.log('[OFFICE] Searching for text (length: ' + cleanedSearchText.length + '):', cleanedSearchText.substring(0, 100) + '...');
            
            let usedPartialMatch = false;
            let usedKeyPhrase = false;
            
            // Strategy 1: Try exact search with ignoreSpace
            let searchResults = context.document.body.search(cleanedSearchText, {
                matchCase: false,
                matchWholeWord: false,
                ignoreSpace: true,
                ignorePunct: false
            });
            
            searchResults.load('items');
            await context.sync();
            
            // Strategy 2: If no results and text is long, try with ignorePunct
            if (searchResults.items.length === 0 && cleanedSearchText.length > 50) {
                console.log('[OFFICE] Exact search failed, trying with ignorePunct...');
                searchResults = context.document.body.search(cleanedSearchText, {
                    matchCase: false,
                    matchWholeWord: false,
                    ignoreSpace: true,
                    ignorePunct: true
                });
                
                searchResults.load('items');
                await context.sync();
            }
            
            // Strategy 3: If still no results and text is very long, try first 200 chars
            if (searchResults.items.length === 0 && cleanedSearchText.length > 200) {
                const partialText = cleanedSearchText.substring(0, 200).trim();
                console.log('[OFFICE] Full text search failed, trying partial match (first 200 chars)...');
                
                searchResults = context.document.body.search(partialText, {
                    matchCase: false,
                    matchWholeWord: false,
                    ignoreSpace: true,
                    ignorePunct: true
                });
                
                searchResults.load('items');
                await context.sync();
                
                usedPartialMatch = searchResults.items.length > 0;
            }
            
            if (searchResults.items.length === 0) {
                console.warn('[OFFICE] Text not found for navigation after trying all strategies');
                return false;
            }
            
            // Select the first match
            const firstMatch = searchResults.items[0];
            
            // If we used partial match, try to expand selection to cover more text
            if (usedPartialMatch) {
                try {
                    console.log('[OFFICE] Expanding selection from partial match (200 chars) to cover more context...');
                    
                    // Load the match and get its paragraph
                    firstMatch.load('text');
                    const startParagraph = firstMatch.paragraphs.getFirst();
                    startParagraph.load('text');
                    await context.sync();
                    
                    // Calculate approximately how many paragraphs we need
                    // Assuming average paragraph is ~500 chars, and we found 200 chars
                    const fullTextLength = cleanedSearchText.length;
                    const estimatedParagraphsNeeded = Math.ceil(fullTextLength / 500);
                    
                    // Try to select multiple paragraphs to cover the full text
                    if (estimatedParagraphsNeeded > 1 && fullTextLength > 1000) {
                        console.log(`[OFFICE] Full text is ${fullTextLength} chars, attempting to select ~${estimatedParagraphsNeeded} paragraphs`);
                        
                        // Get the range starting from the match
                        let expandedRange = firstMatch.getRange();
                        
                        // Try to expand forward by getting next paragraphs
                        let currentParagraph = startParagraph;
                        for (let i = 1; i < Math.min(estimatedParagraphsNeeded, 10); i++) {
                            try {
                                const nextParagraph = currentParagraph.getNext();
                                nextParagraph.load('text');
                                await context.sync();
                                
                                // Expand our range to include this paragraph
                                expandedRange = expandedRange.expandTo(nextParagraph.getRange());
                                currentParagraph = nextParagraph;
                            } catch (e) {
                                // No more paragraphs
                                console.log(`[OFFICE] Reached end after ${i} paragraphs`);
                                break;
                            }
                        }
                        
                        expandedRange.select(Word.SelectionMode.select);
                        console.log('[OFFICE] Expanded selection to cover multiple paragraphs');
                    } else {
                        // Text is within one paragraph or relatively short
                        startParagraph.select(Word.SelectionMode.select);
                        console.log('[OFFICE] Selected full paragraph containing partial match');
                    }
                } catch (expandError) {
                    console.warn('[OFFICE] Error expanding selection, using partial match:', expandError);
                    firstMatch.select(Word.SelectionMode.select);
                }
            } else {
                // Exact or ignorePunct match - select normally
                firstMatch.select(Word.SelectionMode.select);
            }
            
            await context.sync();
            
            console.log('[OFFICE] Successfully navigated to text (found ' + searchResults.items.length + ' matches, selected first)');
            return true;
        }).catch(error => {
            console.error('[OFFICE] Error navigating to text:', error);
            return false;
        });
    },

    /**
     * Check if Office.js is ready and we're in Word
     * @returns {boolean} True if ready
     */
    isReady() {
        return typeof Office !== 'undefined' && 
               Office.context && 
               Office.context.host === Office.HostType.Word;
    }
};
