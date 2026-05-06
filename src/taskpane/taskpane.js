// Glean Legal Contract Review Add-in
// Entry point for webpack bundle

// Import styles
import './styles.css';

// Import Glean logo for webpack to process
import gleanLogo from '../../assets/GLN_logo-icon-Primary.png';

// Import application logic
import './app.js';
import './screens.js';

console.log('Taskpane bundle loaded');
console.log('Glean logo path:', gleanLogo);

// Make logo available globally for screens.js to use
window.GLEAN_LOGO_PATH = gleanLogo;

// Set header logo once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const headerLogo = document.getElementById('header-logo');
    if (headerLogo) {
        headerLogo.src = gleanLogo;
    }
});
