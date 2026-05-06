// XML Parser Service
// Parses XML responses from Glean Agent into TrackedChange-compatible format

/**
 * Parse XML response from Glean Agent
 * @param {string} responseText - Raw response text from agent (may contain XML wrapped in markdown)
 * @returns {Object} Parsed result with { changes: [], summary: '' }
 */
export function parseAgentXml(responseText) {
    console.log('[XML PARSER] Parsing agent response...');
    console.log('[XML PARSER] Response length:', responseText.length);
    
    // Step 1: Extract XML from markdown code blocks if present
    let xmlText = responseText;
    
    // Check if wrapped in ```xml ... ``` markdown
    const xmlMatch = responseText.match(/```xml\s*([\s\S]*?)\s*```/);
    if (xmlMatch) {
        console.log('[XML PARSER] Found XML in markdown code block');
        xmlText = xmlMatch[1];
    } else {
        // Try to find XML by looking for <changes> tag
        const changesMatch = responseText.match(/<changes>[\s\S]*<\/changes>/);
        if (changesMatch) {
            console.log('[XML PARSER] Found XML without markdown wrapper');
            xmlText = changesMatch[0];
        }
    }
    
    // Step 2: Sanitize XML - remove invalid characters
    // XML only allows: tab (0x09), newline (0x0A), carriage return (0x0D), and characters >= 0x20
    // Remove vertical tabs (0x0B), form feeds (0x0C), and other invalid control characters
    const invalidChars = xmlText.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g);
    if (invalidChars) {
        console.warn('[XML PARSER] ⚠️ Found', invalidChars.length, 'invalid XML character(s)');
        console.warn('[XML PARSER] Character codes:', invalidChars.map(c => '0x' + c.charCodeAt(0).toString(16).toUpperCase()).join(', '));
        console.warn('[XML PARSER] Positions in text:', 
            invalidChars.slice(0, 5).map((c, i) => {
                const pos = xmlText.indexOf(c);
                return `char ${i + 1} at position ${pos}`;
            }).join('; ') + (invalidChars.length > 5 ? ` (showing first 5 of ${invalidChars.length})` : '')
        );
    }
    xmlText = xmlText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    
    // Step 3: Clean up XML (remove line breaks within tags that might break parsing)
    xmlText = xmlText.replace(/<([^>]+)\n([^>]+)>/g, '<$1 $2>');
    
    console.log('[XML PARSER] Cleaned XML length:', xmlText.length);
    console.log('[XML PARSER] First 200 chars:', xmlText.substring(0, 200));
    
    // Step 4: Detect and repair truncated XML
    // The agent may hit its output token limit mid-response, producing incomplete XML.
    // If the response doesn't end with </changes>, salvage all fully-formed <change> elements.
    let wasTruncated = false;
    if (!xmlText.trim().endsWith('</changes>')) {
        console.warn('[XML PARSER] ⚠️ Detected truncated XML response (missing </changes>)');
        const lastCompleteChange = xmlText.lastIndexOf('</change>');
        if (lastCompleteChange !== -1) {
            const afterLastComplete = xmlText.substring(lastCompleteChange + '</change>'.length);
            const lostIncompleteChange = afterLastComplete.includes('<change');
            xmlText = xmlText.substring(0, lastCompleteChange + '</change>'.length) + '\n</changes>';
            wasTruncated = lostIncompleteChange;
            if (lostIncompleteChange) {
                console.warn('[XML PARSER] Repaired XML — at least one incomplete change was discarded');
            } else {
                console.log('[XML PARSER] Repaired XML — closing tag was missing but all changes are complete');
            }
            console.log('[XML PARSER] Repaired XML length:', xmlText.length);
        } else {
            throw new Error('Agent response was truncated before any complete changes were produced. Please try again.');
        }
    }
    
    // Step 5: Parse XML using DOMParser
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    
    // Check for parsing errors
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
        console.error('[XML PARSER] Parse error:', parserError.textContent);
        throw new Error(`Failed to parse XML: ${parserError.textContent}`);
    }
    
    // Step 5: Extract changes
    const changesElement = xmlDoc.querySelector('changes');
    if (!changesElement) {
        throw new Error('No <changes> element found in XML');
    }
    
    const changeElements = changesElement.querySelectorAll('change');
    console.log('[XML PARSER] Found', changeElements.length, 'change elements');
    
    const changes = [];
    
    changeElements.forEach((changeEl, index) => {
        try {
            const change = parseChangeElement(changeEl, index);
            changes.push(change);
        } catch (error) {
            console.error(`[XML PARSER] Error parsing change #${index + 1}:`, error.message);
            throw new Error(`Failed to parse change #${index + 1}: ${error.message}`);
        }
    });
    
    // Step 6: Extract summary if present
    let summary = '';
    const summaryElement = xmlDoc.querySelector('summary');
    if (summaryElement) {
        summary = summaryElement.textContent.trim();
        console.log('[XML PARSER] Found summary:', summary.substring(0, 100));
    }
    
    if (wasTruncated) {
        console.warn(`[XML PARSER] ⚠️ Recovered ${changes.length} complete changes from truncated response (some changes may have been lost)`);
    } else {
        console.log('[XML PARSER] ✅ Successfully parsed', changes.length, 'changes');
    }
    
    console.log('[XML PARSER] wasTruncated:', wasTruncated);
    
    return {
        changes,
        summary,
        wasTruncated
    };
}

