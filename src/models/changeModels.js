// Change Models for Track Changes Architecture
// Simplified data models for the new approach

/**
 * Represents a single tracked change to be applied to the document
 * Uses simplified format from working version
 */
export class TrackedChange {
    constructor(data) {
        this.id = data.id;
        this.type = data.type; // 'replace', 'insert', 'delete', 'insertClause'
        
        // Simple format fields
        this.searchText = data.searchText || '';
        this.replaceWith = data.replaceWith || '';
        this.afterText = data.afterText || '';
        this.insertText = data.insertText || '';
        this.afterSection = data.afterSection || '';
        this.clauseContent = data.clauseContent || '';
        
        this.reason = data.reason || '';
        this.category = data.category || 'general';
    }
    
    /**
     * Validate the change structure
     * @throws {Error} If validation fails
     */
    validate() {
        // Validate ID
        if (!this.id) {
            throw new Error('Change must have an id');
        }
        
        // Validate type
        const validTypes = ['replace', 'insert', 'delete', 'insertClause'];
        if (!validTypes.includes(this.type)) {
            throw new Error(`Invalid change type: ${this.type}. Must be one of: ${validTypes.join(', ')}`);
        }
        
        // Validate required fields based on type
        if (this.type === 'replace') {
            if (!this.searchText || this.searchText.trim().length === 0) {
                throw new Error(`Change ${this.id}: searchText is required for replace type`);
            }
            if (!this.replaceWith || this.replaceWith.trim().length === 0) {
                throw new Error(`Change ${this.id}: replaceWith is required for replace type`);
            }
        } else if (this.type === 'insert') {
            if (!this.afterText || this.afterText.trim().length === 0) {
                throw new Error(`Change ${this.id}: afterText is required for insert type`);
            }
            if (!this.insertText || this.insertText.trim().length === 0) {
                throw new Error(`Change ${this.id}: insertText is required for insert type`);
            }
        } else if (this.type === 'delete') {
            if (!this.searchText || this.searchText.trim().length === 0) {
                throw new Error(`Change ${this.id}: searchText is required for delete type`);
            }
        } else if (this.type === 'insertClause') {
            if (!this.afterSection || this.afterSection.trim().length === 0) {
                throw new Error(`Change ${this.id}: afterSection is required for insertClause type`);
            }
            if (!this.clauseContent || this.clauseContent.trim().length === 0) {
                throw new Error(`Change ${this.id}: clauseContent is required for insertClause type`);
            }
        }
        
        // Validate category
        const validCategories = [
            'legal_protection',
            'compliance',
            'risk_mitigation',
            'language_simplification',
            'missing_clause',
            'general'
        ];
        if (!validCategories.includes(this.category)) {
            console.warn(`Change ${this.id}: Unknown category "${this.category}", using "general"`);
            this.category = 'general';
        }
        
        return true;
    }
    
    /**
     * Get a human-readable description of the change
     */
    getDescription() {
        switch (this.type) {
            case 'replace':
                return `Replace "${this.searchText.substring(0, 50)}..." with "${this.replaceWith.substring(0, 50)}..."`;
            case 'insert':
                return `Insert "${this.insertText.substring(0, 50)}..." after "${this.afterText.substring(0, 30)}..."`;
            case 'delete':
                return `Delete "${this.searchText.substring(0, 50)}..."`;
            case 'insertClause':
                return `Insert clause after ${this.afterSection}`;
            default:
                return 'Unknown change type';
        }
    }
    
    /**
     * Get category display name
     */
    getCategoryDisplay() {
        const categoryMap = {
            'legal_protection': 'Legal Protection',
            'compliance': 'Compliance',
            'risk_mitigation': 'Risk Mitigation',
            'language_simplification': 'Language Simplification',
            'general': 'General'
        };
        return categoryMap[this.category] || 'General';
    }
}

/**
 * Represents the result of applying changes
 */
export class ApplyResult {
    constructor() {
        this.applied = [];      // Array of successfully applied change IDs
        this.failed = [];       // Array of {changeId, reason} objects
        this.total = 0;         // Total number of changes attempted
        this.trackChangesEnabled = false;  // Whether track changes was enabled
    }
    
    /**
     * Add a successful application
     */
    addSuccess(changeId) {
        this.applied.push(changeId);
    }
    
    /**
     * Add a failed application with optional diagnostics
     * @param {string} changeId - ID of the failed change
     * @param {string} reason - Error message
     * @param {Object} diagnostics - Optional detailed diagnostics
     */
    addFailure(changeId, reason, diagnostics = null) {
        this.failed.push({ 
            changeId, 
            reason,
            diagnostics: diagnostics || {}
        });
    }
    
    /**
     * Get detailed failure information
     * @returns {Array} Array of failure details with diagnostics
     */
    getFailureDetails() {
        return this.failed.map(f => ({
            changeId: f.changeId,
            reason: f.reason,
            diagnostics: f.diagnostics || {}
        }));
    }
    
    /**
     * Get success rate as percentage
     */
    getSuccessRate() {
        if (this.total === 0) return 0;
        return Math.round((this.applied.length / this.total) * 100);
    }
    
    /**
     * Check if all changes were applied successfully
     */
    isFullSuccess() {
        return this.failed.length === 0 && this.applied.length === this.total;
    }
    
    /**
     * Get a summary message
     */
    getSummary() {
        if (this.isFullSuccess()) {
            return `✓ All ${this.total} changes applied successfully`;
        } else if (this.applied.length === 0) {
            return `✗ Failed to apply all ${this.total} changes`;
        } else {
            return `⚠ Applied ${this.applied.length} of ${this.total} changes (${this.failed.length} failed)`;
        }
    }
}
