// Screen templates for Glean Legal Contract Review Add-in

// Wait for app to be defined (loaded from module)
(function initScreens() {
    if (typeof window.app === 'undefined') {
        setTimeout(initScreens, 50);
        return;
    }

    console.log('[SCREENS] Initializing screens...');

window.app.screens = {
    home: () => {
        console.log('[SCREENS] Rendering home screen template');
        return `
        <div class="home-doc-bar">
            <div class="home-doc-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg></div>
            <div class="home-doc-info">
                <div class="home-doc-name">${app.documentMetadata?.filename || 'Loading...'}</div>
                <div class="home-doc-meta">${app.formatDocumentMetadata(app.documentMetadata)}</div>
            </div>
        </div>
        <div class="home-label">Actions</div>
        <div class="home-action-cards">
            <div class="home-action-card" onclick="app.showScreen('review-setup')">
                <div class="home-action-icon home-action-icon-blue">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><circle cx="11.5" cy="14.5" r="2.5"></circle><line x1="13.3" y1="16.3" x2="15" y2="18"></line></svg>
                </div>
                <div class="home-action-text">
                    <div class="home-action-title">Contract Review</div>
                    <div class="home-action-desc">Run automated redlines</div>
                </div>
                <div class="home-action-arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></div>
            </div>
            <div class="home-action-card" onclick="app.startChatWithDocument()">
                <div class="home-action-icon home-action-icon-indigo">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                </div>
                <div class="home-action-text">
                    <div class="home-action-title">Chat with Contract</div>
                    <div class="home-action-desc">Ask questions and get clarifications</div>
                </div>
                <div class="home-action-arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></div>
            </div>
        </div>
        <div class="home-label">Recent</div>
        <div class="recent-activity-grid">
            ${app.generateMostRecentReview()}
            ${app.generateMostRecentChat()}
        </div>
    `;
    },
    
    'review-setup': () => `
        <div class="screen-header">
            <div class="screen-title" style="font-size: 17px;">Review Setup</div>
            <div class="screen-nav">
                <button class="nav-btn" onclick="app.showScreen('home')" aria-label="Go to home screen">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 12H5M12 19l-7-7 7-7"></path>
                    </svg>
                    <span>Home</span>
                </button>
            </div>
        </div>
        <div class="home-label">Scope</div>
        <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Choose what Glean should review</label>
            <div class="toggle-buttons">
                ${app.renderReviewScopeButtons()}
            </div>
        </div>
        <div class="home-label">Configuration</div>
        <div class="form-group">
            <div class="field-row">
                <div class="custom-select" id="template-select" data-value="${app.selectedTemplate || ''}" onclick="app.toggleDropdown(this)">
                    <div class="custom-select-trigger">
                        <span class="select-label ${!app.selectedTemplate || app.selectedTemplate === '' ? 'placeholder' : ''}">${!app.selectedTemplate || app.selectedTemplate === '' ? 'Choose Template' : (app.selectedTemplate === 'custom' ? 'Custom Template' : (app.availableTemplates.find(t => t.url === app.selectedTemplate)?.name || 'Choose Template'))}</span>
                        <div class="custom-arrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></div>
                    </div>
                    <div class="custom-options">
                        <div class="custom-option ${app.selectedTemplate === 'custom' ? 'selected' : ''}" data-value="custom" onclick="app.selectTemplateOption(event, this, 'Custom Template', 'custom')">Custom Template</div>
                        ${window.app.availableTemplates.map(t => `<div class="custom-option ${app.selectedTemplate === t.url ? 'selected' : ''}" data-value="${t.url}" onclick="app.selectTemplateOption(event, this, '${t.name}', '${t.url}')">${t.name}</div>`).join('')}
                    </div>
                </div>
                <button class="btn-refresh" onclick="app.refreshTemplates()" title="Refresh templates" aria-label="Refresh templates list">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="custom-input-section" id="custom-template-section" style="display: ${app.selectedTemplate === 'custom' ? 'block' : 'none'};">
            <div class="form-group">
                <label class="form-label">Custom Template URL or Text</label>
                <textarea class="form-textarea" id="custom-template-input" rows="4" placeholder="Enter a URL to your custom template (e.g., Google Drive, SharePoint) or paste the template text directly...">${app.customTemplateInput || ''}</textarea>
                <div class="field-hint"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;margin-right:4px;opacity:0.6;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>You can provide a link to a template document or paste the template content directly</div>
            </div>
        </div>
        <div class="form-group">
            <div class="field-row">
                <div class="custom-select" id="playbook-select" data-value="${app.selectedPlaybook || ''}" onclick="app.toggleDropdown(this)">
                    <div class="custom-select-trigger">
                        <span class="select-label ${!app.selectedPlaybook || app.selectedPlaybook === '' ? 'placeholder' : ''}">${!app.selectedPlaybook || app.selectedPlaybook === '' ? 'Choose Playbook' : (app.selectedPlaybook === 'custom' ? 'Custom Playbook' : (app.availablePlaybooks.find(p => p.url === app.selectedPlaybook)?.name || 'Choose Playbook'))}</span>
                        <div class="custom-arrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></div>
                    </div>
                    <div class="custom-options">
                        <div class="custom-option ${app.selectedPlaybook === 'custom' ? 'selected' : ''}" data-value="custom" onclick="app.selectPlaybookOption(event, this, 'Custom Playbook', 'custom')">Custom Playbook</div>
                        ${window.app.availablePlaybooks.map(p => `<div class="custom-option ${app.selectedPlaybook === p.url ? 'selected' : ''}" data-value="${p.url}" onclick="app.selectPlaybookOption(event, this, '${p.name}', '${p.url}')">${p.name}</div>`).join('')}
                    </div>
                </div>
                <button class="btn-refresh" onclick="app.refreshPlaybooks()" title="Refresh playbooks" aria-label="Refresh playbooks list">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="custom-input-section" id="custom-playbook-section" style="display: ${app.selectedPlaybook === 'custom' ? 'block' : 'none'};">
            <div class="form-group">
                <label class="form-label">Custom Playbook URL or Text</label>
                <textarea class="form-textarea" id="custom-playbook-input" rows="4" placeholder="Enter a URL to your custom playbook (e.g., Google Drive, SharePoint) or paste the playbook rules directly...">${app.customPlaybookInput || ''}</textarea>
                <div class="field-hint"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;margin-right:4px;opacity:0.6;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>You can provide a link to a playbook document or paste the playbook content directly</div>
            </div>
        </div>
        <div style="padding-top: 8px;">
            <button class="btn btn-primary" style="width: 100%;" onclick="app.startAnalysis()" aria-label="Start document analysis">Start Analysis</button>
        </div>
    `,
    
    'analysis-progress': () => `
        <div style="padding-top: 48px;"></div>
        <div class="ai-orb-container">
            <div class="ai-orb-ring ai-orb-ring-1"></div>
            <div class="ai-orb-ring ai-orb-ring-2"></div>
            <div class="ai-orb-ring ai-orb-ring-3"></div>
            <div class="ai-orb-glow"></div>
            <div class="ai-orb-core">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
            </div>
        </div>
        <div class="ai-status-container">
            <div class="ai-status-primary" id="analysis-status">Analyzing with Glean AI</div>
            <div class="ai-status-rotating" id="analysis-message">Preparing analysis...</div>
            <div class="ai-status-secondary">This typically takes 3–5 minutes</div>
        </div>
    `,
    
    'analysis-error': () => {
        const error = app.lastAnalysisError || { title: 'Something went wrong', message: 'An unexpected error occurred during analysis.' };
        return `
        <div class="screen-title">Analysis Failed</div>
        <div class="error-orb-container">
            <div class="error-orb-glow"></div>
            <div class="error-orb-core">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
            </div>
        </div>
        <div class="error-status-container">
            <div class="error-status-title">${error.title}</div>
            <div class="error-status-subtitle">${error.message}</div>
        </div>
        <div class="error-actions">
            <button class="btn-primary error-retry-btn" onclick="app.startAnalysis()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                Try Again
            </button>
            <button class="btn-secondary error-back-btn" onclick="app.showScreen('review-setup')">Back to Setup</button>
        </div>
    `;
    },
    
    'results-dashboard': () => {
        const totalChanges = app.getTotalRecommendations();
        const reviewScope = app.currentAnalysisResult?.reviewScope || 'entire';
        const isSelectedText = reviewScope === 'selected';
        const hasChanges = totalChanges > 0;
        
        // No changes needed - show success message
        if (!hasChanges) {
            const scopeText = isSelectedText ? 'Selected Text' : 'Document';
            const successMessage = isSelectedText 
                ? 'The selected text aligns perfectly with your template and playbook requirements.'
                : 'Your document aligns perfectly with your template and playbook requirements.';
            
            return `
                <div class="screen-title">Analysis Complete</div>
                
                <div class="success-screen" style="padding: 48px 24px;">
                    <div class="success-orb-container">
                        <div class="success-orb-ring"></div>
                        <div class="success-orb-glow"></div>
                        <div class="success-orb-core">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </div>
                    </div>
                    <h2 style="color: #10b981; margin: 24px 0 12px 0; font-size: 22px; font-weight: 600;">${scopeText} is Compliant</h2>
                    <p class="success-message" style="color: #6b7280; font-size: 15px; line-height: 1.6; max-width: 500px; margin: 0 auto;">
                        ${successMessage}
                    </p>
                </div>
                
                ${app.currentAnalysisResult?.summary ? `
                    <div class="section">
                        <div class="section-header">
                            <div class="section-title">Analysis Summary</div>
                        </div>
                        <div class="section-content">
                            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; color: #374151; font-size: 14px; line-height: 1.6;">
                                ${app.currentAnalysisResult.summary}
                            </div>
                        </div>
                    </div>
                ` : ''}
                
                <div class="action-buttons-fixed">
                    <button class="btn btn-secondary btn-action" onclick="app.showScreen('review-setup')">Run Another Review</button>
                    <button class="btn btn-primary btn-action" onclick="app.showScreen('home')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;">
                            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                            <polyline points="9 22 9 12 15 12 15 22"></polyline>
                        </svg>
                        Back to Home
                    </button>
                </div>
            `;
        }
        
        // Has changes - show normal results dashboard
        return `
            <div class="screen-header">
                <div class="screen-title" style="font-size: 17px;">Analysis Complete</div>
                <div class="screen-nav">
                    <button class="nav-btn" onclick="app.showScreen('home')" aria-label="Go to home screen">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 12H5M12 19l-7-7 7-7"></path>
                        </svg>
                        <span>Home</span>
                    </button>
                </div>
            </div>
            
            <div class="results-summary-compact">
                <div class="summary-stat-compact stat-identified">
                    <span class="stat-value">${totalChanges}</span>
                    <span class="stat-label">Identified</span>
                </div>
                <div class="summary-divider"></div>
                <div class="summary-stat-compact ${app.getAppliedCount() > 0 ? 'stat-success' : ''}" id="stat-applied-box">
                    <span class="stat-value" id="stat-applied">${app.getAppliedCount()}</span>
                    <span class="stat-label">Applied</span>
                </div>
                <div class="summary-divider"></div>
                <div class="summary-stat-compact ${app.getFailedCount() > 0 ? 'stat-error' : ''}" id="stat-failed-box">
                    <span class="stat-value" id="stat-failed">${app.getFailedCount()}</span>
                    <span class="stat-label">Failed</span>
                </div>
                <div class="summary-divider"></div>
                <div class="summary-stat-compact">
                    <span class="stat-value" id="stat-remaining">${app.getRemainingCount()}</span>
                    <span class="stat-label">Remaining</span>
                </div>
            </div>
            
            <div class="home-label">Categories</div>
            <div class="category-breakdown">
                ${app.generateCategoryBreakdown()}
            </div>
            
            <div class="home-label" style="display: flex; align-items: center; justify-content: space-between;">
                <span>Changes <span class="changes-selected-meta" id="changes-selected-label" style="font-weight: 400; color: #c0c5cc;">${app.getActiveSelectedIds().length} selected · ${app.getRemainingCount()} remaining</span></span>
                <span style="display: flex; gap: 4px;">
                    <button class="btn-ghost-sm changes-bulk-btn" onclick="app.selectAllChanges()" ${app.getRemainingCount() === 0 ? 'disabled' : ''}>Select All</button>
                    <button class="btn-ghost-sm changes-bulk-btn" onclick="app.deselectAllChanges()" ${app.getRemainingCount() === 0 ? 'disabled' : ''}>Deselect All</button>
                </span>
            </div>
            <div class="change-details-list">
                ${app.generateChangeDetailsList()}
            </div>
            
            <div class="action-buttons-fixed">
                <button class="btn btn-secondary btn-action" onclick="app.showScreen('review-setup')">Back to Setup</button>
                <button class="btn btn-primary btn-action ${app.getRemainingCount() === 0 ? 'disabled' : ''}" onclick="app.applySelectedChanges()" ${app.getRemainingCount() === 0 ? 'disabled' : ''} title="${app.getRemainingCount() === 0 ? 'All redlines have been applied. Run a new review to generate more.' : 'Apply the selected redlines to the document'}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="12" y1="18" x2="12" y2="12"></line>
                        <line x1="9" y1="15" x2="15" y2="15"></line>
                    </svg>
                    Apply Selected
                </button>
            </div>
        `;
    },
    
    'recommendation-detail': () => {
        // Get recommendation from actual analysis results
        const change = app.currentAnalysisResult?.changes?.[app.currentRecommendation - 1];
        
        if (!change) {
            return `<div class="alert alert-warning">Recommendation not found</div>`;
        }
        
        // Generate title from clientComment
        const title = change.clientComment || `Change ${app.currentRecommendation}`;
        
        // Get the appropriate text fields based on change type
        let currentText = '';
        let suggestedText = '';
        
        switch (change.type) {
            case 'replace':
                currentText = change.searchText || '';
                suggestedText = change.replaceWith || '';
                break;
            case 'insert':
                currentText = change.afterText || '';
                suggestedText = `${change.afterText || ''}\n\n${change.insertText || ''}`;
                break;
            case 'delete':
                currentText = change.searchText || '';
                suggestedText = '[Text will be deleted]';
                break;
            case 'insertClause':
                if (!change.afterSection || change.afterSection.trim() === '') {
                    currentText = '[Insert at end of document]';
                } else {
                    currentText = `[After: ${change.afterSection}]`;
                }
                suggestedText = change.clauseContent || '';
                break;
            default:
                currentText = 'N/A';
                suggestedText = 'N/A';
        }
        
        // Use clientComment for all user-facing text
        const reasoning = change.clientComment || 'No explanation provided';
        const clientComment = change.clientComment || 'No comment provided';
        
        return `
        <button class="nav-btn" onclick="app.showScreen('results-dashboard')" aria-label="Back to results dashboard">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"></path>
            </svg>
            <span>Back</span>
        </button>
        <div class="recommendation-header">
            <div class="recommendation-number-large">${app.currentRecommendation}</div>
            <div class="recommendation-title-text">
                <div class="recommendation-label">Recommendation</div>
                <div class="recommendation-name">${title}</div>
            </div>
        </div>
        <div class="location-compact">
            <strong>Type:</strong> ${change.type} | ${app.getCategoryBadge(change.category)}
        </div>
        ${app.shouldShowAIReasoning() ? `
        <div class="section">
            <div class="section-header" onclick="app.toggleSection(this)">
                <div class="section-title"><span class="expand-arrow collapsed"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></span> AI Reasoning</div>
            </div>
            <div class="section-content collapsed">
                <div class="internal-analysis">
                    ${reasoning}
                </div>
            </div>
        </div>
        ` : ''}
        <div class="section">
            <div class="section-header" onclick="app.toggleSection(this)">
                <div class="section-title"><span class="expand-arrow collapsed"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></span> Current Language</div>
            </div>
            <div class="section-content collapsed">
                <div class="text-block">${currentText}</div>
            </div>
        </div>
        <div class="section">
            <div class="section-header">
                <div class="section-title">Recommended Change</div>
                <div class="recommendation-actions">
                    <button class="icon-btn-small" onclick="app.revertRecommendation(event, ${app.currentRecommendation})" title="Revert to Original AI Recommendation">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                            <path d="M21 3v5h-5"></path>
                            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                            <path d="M3 21v-5h5"></path>
                        </svg>
                    </button>
                    <button class="icon-btn-small" onclick="app.toggleEditMode(event, ${app.currentRecommendation})" title="Edit Recommendation Manually">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="section-content">
                <div class="text-block suggestion" id="recommendation-text-${app.currentRecommendation}">${suggestedText}</div>
                <textarea class="form-textarea" id="recommendation-edit-${app.currentRecommendation}" style="display: none;" rows="6">${suggestedText}</textarea>
                <input type="hidden" id="recommendation-original-${app.currentRecommendation}" value="${suggestedText.replace(/"/g, '&quot;')}" />
            </div>
        </div>
        <div class="section comment-section">
            <div class="section-header">
                <div class="section-title">Comment for Client (Optional)</div>
                <div class="recommendation-actions">
                    <button class="icon-btn-small" onclick="app.revertComment(event, ${app.currentRecommendation})" title="Revert to Original AI Comment">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                            <path d="M21 3v5h-5"></path>
                            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                            <path d="M3 21v-5h5"></path>
                        </svg>
                    </button>
                    <button class="icon-btn-small" onclick="app.toggleCommentEdit(event, ${app.currentRecommendation})" title="Edit Comment">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="section-content">
                <div class="comment-checkbox-container">
                    <label class="comment-checkbox">
                        <input type="checkbox" id="add-comment-${app.currentRecommendation}" ${app.shouldAutoApplyComments(app.currentRecommendation) ? 'checked' : ''} onchange="app.updateCommentOverride(${app.currentRecommendation}, this.checked)">
                        <span class="checkbox-label">Add as Word comment when applying change</span>
                    </label>
                </div>
                <div class="comment-content-wrapper">
                    <div class="comment-text-display" id="comment-text-${app.currentRecommendation}">${clientComment}</div>
                    <textarea class="form-textarea comment-textarea" id="comment-edit-${app.currentRecommendation}" style="display: none;" rows="5">${clientComment}</textarea>
                    <input type="hidden" id="comment-original-${app.currentRecommendation}" value="${clientComment.replace(/"/g, '&quot;')}" />
                </div>
            </div>
        </div>
        <div class="action-buttons">
            <button class="btn btn-danger" onclick="app.rejectRecommendation(${app.currentRecommendation})">✗ Reject Change</button>
            <button class="btn btn-success" onclick="app.applyRecommendation(${app.currentRecommendation})">✓ Apply Change</button>
        </div>
    `;
    },
    
    
    'chat-document': () => `
        <div class="screen-header">
            <div class="screen-title" style="font-size: 17px;">Chat with Contract</div>
            <div class="screen-nav">
                <button class="nav-btn" onclick="app.showScreen('home')" aria-label="Go to home screen">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 12H5M12 19l-7-7 7-7"></path>
                    </svg>
                    <span>Home</span>
                </button>
                <button class="nav-btn" onclick="app.startNewChat()" title="Start New Chat" aria-label="Start a new chat conversation">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    <span>New Chat</span>
                </button>
            </div>
        </div>
        
        <div class="chat-container">
            <div class="chat-messages" id="chat-messages">
                <!-- Initial Welcome Message -->
                <div class="chat-message agent">
                    <div class="chat-avatar">
                        <img src="../assets/GLN_logo-icon-Primary.png" alt="Glean" style="width: 24px; height: 24px;">
                    </div>
                    <div class="chat-bubble">
                        <div class="chat-text">Hello! I can help you analyze this contract. I have access to the full document text. What would you like to know?</div>
                        <div class="suggested-questions">
                            <button class="suggestion-btn" onclick="app.handleSuggestionClick('What are the payment terms?')">Payment terms</button>
                            <button class="suggestion-btn" onclick="app.handleSuggestionClick('What are the indemnification obligations?')">Indemnification</button>
                            <button class="suggestion-btn" onclick="app.handleSuggestionClick('Are there any unusual termination clauses?')">Termination clauses</button>
                            <button class="suggestion-btn" onclick="app.handleSuggestionClick('Summarize the key risks in this agreement')">Key risks</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="chat-input-container">
            <input type="text" class="chat-input" id="chat-input" placeholder="Ask about this contract..." onkeypress="if(event.key === 'Enter') app.handleChatSubmit()" />
            <button class="chat-send-btn" id="chat-send-btn" onclick="app.handleChatSubmit()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
        </div>
    `,
    
    
    
    settings: () => {
        const authMode = (window.GLEAN_DEFAULTS || {}).authMode || 'cognito';
        const isSSO = authMode === 'sso';
        return `
        <button class="nav-btn" onclick="app.showScreen('home')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span>Home</span>
        </button>
        <div class="screen-title">Settings</div>
        
        <div id="settings-feedback" style="display: none; padding: 12px; margin-bottom: 16px; border-radius: 6px; font-size: 14px;"></div>

        <!-- Auth Status Banner -->
        <div class="auth-status-banner ${isSSO ? 'auth-sso' : 'auth-cognito'}">
            <div class="auth-status-icon">
                ${isSSO
                    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>'
                    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>'
                }
            </div>
            <div class="auth-status-text">
                <span class="auth-status-label">${isSSO ? 'SSO (Glean OAuth)' : 'Local Login (Cognito)'}</span>
                <span class="auth-status-detail">${isSSO ? 'Authentication is managed automatically' : 'API token required for authentication'}</span>
            </div>
        </div>
        
        <!-- User Settings Section (always expanded) -->
        <div class="section">
            <div class="section-header"><div class="section-title">Your Settings</div></div>
            <div class="section-content">
                <!-- API Token - only shown in Cognito mode -->
                <div id="api-token-section" style="display: ${isSSO ? 'none' : 'block'};">
                    <div class="form-group">
                        <label class="form-label">API Token <span style="color: #ef4444;">*</span></label>
                        <div style="position: relative;">
                            <input type="password" id="setting-api-token" class="form-input" placeholder="Enter your Glean API token" style="padding-right: 40px;" />
                            <button onclick="app.togglePasswordVisibility('setting-api-token')" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #6b7280; padding: 4px;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            </button>
                        </div>
                        <div class="help-text">Required for API authentication. Get this from your Glean admin panel.</div>
                    </div>
                </div>
                
                <!-- Override fields (always visible) -->
                <div class="settings-override-hint">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                    Defaults are maintained by your administrators. Use the fields below if you need to override.
                </div>
                <div class="form-group">
                    <label class="form-label">Instance</label>
                    <input type="text" id="setting-instance" class="form-input" placeholder="Using default" />
                </div>
                <div class="form-group">
                    <label class="form-label">Chat Agent ID</label>
                    <input type="text" id="setting-chat-agent-id" class="form-input" placeholder="Using default" />
                </div>
                <div class="form-group">
                    <label class="form-label">Redliner Agent ID</label>
                    <input type="text" id="setting-redliner-agent-id" class="form-input" placeholder="Using default" />
                </div>
                <div class="form-group">
                    <label class="form-label">Listing Agent ID</label>
                    <input type="text" id="setting-listing-agent-id" class="form-input" placeholder="Using default" />
                </div>
            </div>
        </div>
        
        <!-- Deployment Admin Settings (admin-only, hidden by default) -->
        <div id="admin-settings-section" style="display: none;">
            <!-- Collapsed toggle header -->
            <div class="admin-section-toggle" id="admin-section-toggle" onclick="app.expandAdminSection()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"></path>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"></path>
                </svg>
                <span>Deployment Admin Settings</span>
                <span id="admin-section-arrow" class="toggle-arrow" style="margin-left: auto;">&#9656;</span>
            </div>
            
            <!-- Admin content (hidden until acknowledged via modal) -->
            <div id="admin-settings-content" style="display: none;">
                <div class="section">
                    <div class="section-header"><div class="section-title">Organization Defaults</div></div>
                    <div class="section-content">
                        <div class="form-group">
                            <label class="form-label">Glean Instance</label>
                            <input type="text" id="admin-instance" class="form-input" placeholder="e.g. acme-corp" />
                            <div class="help-text">Glean instance name for all users in this deployment.</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Chat Agent ID</label>
                            <input type="text" id="admin-chat-agent-id" class="form-input" />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Redliner Agent ID</label>
                            <input type="text" id="admin-redliner-agent-id" class="form-input" />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Listing Agent ID</label>
                            <input type="text" id="admin-listing-agent-id" class="form-input" />
                        </div>
                    </div>
                </div>
                
                <div class="section">
                    <div class="section-header"><div class="section-title">Default Playbook</div></div>
                    <div class="section-content">
                        <div class="form-group">
                            <label class="form-label">Display Name</label>
                            <input type="text" id="admin-playbook-name" class="form-input" placeholder="e.g. Standard NDA Playbook" />
                            <div class="help-text">Friendly name shown to users in the playbook dropdown.</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">URL</label>
                            <input type="text" id="admin-playbook-url" class="form-input" placeholder="https://drive.google.com/..." />
                            <div class="help-text">URL of the default playbook document.</div>
                        </div>
                    </div>
                </div>
                
                <div class="section">
                    <div class="section-header"><div class="section-title">Default Template</div></div>
                    <div class="section-content">
                        <div class="form-group">
                            <label class="form-label">Display Name</label>
                            <input type="text" id="admin-template-name" class="form-input" placeholder="e.g. Company Standard Template" />
                            <div class="help-text">Friendly name shown to users in the template dropdown.</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">URL</label>
                            <input type="text" id="admin-template-url" class="form-input" placeholder="https://drive.google.com/..." />
                            <div class="help-text">URL of the default template document.</div>
                        </div>
                    </div>
                </div>
                
                <div class="section">
                    <div class="section-header"><div class="section-title">Admin Emails</div></div>
                    <div class="section-content">
                        <div id="admin-emails-list" class="admin-emails-container">
                            <span style="color: #9ca3af; font-size: 12px;">Loading...</span>
                        </div>
                        <div class="admin-email-add-row">
                            <input type="text" id="admin-email-input" class="form-input" placeholder="user@company.com" onkeydown="if(event.key==='Enter'){app.addAdminEmail();}" />
                            <button class="admin-email-add-btn" onclick="app.addAdminEmail()">Add</button>
                        </div>
                    </div>
                </div>
                
                <div class="section">
                    <div class="section-header"><div class="section-title">Diagnostics</div></div>
                    <div class="section-content">
                        <button class="btn btn-secondary" style="width: 100%; justify-content: center; gap: 8px; display: flex; align-items: center;" onclick="app.showScreen('admin-tests')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                            Run Connection Tests
                        </button>
                        <div class="help-text">Test connectivity to all three agents using sample data.</div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Single action buttons at the bottom -->
        <div class="action-buttons">
            <button class="btn btn-secondary" onclick="app.cancelSettings()">Cancel</button>
            <button class="btn btn-primary" onclick="app.saveAllSettings()">Save</button>
        </div>
    `;
    },
    
    'applying-changes': () => `
        <div style="padding-top: 48px;"></div>
        <div class="progress-container">
            <div class="ai-orb-container" style="width: 96px; height: 96px; margin-bottom: 20px;">
                <div class="ai-orb-ring ai-orb-ring-1" style="width: 96px; height: 96px;"></div>
                <div class="ai-orb-ring ai-orb-ring-2" style="width: 76px; height: 76px;"></div>
                <div class="ai-orb-ring ai-orb-ring-3" style="width: 56px; height: 56px;"></div>
                <div class="ai-orb-glow" style="width: 64px; height: 64px;"></div>
                <div class="ai-orb-core" style="width: 40px; height: 40px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                </div>
            </div>
            <div class="progress-percentage" id="progress-percent">0%</div>
            <div id="progress-message">Enabling track changes...</div>
            <div id="progress-detail"></div>
            <div style="margin-top: 20px; width: 100%; max-width: 320px;">
                <div class="progress-bar-container">
                    <div class="progress-bar" id="apply-progress-bar" style="width: 0%"></div>
                </div>
                <div class="progress-stats" id="progress-stats">0 of 0 changes applied</div>
            </div>
        </div>
    `,
    
    'admin-tests': () => `
        <div class="screen-header">
            <div class="screen-title" style="font-size: 17px;">Connection Tests</div>
            <div class="screen-nav">
                <button class="nav-btn" onclick="app.showScreen('settings')" aria-label="Back to settings">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 12H5M12 19l-7-7 7-7"></path>
                    </svg>
                    <span>Settings</span>
                </button>
            </div>
        </div>
        <div class="help-text" style="margin-bottom: 16px;">Run end-to-end smoke tests against each agent using hardcoded sample contract data.</div>

        <div class="test-card" id="test-card-redliner">
            <div class="test-card-header">
                <div class="test-card-icon test-card-icon-blue">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><circle cx="11.5" cy="14.5" r="2.5"></circle><line x1="13.3" y1="16.3" x2="15" y2="18"></line></svg>
                </div>
                <div class="test-card-info">
                    <div class="test-card-title">Redliner Agent</div>
                    <div class="test-card-desc">Analyzes contract against template &amp; playbook</div>
                </div>
            </div>
            <div class="test-card-actions">
                <button class="btn btn-primary btn-sm" id="test-btn-redliner" onclick="app.runRedlinerTest()">Run</button>
            </div>
            <div class="test-card-result" id="test-result-redliner"></div>
        </div>

        <div class="test-card" id="test-card-chat">
            <div class="test-card-header">
                <div class="test-card-icon test-card-icon-indigo">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                </div>
                <div class="test-card-info">
                    <div class="test-card-title">Chat Agent</div>
                    <div class="test-card-desc">Asks &ldquo;What are the payment terms?&rdquo;</div>
                </div>
            </div>
            <div class="test-card-actions">
                <button class="btn btn-primary btn-sm" id="test-btn-chat" onclick="app.runChatTest()">Run</button>
            </div>
            <div class="test-card-result" id="test-result-chat"></div>
        </div>

        <div class="test-card" id="test-card-lister">
            <div class="test-card-header">
                <div class="test-card-icon test-card-icon-emerald">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                </div>
                <div class="test-card-info">
                    <div class="test-card-title">Listing Agent</div>
                    <div class="test-card-desc">Fetches templates or playbooks list</div>
                </div>
            </div>
            <div class="test-card-actions">
                <button class="btn btn-primary btn-sm" id="test-btn-lister-templates" onclick="app.runListerTest('Templates')">Templates</button>
                <button class="btn btn-primary btn-sm" id="test-btn-lister-playbooks" onclick="app.runListerTest('Playbooks')">Playbooks</button>
            </div>
            <div class="test-card-result" id="test-result-lister-templates"></div>
            <div class="test-card-result" id="test-result-lister-playbooks"></div>
        </div>
    `,

    'changes-applied': () => `
        <button class="nav-btn" onclick="app.showScreen('home')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span>Home</span>
        </button>
        <div class="success-screen">
            <div class="success-orb-container">
                <div class="success-orb-ring"></div>
                <div class="success-orb-glow"></div>
                <div class="success-orb-core">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>
            </div>
            <h2>Changes Applied</h2>
            <p id="changes-applied-summary" class="success-message">
                ${app.lastApplyResults ? app.lastApplyResults.getSummary() : 'Changes have been applied'}
            </p>
        </div>
        
        <div class="section">
            <div class="section-header">
                <div class="section-title">Next Steps</div>
            </div>
            <div class="section-content">
                <ol class="next-steps-list">
                    <li>
                        <strong>Review changes in Word</strong>
                        <div class="step-detail">Open the Review tab to see all tracked changes</div>
                    </li>
                    <li>
                        <strong>Accept or reject each change</strong>
                        <div class="step-detail">Use Word's Accept/Reject buttons to review each modification</div>
                    </li>
                    <li>
                        <strong>Save your document</strong>
                        <div class="step-detail">Save the document when you're done reviewing</div>
                    </li>
                </ol>
            </div>
        </div>
        
        <div id="failed-changes-section" class="section" style="display: ${app.lastApplyResults && app.lastApplyResults.failed.length > 0 ? 'block' : 'none'}">
            <div class="section-header">
                <div class="section-title">Changes Requiring Manual Review</div>
            </div>
            <div class="section-content">
                <div class="alert alert-warning">
                    ${app.lastApplyResults ? app.lastApplyResults.failed.length : 0} changes could not be applied automatically and may need manual review.
                </div>
                <div id="failed-changes-list" class="failed-changes-list">
                    ${app.generateFailedChangesList()}
                </div>
                <button class="btn btn-secondary" onclick="app.retryFailedChanges()">
                    Retry These Changes
                </button>
            </div>
        </div>
        
        <div class="action-buttons-fixed">
            <button class="btn btn-secondary" onclick="app.showScreen('results-dashboard')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;margin-right:4px;"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>Back to Results</button>
            <button class="btn btn-primary" onclick="app.showScreen('review-setup')">Run New Analysis</button>
        </div>
    `
};

    console.log('[SCREENS] Screens initialized successfully');
    
    // Notify app that screens are ready
    if (window.app.onScreensReady) {
        window.app.onScreensReady();
    }

})(); // End initScreens IIFE