/**
 * Parse a single <change> element into a change object
 * @param {Element} changeEl - XML change element
 * @param {number} index - Change index (for ID generation)
 * @returns {Object} Change object compatible with TrackedChange model
 */
function parseChangeElement(changeEl, index) {
    // Get attributes
    const id = changeEl.getAttribute('id') || `change_${index + 1}`;
    const type = changeEl.getAttribute('type');
    const category = changeEl.getAttribute('category') || 'general';
    
    if (!type) {
        throw new Error('Missing required attribute: type');
    }
    
    // Validate type
    const validTypes = ['replace', 'insert', 'delete', 'insertClause'];
    if (!validTypes.includes(type)) {
        throw new Error(`Invalid type: ${type}. Must be one of: ${validTypes.join(', ')}`);
    }
    
    // Build change object
    const change = {
        id,
        type,
        category,
        reason: getElementText(changeEl, 'reason'),
        searchText: '',
        replaceWith: '',
        afterText: '',
        insertText: '',
        afterSection: '',
        clauseContent: ''
    };
    
    // Extract type-specific fields
    switch (type) {
        case 'replace':
            change.searchText = getElementText(changeEl, 'searchText');
            change.replaceWith = getElementText(changeEl, 'replaceWith');
            
            if (!change.searchText) {
                throw new Error('Missing required element: searchText');
            }
            if (!change.replaceWith) {
                throw new Error('Missing required element: replaceWith');
            }
            break;
            
        case 'insert':
            change.afterText = getElementText(changeEl, 'afterText');
            change.insertText = getElementText(changeEl, 'insertText');
            
            if (!change.afterText) {
                throw new Error('Missing required element: afterText');
            }
            if (!change.insertText) {
                throw new Error('Missing required element: insertText');
            }
            break;
            
        case 'delete':
            change.searchText = getElementText(changeEl, 'searchText');
            
            if (!change.searchText) {
                throw new Error('Missing required element: searchText');
            }
            break;
            
        case 'insertClause':
            change.afterSection = getElementText(changeEl, 'afterSection');
            change.clauseContent = getElementText(changeEl, 'clauseContent');
            
            if (!change.afterSection) {
                throw new Error('Missing required element: afterSection');
            }
            if (!change.clauseContent) {
                throw new Error('Missing required element: clauseContent');
            }
            break;
    }
    
    return change;
}

/**
 * Get text content from a child element
 * @param {Element} parentEl - Parent XML element
 * @param {string} tagName - Child element tag name
 * @returns {string} Text content (trimmed) or empty string if not found
 */
function getElementText(parentEl, tagName) {
    const element = parentEl.querySelector(tagName);
    if (!element) {
        return '';
    }
    return element.textContent.trim();
}

/**
 * Validate parsed changes array
 * @param {Array} changes - Array of change objects
 * @throws {Error} If validation fails
 */
export function validateChanges(changes) {
    if (!Array.isArray(changes)) {
        throw new Error('Changes must be an array');
    }
    
    // Empty changes array is valid - means document is compliant
    if (changes.length === 0) {
        console.log('[XML PARSER] ✅ No changes needed - content matches template/playbook');
        return; // Valid case - no changes required
    }
    
    // Validate each change has required fields
    changes.forEach((change, index) => {
        if (!change.id) {
            throw new Error(`Change #${index + 1}: missing id`);
        }
        if (!change.type) {
            throw new Error(`Change #${index + 1}: missing type`);
        }
        if (!change.category) {
            throw new Error(`Change #${index + 1}: missing category`);
        }
    });
    
    console.log('[XML PARSER] ✅ All changes validated');
    return true;
}
